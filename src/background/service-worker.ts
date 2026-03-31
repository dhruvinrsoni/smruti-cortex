// service-worker.ts — Core brain of SmrutiCortex
//
// === Zero-Downtime Extension Updates ===
// SmrutiCortex uses a 3-tier keyboard shortcut strategy that ensures the
// extension NEVER feels broken — even mid-update:
//   1. Try the in-page quick-search overlay (fastest, most modern UX)
//   2. If the content script is stale after an extension update, re-inject
//      it on-the-fly via chrome.scripting and retry (seamless recovery)
//   3. If injection isn't possible (restricted page, permissions), gracefully
//      fall back to the classic popup (always works, zero failures)
// The user never sees an error. They either get quick-search or the popup.

import { openDatabase, getStorageQuotaInfo, setForceRebuildFlag, getForceRebuildFlag, getAllIndexedItems, saveIndexedItem } from './database';
import { ingestHistory, performFullRebuild } from './indexing';
import { runSearch } from './search/search-engine';
import { mergeMetadata } from './indexing';
import { browserAPI } from '../core/helpers';
import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { clearAndRebuild, checkHealth, selfHeal, startHealthMonitoring } from './resilience';

// Logger will be initialized below - don't log before that

let initialized = false;
let initializationPromise: Promise<void> | null = null;
const logger = Logger.forComponent('ServiceWorker');

// === ULTRA-FAST KEYBOARD SHORTCUT HANDLER ===
// Register command listener IMMEDIATELY at module load (before any async init)
// This ensures keyboard shortcuts work even during cold start
let commandsListenerRegistered = false;

