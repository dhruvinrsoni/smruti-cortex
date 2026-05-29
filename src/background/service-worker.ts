// service-worker.ts — Thin bootstrap for SmrutiCortex
//
// All message handling logic lives in handlers/*.ts, wired via composition-root.ts.
// Infrastructure (omnibox, port-messaging, commands, keep-alive) lives in lifecycle/*.ts.
// This file is responsible for: Chrome event listener registration (must be
// synchronous at module load per MV3) and initialization orchestration.

import { openDatabase, getForceRebuildFlag, setForceRebuildFlag } from './database';
import { ingestHistory, performFullRebuild } from './indexing';
import { browserAPI } from '../core/helpers';
import { Logger, errorMeta } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { startHealthMonitoring, ensureReady } from './resilience';
import { createRegistries } from './composition-root';
import { registerCommandsListenerEarly, keepServiceWorkerAlive, reinjectContentScript } from './lifecycle/commands-listener';
import { setupPortBasedMessaging, broadcastToActivePorts } from './lifecycle/port-messaging';
import { setupDataChangeListeners, type DataChangeSource } from './lifecycle/data-change-listeners';
import { setupOmnibox } from './lifecycle/omnibox';
import { applyFreshInstallProfile } from './lifecycle/fresh-install';

let initialized = false;
let initializationPromise: Promise<void> | null = null;
const logger = Logger.forComponent('ServiceWorker');

const { preInit, postInit } = createRegistries();

registerCommandsListenerEarly();
setupPortBasedMessaging({
  isInitialized: () => initialized,
  getInitPromise: () => initializationPromise,
  ensureReady,
});

function broadcastDataChange(source: DataChangeSource): void {
  broadcastToActivePorts({ type: 'DATA_CHANGED', source });
  // Fire-and-forget to popup (if open); popup may not be open — silence the error.
  void browserAPI.runtime.sendMessage({ type: 'DATA_CHANGED', source }).catch(() => {});
}
setupDataChangeListeners(broadcastDataChange);

// Chrome MV3 requires synchronous listener registration at module load.
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  logger.trace('onMessage', `Message received: type=${msg?.type ?? 'unknown'}`);

  (async () => {
    try {
      if (preInit.has(msg.type)) {
        await preInit.dispatch(msg, sender, sendResponse);
        return;
      }

      if (!initialized) {
        if (initializationPromise) {
          try { await initializationPromise; } catch {
            const healed = await ensureReady();
            if (!healed) { sendResponse({ error: 'Service worker not ready' }); return; }
          }
        } else {
          const healed = await ensureReady();
          if (!healed) { sendResponse({ error: 'Service worker not ready' }); return; }
        }
      }

      const handled = await postInit.dispatch(msg, sender, sendResponse);
      if (!handled) {
        logger.warn('onMessage', 'Unknown message type received:', msg.type);
        sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      logger.error('onMessage', 'Error processing message:', errorMeta(error));
      sendResponse({ error: (error as Error).message });
    }
  })();
  return true;
});

// === INITIALIZATION ===
(async function initLogger() {
  await Logger.init();
  await SettingsManager.init();
  logger.info('initLogger', '[SmrutiCortex] Logger and settings initialized, starting main init');
  try {
    await init();
  } catch (err) {
    logger.error('initLogger', 'Fatal error during initialization', undefined, err instanceof Error ? err : new Error(String(err)));
  }
})();

async function init() {
  if (initializationPromise) {
    return initializationPromise;
  }
  if (initialized) {
    return;
  }
  initializationPromise = (async () => {
    const initStartTime = performance.now();
    logger.info('init', '[SmrutiCortex] Init function called');
    const { performanceTracker } = await import('./performance-monitor');
    performanceTracker.recordRestart();
    try {
      logger.info('init', '🗄️ Opening database...');
      await openDatabase();
      logger.info('init', '✅ Database ready');
      const { initSearchDebugState } = await import('./diagnostics');
      await initSearchDebugState();
      const forceRebuild = await getForceRebuildFlag();
      if (forceRebuild) {
        logger.info('init', '🔄 Force rebuild flag detected');
        await performFullRebuild();
        await setForceRebuildFlag(false);
        const { clearSearchCache: clearCacheAfterRebuild } = await import('./search/search-cache');
        clearCacheAfterRebuild();
      } else {
        logger.info('init', '🔄 Starting history indexing...');
        await ingestHistory();
        const { clearSearchCache: clearCacheAfterIngest } = await import('./search/search-cache');
        clearCacheAfterIngest();
        logger.info('init', '✅ History indexing complete');
      }
      let indexingTimeout: ReturnType<typeof setTimeout> | null = null;
      browserAPI.history.onVisited.addListener(async (item) => {
        logger.trace('onVisited', 'New visit detected:', item.url);

        // Fast path (Recent-view freshness fix). The bulk ingestHistory()
        // path below is debounced 10s + throttled 30 minutes, which means
        // a brand-new visit can take half an hour to appear in IndexedDB
        // and therefore in the popup's "Recent" list. The fast path
        // writes a single row immediately so the next popup open shows
        // the latest visit at the top without waiting for bulk reconciliation.
        // Cheap (one IDB read+put + one chrome.storage.session.remove) and
        // bounded -- safe to fire on every navigation.
        if (item.url) {
          try {
            const { upsertRecentVisit } = await import('./database');
            const { tokenize } = await import('./search/tokenizer');
            await upsertRecentVisit({
              url: item.url,
              title: item.title ?? '',
              lastVisit: item.lastVisitTime ?? Date.now(),
              visitCount: 1,
              tokenize,
            });
            // Invalidate the warm session cache so the next popup paint
            // hits the freshly-updated IDB row instead of the pre-visit
            // cached snapshot.
            const { clearRecentHistoryCache } = await import('../shared/recent-history-cache');
            void clearRecentHistoryCache();
          } catch (err) {
            // Non-fatal: the bulk path below will still reconcile.
            logger.warn('onVisited', 'Fast-path upsert failed; relying on bulk indexer', errorMeta(err));
          }
        }

        if (indexingTimeout) {clearTimeout(indexingTimeout);}
        indexingTimeout = setTimeout(async () => {
          try {
            await ingestHistory();
          } catch (err) {
            logger.error('onVisited', 'Incremental indexing failed', undefined, err instanceof Error ? err : new Error(String(err)));
          }
        }, 10000);
      });
      initialized = true;
      keepServiceWorkerAlive();
      startHealthMonitoring();
      SettingsManager.init().then(async () => {
        const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled');
        const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled');
        if (ollamaEnabled || embeddingsEnabled) {
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
          try {
            const { embeddingProcessor } = await import('./embedding-processor');
            await embeddingProcessor.start();
          } catch (error) {
            logger.debug('init', '⚠️ Embedding processor auto-start failed:', errorMeta(error));
          }
        }
      }).catch((err) => {
        logger.warn('init', 'SettingsManager.init() chain failed — Ollama warmup/embedding auto-start skipped', errorMeta(err));
      });
      registerCommandsListenerEarly();
      const initDuration = (performance.now() - initStartTime).toFixed(1);
      logger.info('init', `✅ Service worker ready in ${initDuration}ms`);
    } catch (error) {
      logger.error('init', '❌ Init error:', errorMeta(error));
      initialized = false;
      initializationPromise = null;
      throw error;
    }
  })();
  await initializationPromise;
}

