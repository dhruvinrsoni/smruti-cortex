// service-worker.ts — Core brain of SmrutiCortex

import { openDatabase } from './database';
import { ingestHistory } from './indexing';
import { runSearch } from './search/search-engine';
import { mergeMetadata } from './indexing';
import { browserAPI } from '../core/helpers';
import { Logger, LogLevel } from '../core/logger';
import { SettingsManager } from '../core/settings';

// Logger will be initialized below - don't log before that

let initialized = false;
const logger = Logger.forComponent('ServiceWorker');

// === ULTRA-FAST KEYBOARD SHORTCUT HANDLER ===
// Register command listener IMMEDIATELY at module load (before any async init)
// This ensures keyboard shortcuts work even during cold start
let commandsListenerRegistered = false;
function registerCommandsListenerEarly() {
  if (commandsListenerRegistered) {return;}
  if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
    browserAPI.commands.onCommand.addListener(async (command) => {
      if (command === 'open-popup') {
        const t0 = performance.now();
        logger.debug('onCommand', '🚀 Keyboard shortcut triggered');
        
        // Send message to content script to open inline overlay (FASTER than popup)
        try {
          const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
          if (tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://') && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome-extension://')) {
            try {
              // Try to send message to existing content script
              const response = await browserAPI.tabs.sendMessage(tab.id, { type: 'OPEN_INLINE_SEARCH' });
              if (response?.success) {
                logger.info('onCommand', `✅ Inline overlay opened in ${(performance.now() - t0).toFixed(1)}ms`);
                return; // Success - don't continue
              }
            } catch (msgError) {
              // Content script not loaded - inject it dynamically
              logger.debug('onCommand', 'Content script not loaded, injecting dynamically...');
              try {
                await browserAPI.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['content_scripts/quick-search.js']
                });
                // Wait a tiny bit for script to initialize
                await new Promise(resolve => setTimeout(resolve, 50));
                // Try again
                const response = await browserAPI.tabs.sendMessage(tab.id, { type: 'OPEN_INLINE_SEARCH' });
                if (response?.success) {
                  logger.info('onCommand', `✅ Inline overlay opened (after inject) in ${(performance.now() - t0).toFixed(1)}ms`);
                  return; // Success
                }
              } catch (injectError) {
                logger.debug('onCommand', 'Failed to inject content script', { error: (injectError as Error).message });
              }
            }
            // If we get here, inline failed - fall through to popup
            throw new Error('Inline overlay failed');
          } else {
            // Special page (chrome://, edge://, about:, extension page) - use popup
            logger.info('onCommand', `Special page detected (${tab?.url?.slice(0, 30)}...), using popup`);
            await browserAPI.action.openPopup();
            logger.info('onCommand', `✅ Popup opened in ${(performance.now() - t0).toFixed(1)}ms`);
          }
        } catch (e) {
          // Content script not loaded or page doesn't support it - fallback to popup
          const errorMsg = (e as Error).message || 'Unknown error';
          logger.info('onCommand', `Inline failed (${errorMsg}), falling back to popup`);
          try {
            await browserAPI.action.openPopup();
            logger.info('onCommand', `✅ Popup opened (fallback) in ${(performance.now() - t0).toFixed(1)}ms`);
          } catch {
            // Ignore - best effort
          }
        }
      }
    });
    commandsListenerRegistered = true;
  }
}
// Register immediately at module load
registerCommandsListenerEarly();