// Helper: Send message to content script with timeout
function sendMessageWithTimeout<T = unknown>(tabId: number, message: unknown, timeoutMs: number = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Content script response timeout'));
    }, timeoutMs);
    
    browserAPI.tabs.sendMessage(tabId, message, (response: T) => {
      clearTimeout(timer);
      if (browserAPI.runtime.lastError) {
        reject(new Error(browserAPI.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Re-inject content script into a single tab (used after extension update).
// Requires "scripting" + "activeTab" permissions. activeTab is granted
// automatically when the user presses the registered keyboard shortcut,
// so Tier 2 re-injection works on both Chrome and Edge without broad host_permissions.
async function reinjectContentScript(tabId: number): Promise<boolean> {
  try {
    await (browserAPI as typeof chrome).scripting.executeScript({
      target: { tabId },
      files: ['content_scripts/quick-search.js'],
    });
    return true;
  } catch {
    return false;
  }
}

function registerCommandsListenerEarly() {
  if (commandsListenerRegistered) {return;}
  if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
    browserAPI.commands.onCommand.addListener(async (command) => {
      if (command === 'open-popup') {
        const t0 = performance.now();
        logger.debug('onCommand', '🚀 Keyboard shortcut triggered');
        
        try {
          const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
          if (tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://') && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('moz-extension://')) {

            // --- Tier 1: Try existing content script ---
            try {
              const response = await sendMessageWithTimeout<{ success?: boolean }>(tab.id, { type: 'OPEN_INLINE_SEARCH' }, 300);
              if (response?.success) {
                logger.debug('onCommand', `✅ Quick-search opened in ${(performance.now() - t0).toFixed(1)}ms`);
                return;
              }
            } catch {
              // Content script stale or missing — continue to Tier 2
            }

            // --- Tier 2: Re-inject content script and retry ---
            // After an extension update, the old content script's runtime context is
            // invalidated. Re-inject a fresh copy and try once more before giving up.
            try {
              const injected = await reinjectContentScript(tab.id);
              if (injected) {
                await new Promise(r => setTimeout(r, 150));
                const retryResponse = await sendMessageWithTimeout<{ success?: boolean }>(tab.id, { type: 'OPEN_INLINE_SEARCH' }, 400);
                if (retryResponse?.success) {
                  logger.info('onCommand', `✅ Quick-search opened after re-injection in ${(performance.now() - t0).toFixed(1)}ms`);
                  return;
                }
              }
            } catch {
              // Re-injection or retry failed — continue to Tier 3
            }

            // --- Tier 3: Popup fallback (always works) ---
            logger.info('onCommand', 'Quick-search unavailable, opening popup');
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened (fallback) in ${(performance.now() - t0).toFixed(1)}ms`);

          } else {
            // Special page (chrome://, edge://, about:) — popup is the only option
            logger.info('onCommand', `Special page detected (${tab?.url?.slice(0, 30)}...), using popup`);
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened in ${(performance.now() - t0).toFixed(1)}ms`);
          }
        } catch (e) {
          const errorMsg = (e as Error).message || 'Unknown error';
          logger.info('onCommand', `All tiers failed (${errorMsg}), last-resort popup`);
          try {
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
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
      
      let portDisconnected = false;

      port.onMessage.addListener(async (msg) => {
        if (msg.type === 'SEARCH_QUERY') {
          const t0 = performance.now();
          logger.debug('portMessage', `Quick-search query: "${msg.query}"`);

          if (!initialized) {
            // SW is still starting up — wait for it rather than failing the search
            if (initializationPromise) {
              try { await initializationPromise; } catch {
                try { port.postMessage({ error: 'Service worker not ready' }); } catch { /* port closed */ }
                return;
              }
            } else {
              try { port.postMessage({ error: 'Service worker not ready' }); } catch { /* port closed */ }
              return;
            }
          }

          try {
            const { getLastAIStatus } = await import('./search/search-engine');
            const results = await runSearch(msg.query, { skipAI: !!msg.skipAI });
            const aiStatus = getLastAIStatus();
            logger.debug('portMessage', `Search completed in ${(performance.now() - t0).toFixed(2)}ms, results: ${results.length}`);
            if (!portDisconnected) {
              try { port.postMessage({ results, aiStatus, query: msg.query, skipAI: !!msg.skipAI }); } catch { /* port closed during async search */ }
            }
          } catch (error) {
            logger.error('portMessage', 'Search error:', error);
            if (!portDisconnected) {
              try { port.postMessage({ error: (error as Error).message, query: msg.query, skipAI: !!msg.skipAI }); } catch { /* port closed */ }
            }
          }
        }
      });
      
      port.onDisconnect.addListener(() => {
        portDisconnected = true;
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
          case 'SETTINGS_CHANGED': {
            logger.debug('onMessage', 'Handling SETTINGS_CHANGED:', msg.settings);

            // Use applyRemoteSettings — updates cache + storage but does NOT
            // re-broadcast. This breaks the infinite ping-pong loop between
            // popup ↔ service worker that was causing 2.7GB+ memory leaks.
            if (msg.settings) {
              // Track old values before applying
              const wasEmbeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
              const oldEmbeddingModel = SettingsManager.getSetting('embeddingModel') || 'nomic-embed-text';

              await SettingsManager.applyRemoteSettings(msg.settings);
              logger.debug('onMessage', 'SettingsManager cache updated (no re-broadcast)');

              // Clear search cache when settings change — ensures AI features
              // take effect immediately instead of serving stale cached results
              const { clearSearchCache } = await import('./search/search-cache');
              clearSearchCache();
              logger.debug('onMessage', 'Search cache cleared after settings change');

              // Manage embedding processor based on setting changes
              const nowEmbeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
              const nowEmbeddingModel = SettingsManager.getSetting('embeddingModel') || 'nomic-embed-text';
              const { embeddingProcessor } = await import('./embedding-processor');

              if (!wasEmbeddingsEnabled && nowEmbeddingsEnabled) {
                logger.info('onMessage', '🧠 Embeddings enabled — starting background processor');
                embeddingProcessor.start();
              } else if (wasEmbeddingsEnabled && !nowEmbeddingsEnabled) {
                logger.info('onMessage', '🧠 Embeddings disabled — stopping background processor');
                embeddingProcessor.stop();
              } else if (nowEmbeddingsEnabled && oldEmbeddingModel !== nowEmbeddingModel) {
                logger.info('onMessage', `🧠 Embedding model changed (${oldEmbeddingModel} → ${nowEmbeddingModel}) — stopping processor`);
                embeddingProcessor.stop();
              }
            }
            sendResponse({ status: 'ok' });
            break;
          }
          case 'POPUP_PERF_LOG':
            // Log popup performance timing info
            logger.info('onMessage', `[PopupPerf] ${msg.stage} | ts=${msg.timestamp} | elapsedMs=${msg.elapsedMs}`);
            sendResponse({ status: 'ok' });
            break;
          case 'GET_PERFORMANCE_METRICS': {
            // Performance metrics work even before full initialization
            logger.debug('onMessage', 'GET_PERFORMANCE_METRICS requested');
            try {
              const { getPerformanceMetrics, formatMetricsForDisplay } = await import('./performance-monitor');
              const metrics = getPerformanceMetrics();
              const formatted = formatMetricsForDisplay(metrics);
              sendResponse({ status: 'OK', metrics, formatted });
            } catch (error) {
              logger.error('onMessage', 'GET_PERFORMANCE_METRICS failed:', error);
              sendResponse({ status: 'ERROR', message: (error as Error).message });
            }
            break;
          }
          case 'EXPORT_DIAGNOSTICS': {
            // Diagnostics export works even before full initialization
            logger.info('onMessage', '📋 EXPORT_DIAGNOSTICS requested');
            try {
              const { exportDiagnosticsAsJson } = await import('./diagnostics');
              const diagnosticsJson = await exportDiagnosticsAsJson();
              logger.info('onMessage', '✅ EXPORT_DIAGNOSTICS completed');
              sendResponse({ status: 'OK', data: diagnosticsJson });
            } catch (error) {
              logger.error('onMessage', 'EXPORT_DIAGNOSTICS failed:', error);
              sendResponse({ status: 'ERROR', message: (error as Error).message });
            }
            break;
          }
          case 'GET_SEARCH_ANALYTICS': {
            try {
              const { getSearchAnalytics } = await import('./diagnostics');
              const analytics = getSearchAnalytics();
              sendResponse({ status: 'OK', ...analytics });
            } catch (error) {
              sendResponse({ status: 'ERROR', message: (error as Error).message });
            }
            break;
          }
          case 'EXPORT_SEARCH_DEBUG': {
            try {
              const { getSearchHistory } = await import('./diagnostics');
              const history = getSearchHistory();
              const data = JSON.stringify({ history, exportTimestamp: Date.now() }, null, 2);
              sendResponse({ status: 'OK', data });
            } catch (error) {
              sendResponse({ status: 'ERROR', message: (error as Error).message });
            }
            break;
          }
          case 'GET_SEARCH_DEBUG_ENABLED': {
            try {
              const { isSearchDebugEnabled } = await import('./diagnostics');
              const enabled = isSearchDebugEnabled();
              sendResponse({ status: 'OK', enabled });
            } catch (error) {
              sendResponse({ status: 'ERROR', message: (error as Error).message });
            }
            break;
          }
          case 'SET_SEARCH_DEBUG_ENABLED': {
            try {
              const { setSearchDebugEnabled } = await import('./diagnostics');
              await setSearchDebugEnabled(msg.enabled ?? false);
              sendResponse({ status: 'OK' });
            } catch (error) {
              sendResponse({ status: 'ERROR', message: (error as Error).message });
            }
            break;
          }
          case 'GET_SETTINGS': {
            // Settings are available immediately after SettingsManager.init() (before full init)
            const settings = SettingsManager.getSettings();
            sendResponse({ status: 'OK', settings });
            break;
          }
          default:
            // For other messages, wait for initialization rather than failing immediately
            if (!initialized) {
              if (initializationPromise) {
                logger.debug('onMessage', 'Service worker initializing, waiting for init before handling:', msg.type);
                try { await initializationPromise; } catch {
                  sendResponse({ error: 'Service worker not ready' });
                  break;
                }
              } else {
                logger.debug('onMessage', 'Service worker not initialized yet, rejecting message:', msg.type);
                sendResponse({ error: 'Service worker not ready' });
                break;
              }
            }
            switch (msg.type) {
              case 'SEARCH_QUERY': {
                logger.info('onMessage', `Popup search: "${msg.query}" (skipAI: ${!!msg.skipAI})`);
                const { getLastAIStatus } = await import('./search/search-engine');
                const results = await runSearch(msg.query, { skipAI: !!msg.skipAI });
                const aiStatus = getLastAIStatus();
                logger.debug('onMessage', 'Search completed, results:', results.length);
                sendResponse({ results, aiStatus, query: msg.query, skipAI: !!msg.skipAI });
                break;
              }

              case 'GET_RECENT_HISTORY': {
                logger.debug('onMessage', `GET_RECENT_HISTORY requested with limit: ${msg.limit || 50}`);
                try {
                  const { getRecentIndexedItems } = await import('./database');
                  const recentItems = await getRecentIndexedItems(msg.limit || 50);
                  logger.debug('onMessage', `GET_RECENT_HISTORY completed, items: ${recentItems.length}`);
                  sendResponse({ results: recentItems });
                } catch (error) {
                  logger.error('onMessage', 'GET_RECENT_HISTORY failed:', error);
                  sendResponse({ results: [] });
                }
                break;
              }

              case 'REBUILD_INDEX': {
                logger.info('onMessage', '🔄 REBUILD_INDEX requested by user');
                try {
                  await performFullRebuild();
                  logger.info('onMessage', '✅ REBUILD_INDEX completed successfully');
                  sendResponse({ status: 'OK', message: 'Index rebuilt successfully' });
                } catch (error) {
                  logger.error('onMessage', '❌ REBUILD_INDEX failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'INDEX_BOOKMARKS': {
                logger.info('onMessage', '📚 INDEX_BOOKMARKS requested by user');
                try {
                  const { performBookmarksIndex } = await import('./indexing');
                  const result = await performBookmarksIndex(true);
                  logger.info('onMessage', '✅ INDEX_BOOKMARKS completed', result);
                  sendResponse({ status: 'OK', ...result });
                } catch (error) {
                  logger.error('onMessage', '❌ INDEX_BOOKMARKS failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'MANUAL_INDEX': {
                logger.info('onMessage', '⚡ MANUAL_INDEX requested by user');
                try {
                  const { performIncrementalHistoryIndexManual } = await import('./indexing');
                  const { getSetting, setSetting } = await import('./database');
                  
                  // Get last indexed timestamp from settings
                  const lastIndexedTimestamp = await getSetting<number>('lastIndexedTimestamp', 0);
                  logger.debug('onMessage', 'MANUAL_INDEX: Last indexed timestamp', { lastIndexedTimestamp });
                  
                  // Perform incremental indexing from last timestamp
                  const result = await performIncrementalHistoryIndexManual(lastIndexedTimestamp);
                  
                  // Update last indexed timestamp
                  await setSetting('lastIndexedTimestamp', Date.now());
                  
                  logger.info('onMessage', '✅ MANUAL_INDEX completed', result);
                  sendResponse({ status: 'OK', ...result });
                } catch (error) {
                  logger.error('onMessage', '❌ MANUAL_INDEX failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'CLEAR_ALL_DATA': {
                logger.info('onMessage', '🗑️ CLEAR_ALL_DATA requested by user');
                try {
                  // Use clearAndRebuild for immediate self-healing
                  const result = await clearAndRebuild();
                  
                  if (result.success) {
                    logger.info('onMessage', '✅ CLEAR_ALL_DATA completed', { itemCount: result.itemCount });
                    sendResponse({ status: 'OK', message: result.message, itemCount: result.itemCount });
                  } else {
                    logger.error('onMessage', '❌ CLEAR_ALL_DATA failed', { message: result.message });
                    sendResponse({ status: 'ERROR', message: result.message });
                  }
                } catch (error) {
                  logger.error('onMessage', '❌ CLEAR_ALL_DATA failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'GET_STORAGE_QUOTA': {
                logger.debug('onMessage', 'GET_STORAGE_QUOTA requested');
                try {
                  const quotaInfo = await getStorageQuotaInfo();
                  logger.debug('onMessage', 'Storage quota retrieved', quotaInfo);
                  sendResponse({ status: 'OK', data: quotaInfo });
                } catch (error) {
                  logger.error('onMessage', 'GET_STORAGE_QUOTA failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'EXPORT_INDEX': {
                logger.info('onMessage', '📥 EXPORT_INDEX requested');
                try {
                  const items = await getAllIndexedItems();
                  const exportData = {
                    version: chrome.runtime.getManifest().version,
                    exportDate: new Date().toISOString(),
                    itemCount: items.length,
                    items,
                  };
                  sendResponse({ status: 'OK', data: exportData });
                } catch (error) {
                  logger.error('onMessage', '❌ EXPORT_INDEX failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'IMPORT_INDEX': {
                logger.info('onMessage', '📤 IMPORT_INDEX requested', { count: msg.items?.length });
                try {
                  const items = msg.items as Array<Record<string, unknown>>;
                  if (!Array.isArray(items)) {
                    sendResponse({ status: 'ERROR', message: 'Invalid import data: items must be an array' });
                    break;
                  }
                  let imported = 0;
                  let skipped = 0;
                  for (const item of items) {
                    if (typeof item.url === 'string' && typeof item.title === 'string' && typeof item.lastVisit === 'number') {
                      await saveIndexedItem(item as unknown as import('./schema').IndexedItem);
                      imported++;
                    } else {
                      skipped++;
                    }
                  }
                  logger.info('onMessage', '✅ IMPORT_INDEX completed', { imported, skipped });
                  sendResponse({ status: 'OK', imported, skipped });
                } catch (error) {
                  logger.error('onMessage', '❌ IMPORT_INDEX failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'CLEAR_FAVICON_CACHE': {
                logger.info('onMessage', '🖼️ CLEAR_FAVICON_CACHE requested');
                try {
                  const { clearFaviconCache } = await import('./favicon-cache');
                  const result = await clearFaviconCache();
                  logger.info('onMessage', '✅ CLEAR_FAVICON_CACHE completed', result);
                  sendResponse({ status: 'OK', ...result });
                } catch (error) {
                  logger.error('onMessage', '❌ CLEAR_FAVICON_CACHE failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'GET_FAVICON_CACHE_STATS': {
                logger.debug('onMessage', 'GET_FAVICON_CACHE_STATS requested');
                try {
                  const { getFaviconCacheStats } = await import('./favicon-cache');
                  const stats = await getFaviconCacheStats();
                  sendResponse({ status: 'OK', ...stats });
                } catch (error) {
                  logger.error('onMessage', 'GET_FAVICON_CACHE_STATS failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'GET_FAVICON': {
                const hostname = msg.hostname as string;
                logger.trace('onMessage', 'GET_FAVICON requested:', hostname);
                try {
                  const { getFaviconWithCache } = await import('./favicon-cache');
                  const dataUrl = await getFaviconWithCache(hostname);
                  sendResponse({ dataUrl });
                } catch (error) {
                  logger.warn('onMessage', 'GET_FAVICON failed:', error);
                  sendResponse({ dataUrl: null });
                }
                break;
              }

              case 'GET_HEALTH_STATUS': {
                logger.debug('onMessage', 'GET_HEALTH_STATUS requested');
                try {
                  const health = await checkHealth();
                  logger.debug('onMessage', 'Health status retrieved', health);
                  sendResponse({ status: 'OK', data: health });
                } catch (error) {
                  logger.error('onMessage', 'GET_HEALTH_STATUS failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'SELF_HEAL': {
                logger.info('onMessage', '🔧 SELF_HEAL requested by user');
                try {
                  const success = await selfHeal('User requested self-heal');
                  const health = await checkHealth();
                  sendResponse({ 
                    status: success ? 'OK' : 'PARTIAL', 
                    message: success ? 'Self-heal completed successfully' : 'Self-heal completed with issues',
                    data: health
                  });
                } catch (error) {
                  logger.error('onMessage', 'SELF_HEAL failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'GET_EMBEDDING_STATS': {
                logger.debug('onMessage', 'GET_EMBEDDING_STATS requested');
                try {
                  const { getAllIndexedItems } = await import('./database');
                  const items = await getAllIndexedItems();
                  const withEmbeddings = items.filter(i => i.embedding && i.embedding.length > 0);
                  const totalDims = withEmbeddings.reduce((sum, i) => sum + (i.embedding?.length || 0), 0);
                  const estimatedBytes = totalDims * 8; // ~8 bytes per float64 dimension
                  const { SettingsManager } = await import('../core/settings');
                  const embeddingModel = SettingsManager.getSetting('embeddingModel') || 'nomic-embed-text';
                  sendResponse({
                    status: 'OK',
                    total: items.length,
                    withEmbeddings: withEmbeddings.length,
                    estimatedBytes,
                    embeddingModel,
                  });
                } catch (error) {
                  logger.error('onMessage', 'GET_EMBEDDING_STATS failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'CLEAR_ALL_EMBEDDINGS': {
                logger.info('onMessage', '🧠 CLEAR_ALL_EMBEDDINGS requested');
                try {
                  // Stop the background processor first
                  const { embeddingProcessor } = await import('./embedding-processor');
                  embeddingProcessor.stop();

                  const { getAllIndexedItems, saveIndexedItem } = await import('./database');
                  const items = await getAllIndexedItems();
                  let cleared = 0;
                  for (const item of items) {
                    if (item.embedding && item.embedding.length > 0) {
                      item.embedding = undefined;
                      await saveIndexedItem(item);
                      cleared++;
                    }
                  }
                  logger.info('onMessage', `✅ Cleared embeddings from ${cleared} items`);
                  sendResponse({ status: 'OK', cleared });
                } catch (error) {
                  logger.error('onMessage', 'CLEAR_ALL_EMBEDDINGS failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              // === EMBEDDING PROCESSOR CONTROLS ===
              case 'START_EMBEDDING_PROCESSOR': {
                logger.info('onMessage', '🧠 START_EMBEDDING_PROCESSOR requested');
                try {
                  const { embeddingProcessor } = await import('./embedding-processor');
                  await embeddingProcessor.start();
                  sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
                } catch (error) {
                  logger.error('onMessage', 'START_EMBEDDING_PROCESSOR failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'PAUSE_EMBEDDING_PROCESSOR': {
                logger.info('onMessage', '⏸ PAUSE_EMBEDDING_PROCESSOR requested');
                try {
                  const { embeddingProcessor } = await import('./embedding-processor');
                  embeddingProcessor.pause();
                  sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
                } catch (error) {
                  logger.error('onMessage', 'PAUSE_EMBEDDING_PROCESSOR failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'RESUME_EMBEDDING_PROCESSOR': {
                logger.info('onMessage', '▶ RESUME_EMBEDDING_PROCESSOR requested');
                try {
                  const { embeddingProcessor } = await import('./embedding-processor');
                  embeddingProcessor.resume();
                  sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
                } catch (error) {
                  logger.error('onMessage', 'RESUME_EMBEDDING_PROCESSOR failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'GET_EMBEDDING_PROGRESS': {
                try {
                  const { embeddingProcessor } = await import('./embedding-processor');
                  sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
                } catch (error) {
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'GET_AI_CACHE_STATS': {
                logger.debug('onMessage', 'GET_AI_CACHE_STATS requested');
                try {
                  const { loadCache, getCacheStats } = await import('./ai-keyword-cache');
                  await loadCache();
                  const stats = getCacheStats();
                  sendResponse({ status: 'OK', ...stats });
                } catch (error) {
                  logger.error('onMessage', 'GET_AI_CACHE_STATS failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              case 'CLEAR_AI_CACHE': {
                logger.info('onMessage', '📝 CLEAR_AI_CACHE requested');
                try {
                  const { clearAIKeywordCache } = await import('./ai-keyword-cache');
                  const result = await clearAIKeywordCache();
                  sendResponse({ status: 'OK', ...result });
                } catch (error) {
                  logger.error('onMessage', 'CLEAR_AI_CACHE failed:', error);
                  sendResponse({ status: 'ERROR', message: (error as Error).message });
                }
                break;
              }

              // ===== COMMAND PALETTE: Tab, Bookmark, Window, and utility handlers =====

              case 'GET_OPEN_TABS': {
                const tabs = await browserAPI.tabs.query({});
                sendResponse({ tabs });
                break;
              }

              case 'SWITCH_TO_TAB': {
                const { tabId, windowId } = msg;
                await browserAPI.tabs.update(tabId, { active: true });
                await browserAPI.windows.update(windowId, { focused: true });
                sendResponse({ status: 'OK' });
                break;
              }

              case 'CLOSE_TAB': {
                const senderTabId = sender.tab?.id;
                const targetTabId = msg.tabId ?? senderTabId;
                if (targetTabId) {
                  await browserAPI.tabs.remove(targetTabId);
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab to close' });
                }
                break;
              }

              case 'DUPLICATE_TAB': {
                const dupTabId = msg.tabId ?? sender.tab?.id;
                if (dupTabId) {
                  await browserAPI.tabs.duplicate(dupTabId);
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab to duplicate' });
                }
                break;
              }

              case 'PIN_TAB': {
                const pinTabId = msg.tabId ?? sender.tab?.id;
                if (pinTabId) {
                  const tab = await browserAPI.tabs.get(pinTabId);
                  await browserAPI.tabs.update(pinTabId, { pinned: !tab.pinned });
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab to pin' });
                }
                break;
              }

              case 'MUTE_TAB': {
                const muteTabId = msg.tabId ?? sender.tab?.id;
                if (muteTabId) {
                  const tab = await browserAPI.tabs.get(muteTabId);
                  await browserAPI.tabs.update(muteTabId, { muted: !tab.mutedInfo?.muted });
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab to mute' });
                }
                break;
              }

              case 'GET_RECENTLY_CLOSED': {
                try {
                  const sessions = await new Promise<chrome.sessions.Session[]>((resolve) => {
                    browserAPI.sessions.getRecentlyClosed({ maxResults: 10 }, resolve);
                  });
                  sendResponse({ sessions });
                } catch (err) {
                  sendResponse({ sessions: [], error: (err as Error).message });
                }
                break;
              }

              case 'REOPEN_TAB': {
                try {
                  await browserAPI.sessions.restore(msg.sessionId);
                  sendResponse({ status: 'OK' });
                } catch (err) {
                  sendResponse({ error: (err as Error).message });
                }
                break;
              }

              case 'SEARCH_BOOKMARKS': {
                try {
                  const bookmarks = await browserAPI.bookmarks.search(msg.query || '');
                  const withPaths = await Promise.all(
                    bookmarks.filter((b: chrome.bookmarks.BookmarkTreeNode) => b.url).map(async (b: chrome.bookmarks.BookmarkTreeNode) => {
                      let folderPath = '';
                      try {
                        let parentId = b.parentId;
                        const parts: string[] = [];
                        while (parentId && parentId !== '0') {
                          const parents = await browserAPI.bookmarks.get(parentId);
                          if (parents[0]?.title) parts.unshift(parents[0].title);
                          parentId = parents[0]?.parentId;
                        }
                        folderPath = parts.join(' > ');
                      } catch { /* root node */ }
                      return { ...b, folderPath };
                    })
                  );
                  sendResponse({ bookmarks: withPaths });
                } catch (err) {
                  sendResponse({ bookmarks: [], error: (err as Error).message });
                }
                break;
              }

              case 'GET_RECENT_BOOKMARKS': {
                try {
                  const bookmarks = await browserAPI.bookmarks.getRecent(15);
                  sendResponse({ bookmarks });
                } catch (err) {
                  sendResponse({ bookmarks: [], error: (err as Error).message });
                }
                break;
              }

              case 'ADD_BOOKMARK': {
                try {
                  const tab = sender.tab;
                  if (tab?.url && tab?.title) {
                    await browserAPI.bookmarks.create({ title: tab.title, url: tab.url });
                    sendResponse({ status: 'OK' });
                  } else {
                    sendResponse({ error: 'No active tab info available' });
                  }
                } catch (err) {
                  sendResponse({ error: (err as Error).message });
                }
                break;
              }

              case 'TAB_RELOAD': {
                const reloadTabId = msg.tabId ?? sender.tab?.id;
                if (reloadTabId) {
                  await browserAPI.tabs.reload(reloadTabId);
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab to reload' });
                }
                break;
              }

              case 'TAB_HARD_RELOAD': {
                const hardReloadTabId = msg.tabId ?? sender.tab?.id;
                if (hardReloadTabId) {
                  await browserAPI.tabs.reload(hardReloadTabId, { bypassCache: true });
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab to reload' });
                }
                break;
              }

              case 'TAB_GO_BACK': {
                const backTabId = msg.tabId ?? sender.tab?.id;
                if (backTabId) {
                  await browserAPI.tabs.goBack(backTabId);
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab' });
                }
                break;
              }

              case 'TAB_GO_FORWARD': {
                const fwdTabId = msg.tabId ?? sender.tab?.id;
                if (fwdTabId) {
                  await browserAPI.tabs.goForward(fwdTabId);
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab' });
                }
                break;
              }

              case 'TAB_ZOOM': {
                const zoomTabId = msg.tabId ?? sender.tab?.id;
                if (zoomTabId) {
                  const currentZoom = await new Promise<number>((resolve) => {
                    browserAPI.tabs.getZoom(zoomTabId, resolve);
                  });
                  let newZoom = currentZoom;
                  if (msg.direction === 'in') newZoom = Math.min(currentZoom + 0.1, 5);
                  else if (msg.direction === 'out') newZoom = Math.max(currentZoom - 0.1, 0.25);
                  else if (msg.direction === 'reset') newZoom = 1;
                  browserAPI.tabs.setZoom(zoomTabId, newZoom);
                  sendResponse({ status: 'OK', zoom: newZoom });
                } else {
                  sendResponse({ error: 'No tab' });
                }
                break;
              }

              case 'TAB_VIEW_SOURCE': {
                const vsTabId = sender.tab?.id;
                if (vsTabId && sender.tab?.url) {
                  await browserAPI.tabs.create({ url: `view-source:${sender.tab.url}` });
                  sendResponse({ status: 'OK' });
                } else {
                  sendResponse({ error: 'No tab URL' });
                }
                break;
              }

              case 'WINDOW_CREATE': {
                if (msg.windowType === 'incognito') {
                  await browserAPI.windows.create({ incognito: true });
                } else if (msg.windowType === 'window') {
                  await browserAPI.windows.create({});
                } else if (msg.windowType === 'background-tab') {
                  await browserAPI.tabs.create({ url: msg.url, active: false });
                } else {
                  await browserAPI.tabs.create({ url: msg.url || 'chrome://newtab' });
                }
                sendResponse({ status: 'OK' });
                break;
              }

              case 'EXECUTE_COMMAND': {
                logger.info('onMessage', 'EXECUTE_COMMAND:', msg.commandId);
                sendResponse({ status: 'OK' });
                break;
              }

              case 'FACTORY_RESET': {
                logger.info('onMessage', 'Factory reset requested');
                try {
                  await SettingsManager.resetToDefaults();
                  const { clearAndRebuild: clearRebuild } = await import('./resilience');
                  await clearRebuild();
                  sendResponse({ status: 'OK' });
                } catch (err) {
                  sendResponse({ error: (err as Error).message });
                }
                break;
              }

              case 'RESET_SETTINGS': {
                logger.info('onMessage', 'Reset settings requested');
                try {
                  await SettingsManager.resetToDefaults();
                  sendResponse({ status: 'OK' });
                } catch (err) {
                  sendResponse({ error: (err as Error).message });
                }
                break;
              }

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

              // GET_SETTINGS is handled in outer switch (before initialized check)

              default:
                logger.warn('onMessage', 'Unknown message type received:', msg.type);
                sendResponse({ error: 'Unknown message type' });
            }
        }
        logger.trace('onMessage', 'Message processing completed');
      } catch (error) {
        logger.error('onMessage', 'Error processing message:', error);
        sendResponse({ error: (error as Error).message });
      }
    })();
    logger.trace('onMessage', 'Returning true for async response');
    return true; // async response
  });

  // Now start the main initialization
  await init();
})();

async function init() {
    // Prevent concurrent initialization
    if (initializationPromise) {
        logger.debug('init', 'Initialization already in progress, waiting...');
        return initializationPromise;
    }
    
    // If already initialized, just return
    if (initialized) {
        logger.debug('init', 'Service worker already initialized, skipping');
        return;
    }

    initializationPromise = (async () => {
        const initStartTime = performance.now();
        logger.info('init', '[SmrutiCortex] Init function called');

        // Track service worker restart for performance monitor
        const { performanceTracker } = await import('./performance-monitor');
        performanceTracker.recordRestart();

        try {
            logger.debug('init', 'Initializing service worker…');

            logger.info('init', '🗄️ Opening database...');
            await openDatabase();
            logger.info('init', '✅ Database ready');

            // Initialize search debug state from storage
            logger.debug('init', 'Initializing search debug state...');
            const { initSearchDebugState } = await import('./diagnostics');
            await initSearchDebugState();
            logger.debug('init', '✅ Search debug state initialized');

            // Check if force rebuild flag is set (after CLEAR_ALL_DATA)
            const forceRebuild = await getForceRebuildFlag();
            if (forceRebuild) {
                logger.info('init', '🔄 Force rebuild flag detected - performing full rebuild');
                await performFullRebuild();
                await setForceRebuildFlag(false);
                logger.info('init', '✅ Force rebuild completed');
            } else {
                // Normal indexing (smart indexing will decide what to do)
                logger.info('init', '🔄 Starting history indexing...');
                await ingestHistory();
                logger.info('init', '✅ History indexing complete');
            }

            // Listen for new visits (incremental updates with debouncing)
            logger.debug('init', 'Setting up history listener for incremental updates');
            let indexingTimeout: ReturnType<typeof setTimeout> | null = null;
            browserAPI.history.onVisited.addListener(async (item) => {
                logger.trace('onVisited', 'New visit detected, scheduling incremental index:', item.url);
                // Debounce incremental indexing to avoid too frequent updates
                if (indexingTimeout) {
                    clearTimeout(indexingTimeout);
                }
                indexingTimeout = setTimeout(async () => {
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

            // Start health monitoring for self-healing
            startHealthMonitoring();

            // Warm up AI models in background if enabled (non-blocking)
            SettingsManager.init().then(async () => {
                const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled');
                const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled');

                if (ollamaEnabled || embeddingsEnabled) {
                    logger.info('init', '🔥 Warming up AI models in background...');
                    try {
                        const { getOllamaService, getOllamaConfigFromSettings } = await import('./ollama-service');
                        // Pass user's actual settings (endpoint, model, timeout)
                        const config = await getOllamaConfigFromSettings(!!embeddingsEnabled);
                        const ollamaService = getOllamaService(config);
                        await ollamaService.warmup();
                    } catch (error) {
                        logger.debug('init', '⚠️ Model warmup failed (non-critical):', error);
                    }
                }

                // Auto-start background embedding processor if semantic search is enabled
                if (embeddingsEnabled) {
                    logger.info('init', '🧠 Starting background embedding processor...');
                    try {
                        const { embeddingProcessor } = await import('./embedding-processor');
                        await embeddingProcessor.start();
                    } catch (error) {
                        logger.debug('init', '⚠️ Embedding processor auto-start failed (non-critical):', error);
                    }
                }
            }).catch(() => {/* ignore */});

            // Command listener is already registered at module load level for ultra-fast response
            // Command listener is already registered at module load level for ultra-fast response
            // Just ensure it's registered if not already
            registerCommandsListenerEarly();

            const initDuration = (performance.now() - initStartTime).toFixed(1);
            logger.info('init', `✅ Service worker ready in ${initDuration}ms`);
            logger.info('init', '[SmrutiCortex] Service worker ready');
        } catch (error) {
            logger.error('init', '❌ Init error:', error);
            logger.error('init', '[SmrutiCortex] Init error:', error);
            // Reset initialization state so it can be retried
            initialized = false;
            initializationPromise = null;
            throw error;
        }
    })();
    
    await initializationPromise;
}

// Background resilience: re-initialize on wake from suspension
browserAPI.runtime.onStartup.addListener(async () => {
    logger.info('onStartup', '🔄 Browser startup detected, ensuring service worker is initialized');
    if (!initialized) {
        await init();
    }
});

// Ensure initialization on install/update
browserAPI.runtime.onInstalled.addListener(async (details) => {
    logger.info('onInstalled', `📦 Extension ${details.reason}: v${chrome.runtime.getManifest().version}`);
    if (!initialized) {
        await init();
    }

    // === Proactive Content Script Re-injection ===
    // Chrome/Edge do NOT re-inject manifest-declared content scripts into
    // already-open tabs after an extension update. This leaves quick-search
    // broken until the user manually reloads each page. We fix that here by
    // programmatically re-injecting into all eligible tabs so quick-search
    // works instantly — no page reload needed.
    if (details.reason === 'update' || details.reason === 'install') {
        try {
            const tabs = await browserAPI.tabs.query({ url: ['http://*/*', 'https://*/*'] });
            let injected = 0;
            for (const tab of tabs) {
                if (!tab.id) continue;
                if (await reinjectContentScript(tab.id)) injected++;
            }
            logger.info('onInstalled', `🔄 Re-injected quick-search into ${injected}/${tabs.length} open tabs`);
        } catch (e) {
            logger.warn('onInstalled', 'Content script re-injection failed', { error: (e as Error).message });
        }
    }
});

// ===== OMNIBOX INTEGRATION =====
browserAPI.omnibox.setDefaultSuggestion({
    description: 'Search history, or use / for commands, @ for tabs, # for bookmarks',
});

browserAPI.omnibox.onInputChanged.addListener(async (text, suggest) => {
    try {
        if (!initialized) { suggest([]); return; }
        const trimmed = text.trim();
        if (!trimmed) { suggest([]); return; }

        if (trimmed.startsWith('/') || trimmed.startsWith('>')) {
            const { matchCommands: matchCmds, getCommandsByTier: getCmds } = await import('../shared/command-registry');
            const tier = trimmed.startsWith('>') ? 'power' as const : 'everyday' as const;
            const query = trimmed.slice(1).trim();
            const settings = SettingsManager.getSettings();
            const commands = getCmds(tier);
            const matches = matchCmds(query, commands, settings);
            suggest(matches.slice(0, 5).map(cmd => ({
                content: `${trimmed[0]}${cmd.id}`,
                description: `${cmd.icon} ${cmd.label} — ${cmd.category}`,
            })));
            return;
        }

        if (trimmed.startsWith('@')) {
            const tabs = await browserAPI.tabs.query({});
            const query = trimmed.slice(1).trim().toLowerCase();
            const filtered = query
                ? tabs.filter(t => t.title?.toLowerCase().includes(query) || t.url?.toLowerCase().includes(query))
                : tabs;
            suggest(filtered.slice(0, 5).map(t => ({
                content: `@tab:${t.id}`,
                description: `${t.title || 'Untitled'} — ${t.url || ''}`.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
            })));
            return;
        }

        if (trimmed.startsWith('#')) {
            const query = trimmed.slice(1).trim();
            if (query) {
                const bookmarks = await browserAPI.bookmarks.search(query);
                suggest(bookmarks.filter((b: chrome.bookmarks.BookmarkTreeNode) => b.url).slice(0, 5).map((b: chrome.bookmarks.BookmarkTreeNode) => ({
                    content: b.url!,
                    description: `${b.title || 'Untitled'} — ${b.url}`.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
                })));
            }
            return;
        }

        const results = await runSearch(trimmed, { skipAI: true });
        suggest(results.slice(0, 5).map(r => ({
            content: r.url,
            description: `${r.title || 'Untitled'} — ${r.url}`.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
        })));
    } catch (err) {
        logger.debug('omnibox', 'onInputChanged error:', err);
        suggest([]);
    }
});

browserAPI.omnibox.onInputEntered.addListener(async (text, disposition) => {
    try {
        const trimmed = text.trim();

        if (trimmed.startsWith('@tab:')) {
            const tabId = parseInt(trimmed.replace('@tab:', ''), 10);
            if (!isNaN(tabId)) {
                const tab = await browserAPI.tabs.get(tabId);
                await browserAPI.tabs.update(tabId, { active: true });
                if (tab.windowId) await browserAPI.windows.update(tab.windowId, { focused: true });
            }
            return;
        }

        if (trimmed.startsWith('/') || trimmed.startsWith('>')) {
            const commandId = trimmed.slice(1).trim();
            const { ALL_COMMANDS: allCmds } = await import('../shared/command-registry');
            const cmd = allCmds.find(c => c.id === commandId);
            if (cmd?.url) {
                await browserAPI.tabs.create({ url: cmd.url });
            } else if (cmd?.messageType) {
                browserAPI.runtime.sendMessage({ type: cmd.messageType });
            }
            return;
        }

        let url = trimmed;
        try { new URL(url); } catch { url = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`; }

        if (disposition === 'currentTab') {
            const [activeTab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
            if (activeTab?.id) await browserAPI.tabs.update(activeTab.id, { url });
        } else {
            await browserAPI.tabs.create({ url, active: disposition !== 'newBackgroundTab' });
        }
    } catch (err) {
        logger.error('omnibox', 'onInputEntered error:', err);
    }
});