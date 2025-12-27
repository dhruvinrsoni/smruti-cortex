// service-worker.ts — Core brain of SmrutiCortex

import { BRAND_NAME } from "../core/constants";
import { openDatabase } from "./database";
import { ingestHistory } from "./indexing";
import { runSearch } from "./search/search-engine";
import { mergeMetadata } from "./indexing";
import { browserAPI } from "../core/helpers";
import { Logger, LogLevel } from "../core/logger";
import { SettingsManager } from "../core/settings";

// Logger will be initialized below - don't log before that

let initialized = false;
const logger = Logger.forComponent("ServiceWorker");

// === ULTRA-FAST KEYBOARD SHORTCUT HANDLER ===
// Register command listener IMMEDIATELY at module load (before any async init)
// This ensures keyboard shortcuts work even during cold start
let commandsListenerRegistered = false;
function registerCommandsListenerEarly() {
  if (commandsListenerRegistered) return;
  if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
    browserAPI.commands.onCommand.addListener(async (command) => {
      if (command === "open-popup") {
        // Open popup immediately - don't wait for initialization
        if (browserAPI.action && typeof browserAPI.action.openPopup === 'function') {
          try {
            await browserAPI.action.openPopup();
            logger.info("onCommand", "✅ Popup opened successfully via action API");
          } catch (e) {
            // Popup might already be open - this is fine
            logger.debug("onCommand", "Popup open attempt completed", { error: (e as Error).message });
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

(async function initLogger() {
  // Initialize logger first, then start logging
  await Logger.init();
  await SettingsManager.init();
  logger.info("initLogger", "[SmrutiCortex] Logger and settings initialized, starting main init");
  logger.debug("initLogger", "Service worker script starting");

  // Set up messaging immediately
  logger.debug("initLogger", "[SmrutiCortex] Setting up message listeners");
  browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    logger.debug("onMessage", "Message listener triggered with message:", msg);
    logger.trace("onMessage", "Sender:", sender);
    (async () => {
      logger.debug("onMessage", "Processing message asynchronously");
      try {
        logger.debug("onMessage", "Message type:", msg.type);
        switch (msg.type) {
          case "PING":
            logger.debug("onMessage", "Handling PING");
            sendResponse({ status: "ok" });
            break;
          case "SET_LOG_LEVEL":
            logger.info("onMessage", "[SmrutiCortex] Handling SET_LOG_LEVEL:", msg.level);
            await Logger.setLevel(msg.level);
            logger.info("onMessage", "[SmrutiCortex] Log level set to", Logger.getLevel());
            sendResponse({ status: "ok" });
            break;
          case "SETTINGS_CHANGED":
            logger.debug("onMessage", "Handling SETTINGS_CHANGED:", msg.settings);
            // Check if log level changed and update logger if needed
            if (msg.settings && typeof msg.settings.logLevel === 'number') {
              const currentLevel = Logger.getLevel();
              if (currentLevel !== msg.settings.logLevel) {
                Logger.setLevelInternal(msg.settings.logLevel);
                logger.info("onMessage", "[SmrutiCortex] Log level updated from SETTINGS_CHANGED", {
                  from: currentLevel,
                  to: msg.settings.logLevel,
                  levelName: LogLevel[msg.settings.logLevel]
                });
              }
            }
            sendResponse({ status: "ok" });
            break;
          case "POPUP_PERF_LOG":
            // Log popup performance timing info
            logger.info("onMessage", `[PopupPerf] ${msg.stage} | ts=${msg.timestamp} | elapsedMs=${msg.elapsedMs}`);
            sendResponse({ status: "ok" });
            break;
          default:
            // For other messages, check if initialized
            if (!initialized) {
              logger.debug("onMessage", "Service worker not initialized yet, rejecting message:", msg.type);
              sendResponse({ error: "Service worker not ready" });
              break;
            }
            switch (msg.type) {
              case "SEARCH_QUERY":
                logger.info("onMessage", `Popup search: "${msg.query}"`);
                const results = await runSearch(msg.query);
                logger.debug("onMessage", "Search completed, results:", results.length);
                sendResponse({ results });
                break;

              case "REBUILD_INDEX":
                logger.debug("onMessage", "Handling REBUILD_INDEX");
                await ingestHistory();
                sendResponse({ status: "OK" });
                break;

              // inside messaging onMessage handler
              case "METADATA_CAPTURE": {
                logger.debug("onMessage", "Handling METADATA_CAPTURE for:", msg.payload.url);
                const { payload } = msg;
                // call mergeMetadata (implementation in indexing.ts)
                await mergeMetadata(payload.url, {
                  description: payload.metaDescription,
                  keywords: payload.metaKeywords
                });
                sendResponse({ status: "ok" });
                break;
              }

              default:
                logger.warn("onMessage", "Unknown message type received:", msg.type);
                sendResponse({ error: "Unknown message type" });
            }
        }
        logger.debug("onMessage", "Message processing completed");
      } catch (error) {
        logger.error("onMessage", "Error processing message:", error);
        sendResponse({ error: error.message });
      }
    })();
    logger.debug("onMessage", "Returning true for async response");
    return true; // async response
  });

  // Now start the main initialization
  await init();
})();

async function init() {
    logger.info("init", "[SmrutiCortex] Init function called");
    try {
        logger.debug("init", "Initializing service worker…");

        logger.info("init", "🗄️ Opening database...");
        await openDatabase();
        logger.info("init", "✅ Database ready");

        // Smart indexing based on version and incremental updates
        const currentVersion = chrome.runtime.getManifest().version;
        const lastIndexedVersion = await new Promise<string>((resolve) => {
            browserAPI.storage.local.get(["lastIndexedVersion"], (data) => {
                resolve(data.lastIndexedVersion || "0.0.0");
            });
        });

        // Always perform indexing on startup (smart indexing will decide what to do)
        logger.info("init", "🔄 Starting history indexing...");
        await ingestHistory();
        logger.info("init", "✅ History indexing complete");

        // Listen for new visits (incremental updates with debouncing)
        logger.debug("init", "Setting up history listener for incremental updates");
        browserAPI.history.onVisited.addListener(async (item) => {
            logger.trace("onVisited", "New visit detected, scheduling incremental index:", item.url);
            // Debounce incremental indexing to avoid too frequent updates
            if (this.indexingTimeout) {
                clearTimeout(this.indexingTimeout);
            }
            this.indexingTimeout = setTimeout(async () => {
                logger.debug("onVisited", "Performing debounced incremental indexing");
                await ingestHistory();
            }, 10000); // Wait 10 seconds after last visit before indexing
        });

        // Set up messaging
        logger.debug("init", "Setting up messaging");

        initialized = true;
        logger.debug("init", "Service worker initialized flag set");

        // Keep service worker alive to reduce cold start delays for keyboard shortcuts
        keepServiceWorkerAlive();

        // Command listener is already registered at module load level for ultra-fast response
        // Just ensure it's registered if not already
        registerCommandsListenerEarly();

        logger.info("init", "Service worker ready.");
        logger.info("init", "[SmrutiCortex] Service worker ready");
    } catch (error) {
        logger.error("init", "Init error:", error);
        logger.error("init", "[SmrutiCortex] Init error:", error);
    }
}