// Keep service worker alive to reduce cold start delays
function keepServiceWorkerAlive() {
  // Use multiple overlapping alarms to keep service worker active
  browserAPI.alarms.create('keep-alive-1', { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  browserAPI.alarms.create('keep-alive-2', { delayInMinutes: 1, periodInMinutes: 1 });
  browserAPI.alarms.create('keep-alive-3', { delayInMinutes: 2, periodInMinutes: 2 });

  browserAPI.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('keep-alive')) {
      // This keeps the service worker alive by doing minimal work
      // No logging to avoid performance impact
    }
  });

  // Aggressive keep-alive: listen to all possible events
  browserAPI.runtime.onStartup.addListener(() => {
    // Re-establish alarms on startup
    browserAPI.alarms.create('keep-alive-restart', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });

  browserAPI.runtime.onInstalled.addListener(() => {
    // Ensure alarms are set after install/update
    browserAPI.alarms.create('keep-alive-install', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });

  // Listen to tab events to stay active
  browserAPI.tabs.onActivated.addListener(() => {
    // Tab activation keeps us alive
  });

  browserAPI.tabs.onUpdated.addListener(() => {
    // Tab updates keep us alive
  });
}

// === PORT-BASED MESSAGING FOR QUICK-SEARCH ===
// Faster than one-shot messages for search-as-you-type scenarios
function setupPortBasedMessaging() {
  browserAPI.runtime.onConnect.addListener((port) => {
    if (port.name === 'quick-search') {
      logger.debug('onConnect', 'Quick-search port connected');
      
      port.onMessage.addListener(async (msg) => {
        if (msg.type === 'SEARCH_QUERY') {
          const t0 = performance.now();
          logger.debug('portMessage', `Quick-search query: "${msg.query}"`);
          
          if (!initialized) {
            port.postMessage({ error: 'Service worker not ready' });
            return;
          }
          
          try {
            const results = await runSearch(msg.query);
            logger.debug('portMessage', `Search completed in ${(performance.now() - t0).toFixed(2)}ms, results: ${results.length}`);
            port.postMessage({ results });
          } catch (error) {
            logger.error('portMessage', 'Search error:', error);
            port.postMessage({ error: (error as Error).message });
          }
        }
      });
      
      port.onDisconnect.addListener(() => {
        logger.debug('onDisconnect', 'Quick-search port disconnected');
      });
    }
  });
}
// Register port listener immediately
setupPortBasedMessaging();

(async function initLogger() {
  // Initialize logger first, then start logging
  await Logger.init();
  await SettingsManager.init();
  logger.info('initLogger', '[SmrutiCortex] Logger and settings initialized, starting main init');
  logger.debug('initLogger', 'Service worker script starting');

  // Set up messaging immediately
  logger.debug('initLogger', '[SmrutiCortex] Setting up message listeners');
  browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    logger.trace('onMessage', 'Message listener triggered with message:', msg);
    logger.trace('onMessage', 'Sender:', sender);
    (async () => {
      logger.trace('onMessage', 'Processing message asynchronously');
      try {
        logger.trace('onMessage', 'Message type:', msg.type);
        switch (msg.type) {
          case 'PING':
            logger.trace('onMessage', 'Handling PING');
            sendResponse({ status: 'ok' });
            break;
          case 'OPEN_SETTINGS':
            // Open the popup page in a new tab with #settings hash to auto-open modal
            logger.debug('onMessage', 'Handling OPEN_SETTINGS');
            browserAPI.tabs.create({ url: browserAPI.runtime.getURL('popup/popup.html#settings') });
            sendResponse({ status: 'ok' });
            break;
          case 'GET_LOG_LEVEL':
            // Return current log level to content scripts
            logger.trace('onMessage', 'Handling GET_LOG_LEVEL');
            sendResponse({ logLevel: Logger.getLevel() });
            break;
          case 'SET_LOG_LEVEL':
            logger.info('onMessage', '[SmrutiCortex] Handling SET_LOG_LEVEL:', msg.level);
            await Logger.setLevel(msg.level);
            logger.info('onMessage', '[SmrutiCortex] Log level set to', Logger.getLevel());
            sendResponse({ status: 'ok' });
            break;
          case 'SETTINGS_CHANGED':
            logger.debug('onMessage', 'Handling SETTINGS_CHANGED:', msg.settings);
            
            // CRITICAL: Update SettingsManager cache with new settings
            // This ensures search-engine reads fresh ollamaEnabled value
            if (msg.settings) {
              await SettingsManager.updateSettings(msg.settings);
              logger.debug('onMessage', 'SettingsManager cache updated with new settings');
            }
            
            // Check if log level changed and update logger if needed
            if (msg.settings && typeof msg.settings.logLevel === 'number') {
              const currentLevel = Logger.getLevel();
              if (currentLevel !== msg.settings.logLevel) {
                Logger.setLevelInternal(msg.settings.logLevel);
                logger.info('onMessage', '[SmrutiCortex] Log level updated from SETTINGS_CHANGED', {
                  from: currentLevel,
                  to: msg.settings.logLevel,
                  levelName: LogLevel[msg.settings.logLevel]
                });
              }
            }
            sendResponse({ status: 'ok' });
            break;
          case 'POPUP_PERF_LOG':
            // Log popup performance timing info
            logger.info('onMessage', `[PopupPerf] ${msg.stage} | ts=${msg.timestamp} | elapsedMs=${msg.elapsedMs}`);
            sendResponse({ status: 'ok' });
            break;
          default:
            // For other messages, check if initialized
            if (!initialized) {
              logger.debug('onMessage', 'Service worker not initialized yet, rejecting message:', msg.type);
              sendResponse({ error: 'Service worker not ready' });
              break;
            }
            switch (msg.type) {
              case 'SEARCH_QUERY': {
                logger.info('onMessage', `Popup search: "${msg.query}"`);
                const results = await runSearch(msg.query);
                logger.debug('onMessage', 'Search completed, results:', results.length);
                sendResponse({ results });
                break;
              }

              case 'REBUILD_INDEX':
                logger.debug('onMessage', 'Handling REBUILD_INDEX');
                await ingestHistory();
                sendResponse({ status: 'OK' });
                break;

              // inside messaging onMessage handler
              case 'METADATA_CAPTURE': {
                logger.debug('onMessage', 'Handling METADATA_CAPTURE for:', msg.payload.url);
                const { payload } = msg;
                // call mergeMetadata (implementation in indexing.ts)
                await mergeMetadata(payload.url, {
                  description: payload.metaDescription,
                  keywords: payload.metaKeywords
                });
                sendResponse({ status: 'ok' });
                break;
              }

              default:
                logger.warn('onMessage', 'Unknown message type received:', msg.type);
                sendResponse({ error: 'Unknown message type' });
            }
        }
        logger.trace('onMessage', 'Message processing completed');
      } catch (error) {
        logger.error('onMessage', 'Error processing message:', error);
        sendResponse({ error: error.message });
      }
    })();
    logger.trace('onMessage', 'Returning true for async response');
    return true; // async response
  });

  // Now start the main initialization
  await init();
})();