browserAPI.runtime.onStartup.addListener(async () => {
  try {
    logger.info('onStartup', '🔄 Browser startup detected');
    if (!initialized) {await init();}
  } catch (err) {
    logger.error('onStartup', 'Startup initialization failed', undefined, err instanceof Error ? err : new Error(String(err)));
  }
});

/**
 * Install a listener on `chrome.idle.onStateChanged` that calls `initFn()`
 * when the OS transitions back to `active` and the SW is not initialized.
 *
 * Exported (and kept pure on its inputs) so it can be unit-tested with a
 * stubbed idle API without bootstrapping the entire service-worker module.
 */
export function setupIdleWakeListener(
  idleApi: typeof chrome.idle | undefined,
  isInitialized: () => boolean,
  initFn: () => Promise<void>,
): boolean {
  if (!idleApi?.onStateChanged?.addListener) {return false;}
  try { idleApi.setDetectionInterval?.(60); } catch { /* Firefox MV3 compat */ }
  idleApi.onStateChanged.addListener(async (state) => {
    if (state !== 'active') {return;}
    // `active` transition is a strong signal that the user is back at
    // the machine. Feed it into the keep-alive scheduler so the idle
    // cadence snaps back to 0.5 min before the user's first click.
    try {
      const { recordUserInteraction } = await import('./lifecycle/commands-listener');
      recordUserInteraction();
    } catch {
      // Lazy import may fail in degenerate test environments — the
      // init path below is independent and still runs.
    }
    if (isInitialized()) {return;}
    try {
      logger.info('onIdleActive', '⏰ idle → active transition, ensuring SW is warm');
      await initFn();
    } catch (err) {
      logger.error(
        'onIdleActive',
        'Wake-from-idle init failed',
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  });
  return true;
}

// Proactive re-init on system wake from idle / hibernate.
//
// Chrome evicts the service worker during laptop sleep / long idle periods.
// When the user comes back and triggers quick-search, the first port message
// races SW boot. Listening to `chrome.idle.onStateChanged` lets us kick off
// `init()` the moment the OS reports "active" — well before the user
// interacts — so the SW is typically warm by the time the first message
// arrives. The `idle` permission is listed in manifest.json with no
// user-visible prompt (standard MV3 permission).
setupIdleWakeListener(
  (browserAPI as typeof chrome).idle,
  () => initialized,
  init,
);

browserAPI.runtime.onInstalled.addListener(async (details) => {
  try {
    logger.info('onInstalled', `📦 Extension ${details.reason}: v${chrome.runtime.getManifest().version}`);
    if (!initialized) {await init();}
    // Apply the opinionated "fully set-up gift" on a brand-new install only.
    // No-op on upgrades — existing users keep their settings.
    await applyFreshInstallProfile(details.reason);
    // Greet brand-new users with the replayable welcome page (unless onboarding is
    // disabled). Fire-and-forget — never block boot. No extra permission: this is an
    // extension-internal page opened via chrome.tabs.create.
    if (details.reason === 'install' && SettingsManager.getSetting('onboardingEnabled') !== false) {
      const version = chrome.runtime.getManifest().version;
      void browserAPI.tabs
        .create({ url: browserAPI.runtime.getURL('welcome/welcome.html') })
        .then(() => SettingsManager.setSetting('welcomeShownVersion', version))
        .catch((e) => logger.warn('onInstalled', 'Welcome page open failed', errorMeta(e)));
    }
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

// Boot-safety rule: any non-listener call at SW module scope must not throw,
// or Chrome reports "Failed to load the script unexpectedly" and listener
// registrations above may not stick. setupOmnibox already early-returns when
// the API is missing, but this catch is defense in depth — covers any future
// regression that reintroduces a synchronous throwing path.
try {
  setupOmnibox(() => initialized);
} catch (err) {
  logger.warn('boot', 'setupOmnibox threw at module load — continuing', errorMeta(err));
}
