// service-worker.ts — Thin bootstrap for SmrutiCortex
//
// All message handling logic lives in handlers/*.ts, wired via composition-root.ts.
// This file is responsible for: Chrome event listener registration (must be
// synchronous at module load per MV3), initialization orchestration, port-based
// messaging for quick-search, omnibox integration, and keep-alive alarms.

import { openDatabase, getForceRebuildFlag, setForceRebuildFlag } from './database';
import { ingestHistory, performFullRebuild } from './indexing';
import { runSearch } from './search/search-engine';
import { browserAPI } from '../core/helpers';
import { Logger, errorMeta } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { startHealthMonitoring, ensureReady } from './resilience';
import { createRegistries } from './composition-root';

let initialized = false;
let initializationPromise: Promise<void> | null = null;
const logger = Logger.forComponent('ServiceWorker');

// Wire all message handlers via composition root
const { preInit, postInit } = createRegistries();

// === ULTRA-FAST KEYBOARD SHORTCUT HANDLER ===
let commandsListenerRegistered = false;

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
            try {
              const response = await sendMessageWithTimeout<{ success?: boolean }>(tab.id, { type: 'OPEN_INLINE_SEARCH' }, 300);
              if (response?.success) {
                logger.debug('onCommand', `✅ Quick-search opened in ${(performance.now() - t0).toFixed(1)}ms`);
                return;
              }
            } catch { /* Tier 2 */ }
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
            } catch { /* Tier 3 */ }
            logger.info('onCommand', 'Quick-search unavailable, opening popup');
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened (fallback) in ${(performance.now() - t0).toFixed(1)}ms`);
          } else {
            logger.info('onCommand', `Special page detected (${tab?.url?.slice(0, 30)}...), using popup`);
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
            logger.info('onCommand', `✅ Popup opened in ${(performance.now() - t0).toFixed(1)}ms`);
          }
        } catch (e) {
          const errorMsg = (e as Error).message || 'Unknown error';
          logger.info('onCommand', `All tiers failed (${errorMsg}), last-resort popup`);
          try {
            await (browserAPI.action as any).openPopup(); // eslint-disable-line @typescript-eslint/no-explicit-any
          } catch { /* best effort */ }
        }
      }
    });
    commandsListenerRegistered = true;
  }
}
registerCommandsListenerEarly();

// === KEEP-ALIVE ===
function keepServiceWorkerAlive() {
  browserAPI.alarms.create('keep-alive-1', { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  browserAPI.alarms.create('keep-alive-2', { delayInMinutes: 1, periodInMinutes: 1 });
  browserAPI.alarms.create('keep-alive-3', { delayInMinutes: 2, periodInMinutes: 2 });
  browserAPI.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('keep-alive')) { /* noop — keeps SW alive */ }
  });
  browserAPI.runtime.onStartup.addListener(() => {
    browserAPI.alarms.create('keep-alive-restart', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });
  browserAPI.runtime.onInstalled.addListener(() => {
    browserAPI.alarms.create('keep-alive-install', { delayInMinutes: 0.1, periodInMinutes: 0.5 });
  });
  browserAPI.tabs.onActivated.addListener(() => { /* keeps SW alive */ });
  browserAPI.tabs.onUpdated.addListener(() => { /* keeps SW alive */ });
}

// === PORT-BASED MESSAGING FOR QUICK-SEARCH ===
function setupPortBasedMessaging() {
  browserAPI.runtime.onConnect.addListener((port) => {
    if (port.name === 'quick-search') {
      logger.debug('onConnect', 'Quick-search port connected');
      let portDisconnected = false;
      const PORT_RATE_LIMIT = 30;
      const PORT_RATE_WINDOW_MS = 1000;
      let portSearchCount = 0;
      let portRateWindowStart = Date.now();

      port.onMessage.addListener(async (msg) => {
        if (msg.type === 'SEARCH_QUERY') {
          const now = Date.now();
          if (now - portRateWindowStart > PORT_RATE_WINDOW_MS) {
            portSearchCount = 0;
            portRateWindowStart = now;
          }
          if (++portSearchCount > PORT_RATE_LIMIT) {
            logger.debug('portMessage', `Rate limited: ${portSearchCount} searches in window`);
            try { port.postMessage({ error: 'Rate limited', query: msg.query }); } catch { /* port closed */ }
            return;
          }
          const t0 = performance.now();
          const portQuery = typeof msg.query === 'string' ? msg.query.slice(0, 500) : '';
          logger.debug('portMessage', `Quick-search query: "${portQuery}"`);
          if (!initialized) {
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
            const results = await runSearch(portQuery, { skipAI: !!msg.skipAI });
            const aiStatus = getLastAIStatus();
            logger.debug('portMessage', `Search completed in ${(performance.now() - t0).toFixed(2)}ms, results: ${results.length}`);
            if (!portDisconnected) {
              try { port.postMessage({ results, aiStatus, query: portQuery, skipAI: !!msg.skipAI }); } catch { /* port closed */ }
            }
          } catch (error) {
            logger.error('portMessage', 'Search error:', errorMeta(error));
            if (!portDisconnected) {
              try { port.postMessage({ error: (error as Error).message, query: portQuery, skipAI: !!msg.skipAI }); } catch { /* port closed */ }
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
setupPortBasedMessaging();

// === MESSAGE DISPATCH ===
// Chrome MV3 requires synchronous listener registration at module load.
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  logger.trace('onMessage', `Message received: type=${msg?.type ?? 'unknown'}`);
  logger.trace('onMessage', 'Sender:', { tabId: sender.tab?.id, url: sender.tab?.url, frameId: sender.frameId, origin: sender.origin });

  (async () => {
    logger.trace('onMessage', 'Processing message asynchronously');
    try {
      // Pre-init handlers: respond immediately without waiting for init
      if (preInit.has(msg.type)) {
        await preInit.dispatch(msg, sender, sendResponse);
        logger.trace('onMessage', 'Message processing completed');
        return;
      }

      // Post-init handlers: wait for initialization
      if (!initialized) {
        if (initializationPromise) {
          logger.debug('onMessage', 'Service worker initializing, waiting for init before handling:', msg.type);
          try { await initializationPromise; } catch {
            logger.info('onMessage', 'Init promise failed, attempting ensureReady self-heal');
            const healed = await ensureReady();
            if (!healed) { sendResponse({ error: 'Service worker not ready' }); return; }
          }
        } else {
          logger.debug('onMessage', 'Service worker not initialized, attempting ensureReady self-heal');
          const healed = await ensureReady();
          if (!healed) { sendResponse({ error: 'Service worker not ready' }); return; }
        }
      }

      const handled = await postInit.dispatch(msg, sender, sendResponse);
      if (!handled) {
        logger.warn('onMessage', 'Unknown message type received:', msg.type);
        sendResponse({ error: 'Unknown message type' });
      }
      logger.trace('onMessage', 'Message processing completed');
    } catch (error) {
      logger.error('onMessage', 'Error processing message:', errorMeta(error));
      sendResponse({ error: (error as Error).message });
    }
  })();
  logger.trace('onMessage', 'Returning true for async response');
  return true;
});

// === INITIALIZATION ===
(async function initLogger() {
  await Logger.init();
  await SettingsManager.init();
  logger.info('initLogger', '[SmrutiCortex] Logger and settings initialized, starting main init');
  logger.debug('initLogger', 'Service worker script starting');
  try {
    await init();
  } catch (err) {
    logger.error('initLogger', 'Fatal error during initialization', undefined, err instanceof Error ? err : new Error(String(err)));
  }
})();

async function init() {
  if (initializationPromise) {
    logger.debug('init', 'Initialization already in progress, waiting...');
    return initializationPromise;
  }
  if (initialized) {
    logger.debug('init', 'Service worker already initialized, skipping');
    return;
  }
  initializationPromise = (async () => {
    const initStartTime = performance.now();
    logger.info('init', '[SmrutiCortex] Init function called');
    const { performanceTracker } = await import('./performance-monitor');
    performanceTracker.recordRestart();
    try {
      logger.debug('init', 'Initializing service worker…');
      logger.info('init', '🗄️ Opening database...');
      await openDatabase();
      logger.info('init', '✅ Database ready');
      logger.debug('init', 'Initializing search debug state...');
      const { initSearchDebugState } = await import('./diagnostics');
      await initSearchDebugState();
      logger.debug('init', '✅ Search debug state initialized');
      const forceRebuild = await getForceRebuildFlag();
      if (forceRebuild) {
        logger.info('init', '🔄 Force rebuild flag detected - performing full rebuild');
        await performFullRebuild();
        await setForceRebuildFlag(false);
        const { clearSearchCache: clearCacheAfterRebuild } = await import('./search/search-cache');
        clearCacheAfterRebuild();
        logger.info('init', '✅ Force rebuild completed');
      } else {
        logger.info('init', '🔄 Starting history indexing...');
        await ingestHistory();
        const { clearSearchCache: clearCacheAfterIngest } = await import('./search/search-cache');
        clearCacheAfterIngest();
        logger.info('init', '✅ History indexing complete');
      }
      logger.debug('init', 'Setting up history listener for incremental updates');
      let indexingTimeout: ReturnType<typeof setTimeout> | null = null;
      browserAPI.history.onVisited.addListener(async (item) => {
        logger.trace('onVisited', 'New visit detected, scheduling incremental index:', item.url);
        if (indexingTimeout) {clearTimeout(indexingTimeout);}
        indexingTimeout = setTimeout(async () => {
          try {
            logger.debug('onVisited', 'Performing debounced incremental indexing');
            await ingestHistory();
          } catch (err) {
            logger.error('onVisited', 'Incremental indexing failed', undefined, err instanceof Error ? err : new Error(String(err)));
          }
        }, 10000);
      });
      logger.debug('init', 'Setting up messaging');
      initialized = true;
      logger.debug('init', 'Service worker initialized flag set');
      keepServiceWorkerAlive();
      startHealthMonitoring();
      SettingsManager.init().then(async () => {
        const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled');
        const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled');
        if (ollamaEnabled || embeddingsEnabled) {
          logger.info('init', '🔥 Warming up AI models in background...');
          try {
            const { getOllamaService, getOllamaConfigFromSettings } = await import('./ollama-service');
            const config = await getOllamaConfigFromSettings(!!embeddingsEnabled);
            const ollamaService = getOllamaService(config);
            await ollamaService.warmup();
          } catch (error) {
            logger.debug('init', '⚠️ Model warmup failed (non-critical):', errorMeta(error));
          }
        }
        if (embeddingsEnabled) {
          logger.info('init', '🧠 Starting background embedding processor...');
          try {
            const { embeddingProcessor } = await import('./embedding-processor');
            await embeddingProcessor.start();
          } catch (error) {
            logger.debug('init', '⚠️ Embedding processor auto-start failed (non-critical):', errorMeta(error));
          }
        }
      }).catch(() => {/* ignore */});
      registerCommandsListenerEarly();
      const initDuration = (performance.now() - initStartTime).toFixed(1);
      logger.info('init', `✅ Service worker ready in ${initDuration}ms`);
      logger.info('init', '[SmrutiCortex] Service worker ready');
    } catch (error) {
      logger.error('init', '❌ Init error:', errorMeta(error));
      logger.error('init', '[SmrutiCortex] Init error:', errorMeta(error));
      initialized = false;
      initializationPromise = null;
      throw error;
    }
  })();
  await initializationPromise;
}

// Re-initialize on startup
browserAPI.runtime.onStartup.addListener(async () => {
  try {
    logger.info('onStartup', '🔄 Browser startup detected, ensuring service worker is initialized');
    if (!initialized) {await init();}
  } catch (err) {
    logger.error('onStartup', 'Startup initialization failed', undefined, err instanceof Error ? err : new Error(String(err)));
  }
});

// Re-initialize on install/update + re-inject content scripts
browserAPI.runtime.onInstalled.addListener(async (details) => {
  try {
    logger.info('onInstalled', `📦 Extension ${details.reason}: v${chrome.runtime.getManifest().version}`);
    if (!initialized) {await init();}
    if (details.reason === 'update' || details.reason === 'install') {
      try {
        const tabs = await browserAPI.tabs.query({ url: ['http://*/*', 'https://*/*'] });
        let injected = 0;
        for (const tab of tabs) {
          if (!tab.id) {continue;}
          if (await reinjectContentScript(tab.id)) {injected++;}
        }
        logger.info('onInstalled', `🔄 Re-injected quick-search into ${injected}/${tabs.length} open tabs`);
      } catch (e) {
        logger.warn('onInstalled', 'Content script re-injection failed', errorMeta(e));
      }
    }
  } catch (err) {
    logger.error('onInstalled', 'onInstalled handler failed', undefined, err instanceof Error ? err : new Error(String(err)));
  }
});

// === OMNIBOX ===
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
    logger.debug('omnibox', 'onInputChanged error:', errorMeta(err));
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
        if (tab.windowId) {await browserAPI.windows.update(tab.windowId, { focused: true });}
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
        browserAPI.runtime.sendMessage({ type: cmd.messageType }, () => { void browserAPI.runtime.lastError; });
      }
      return;
    }

    let url = trimmed;
    try { new URL(url); } catch { url = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`; }

    if (disposition === 'currentTab') {
      const [activeTab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {await browserAPI.tabs.update(activeTab.id, { url });}
    } else {
      await browserAPI.tabs.create({ url, active: disposition !== 'newBackgroundTab' });
    }
  } catch (err) {
    logger.error('omnibox', 'onInputEntered error:', errorMeta(err));
  }
});