async function init() {
    logger.info('init', '[SmrutiCortex] Init function called');
    try {
        logger.debug('init', 'Initializing service worker…');

        logger.info('init', '🗄️ Opening database...');
        await openDatabase();
        logger.info('init', '✅ Database ready');

        // Always perform indexing on startup (smart indexing will decide what to do)
        logger.info('init', '🔄 Starting history indexing...');
        await ingestHistory();
        logger.info('init', '✅ History indexing complete');

        // Listen for new visits (incremental updates with debouncing)
        logger.debug('init', 'Setting up history listener for incremental updates');
        browserAPI.history.onVisited.addListener(async (item) => {
            logger.trace('onVisited', 'New visit detected, scheduling incremental index:', item.url);
            // Debounce incremental indexing to avoid too frequent updates
            if (this.indexingTimeout) {
                clearTimeout(this.indexingTimeout);
            }
            this.indexingTimeout = setTimeout(async () => {
                logger.debug('onVisited', 'Performing debounced incremental indexing');
                await ingestHistory();
            }, 10000); // Wait 10 seconds after last visit before indexing
        });

        // Set up messaging
        logger.debug('init', 'Setting up messaging');

        initialized = true;
        logger.debug('init', 'Service worker initialized flag set');

        // Keep service worker alive to reduce cold start delays for keyboard shortcuts
        keepServiceWorkerAlive();

        // Command listener is already registered at module load level for ultra-fast response
        // Just ensure it's registered if not already
        registerCommandsListenerEarly();

        logger.info('init', 'Service worker ready.');
        logger.info('init', '[SmrutiCortex] Service worker ready');
    } catch (error) {
        logger.error('init', 'Init error:', error);
        logger.error('init', '[SmrutiCortex] Init error:', error);
    }
}