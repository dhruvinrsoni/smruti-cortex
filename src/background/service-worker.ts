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
          default:
            // For other messages, check if initialized
            if (!initialized) {
              logger.debug("onMessage", "Service worker not initialized yet, rejecting message:", msg.type);
              sendResponse({ error: "Service worker not ready" });
              break;
            }
            switch (msg.type) {
              case "SEARCH_QUERY":
                logger.debug("onMessage", "Handling SEARCH_QUERY for:", msg.query);
                const results = await runSearch(msg.query);
                logger.debug("onMessage", "Search completed, results:", results);
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

        logger.debug("init", "Calling openDatabase");
        logger.info("init", "[SmrutiCortex] Opening database");
        await openDatabase();
        logger.info("init", "[SmrutiCortex] Database opened");

        // Smart indexing based on version and incremental updates
        logger.debug("init", "Checking indexing status");
        const currentVersion = chrome.runtime.getManifest().version;
        const lastIndexedVersion = await new Promise<string>((resolve) => {
            browserAPI.storage.local.get(["lastIndexedVersion"], (data) => {
                resolve(data.lastIndexedVersion || "0.0.0");
            });
        });

        logger.debug("init", "Version check for indexing", { currentVersion, lastIndexedVersion });

        // Always perform indexing on startup (smart indexing will decide what to do)
        logger.info("init", "Starting smart history indexing");
        await ingestHistory();
        logger.info("init", "Smart history indexing completed");

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
        // Listen for keyboard commands
        logger.debug("init", "Setting up command listener");
        try {
            if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
                logger.debug("init", "Commands API is available, setting up listener");
                browserAPI.commands.onCommand.addListener(async (command) => {
                    logger.debug("onCommand", "Command received:", command);
                    if (command === "open-popup") {
                        logger.debug("onCommand", "Opening popup via keyboard shortcut");

                        // Check if popup is already open by trying to send a message first
                        const isPopupOpen = await new Promise<boolean>((resolve) => {
                            logger.debug("onCommand", "Checking if popup is already open");
                            browserAPI.runtime.sendMessage({ type: "PING" }, (response) => {
                                if (browserAPI.runtime.lastError) {
                                    logger.debug("onCommand", "Popup not open:", browserAPI.runtime.lastError);
                                    resolve(false);
                                } else {
                                    logger.debug("onCommand", "Popup is open, response:", response);
                                    resolve(true);
                                }
                            });
                        });

                        if (isPopupOpen) {
                            logger.debug("onCommand", "Popup is already open, sending focus message");
                            // Send the focus message
                            browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                if (browserAPI.runtime.lastError) {
                                    logger.debug("onCommand", "Failed to send focus message:", browserAPI.runtime.lastError);
                                }
                            });
                            return;
                        } else {
                            logger.debug("onCommand", "Popup not open, attempting to open it");
                        }

                        // Open the popup with keyboard shortcut flag
                        if (browserAPI.action && typeof browserAPI.action.openPopup === 'function') {
                            logger.debug("onCommand", "Using action.openPopup()");
                            try {
                                browserAPI.action.openPopup();
                                logger.debug("onCommand", "Popup opened successfully");
                                // Send message to popup to focus appropriately
                                setTimeout(() => {
                                    logger.debug("onCommand", "Sending KEYBOARD_SHORTCUT_OPEN message to popup");
                                    browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                        if (browserAPI.runtime.lastError) {
                                            logger.debug("onCommand", "Failed to send KEYBOARD_SHORTCUT_OPEN:", browserAPI.runtime.lastError);
                                        }
                                    });
                                }, 100);
                            } catch (error) {
                                logger.error("onCommand", "Failed to open popup with action.openPopup():", error);
                                logger.debug("onCommand", "Using final fallback: opening in new tab");
                                // Final fallback: create a new tab with the extension URL
                                browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                            }
                        } else {
                            logger.debug("onCommand", "action.openPopup not available, using fallback: opening in new tab");
                            // Fallback: create a new tab with the extension URL
                            browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                        }
                    } else {
                        logger.debug("onCommand", "Unknown command received:", command);
                    }
                });
                logger.debug("init", "Commands listener set up successfully");
            } else {
                logger.warn("init", "Commands API not available during init - this may be normal");
                logger.debug("init", "browserAPI.commands exists:", !!browserAPI.commands);
                if (browserAPI.commands) {
                    logger.debug("init", "browserAPI.commands properties:", Object.keys(browserAPI.commands));
                    logger.debug("init", "browserAPI.commands.onCommand:", browserAPI.commands.onCommand);
                }
                logger.debug("init", "Will retry commands setup later");

                // Try to set up commands listener after a delay
                setTimeout(() => {
                    logger.debug("init", "Retrying commands setup after delay");
                    try {
                        if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
                            logger.debug("init", "Commands API now available, setting up listener");
                            browserAPI.commands.onCommand.addListener(async (command) => {
                                logger.debug("onCommand", "Command received (delayed setup):", command);
                                // ... same command handling code ...
                                if (command === "open-popup") {
                                    logger.debug("onCommand", "Opening popup via keyboard shortcut (delayed)");

                                    const isPopupOpen = await new Promise<boolean>((resolve) => {
                                        logger.debug("onCommand", "Checking if popup is already open (delayed)");
                                        browserAPI.runtime.sendMessage({ type: "PING" }, (response) => {
                                            if (browserAPI.runtime.lastError) {
                                                logger.debug("onCommand", "Popup not open (delayed):", browserAPI.runtime.lastError);
                                                resolve(false);
                                            } else {
                                                logger.debug("onCommand", "Popup is open (delayed), response:", response);
                                                resolve(true);
                                            }
                                        });
                                    });

                                    if (isPopupOpen) {
                                        logger.debug("onCommand", "Popup is already open, sending focus message (delayed)");
                                        browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                            if (browserAPI.runtime.lastError) {
                                                logger.debug("onCommand", "Failed to send focus message (delayed):", browserAPI.runtime.lastError);
                                            }
                                        });
                                        return;
                                    }

                                    if (browserAPI.action && typeof browserAPI.action.openPopup === 'function') {
                                        logger.debug("onCommand", "Using action.openPopup() (delayed)");
                                        try {
                                            browserAPI.action.openPopup();
                                            logger.debug("onCommand", "Popup opened successfully (delayed)");
                                            setTimeout(() => {
                                                logger.debug("onCommand", "Sending KEYBOARD_SHORTCUT_OPEN message to popup (delayed)");
                                                browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                                    if (browserAPI.runtime.lastError) {
                                                        logger.debug("onCommand", "Failed to send KEYBOARD_SHORTCUT_OPEN (delayed):", browserAPI.runtime.lastError);
                                                    }
                                                });
                                            }, 100);
                                        } catch (error) {
                                            logger.error("onCommand", "Failed to open popup with action.openPopup() (delayed):", error);
                                            logger.debug("onCommand", "Using final fallback: opening in new tab (delayed)");
                                            browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                                        }
                                    } else {
                                        logger.debug("onCommand", "action.openPopup not available, using fallback: opening in new tab (delayed)");
                                        browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                                    }
                                } else {
                                    logger.debug("onCommand", "Unknown command received (delayed):", command);
                                }
                            });
                            logger.debug("init", "Commands listener set up successfully (delayed)");
                        } else {
                            logger.warn("init", "Commands API still not available after delay - keyboard shortcuts disabled");
                        }
                    } catch (retryError) {
                        logger.error("init", "Error setting up commands listener (delayed):", retryError);
                    }
                }, 1000);
            }
        } catch (error) {
            logger.error("init", "Error setting up commands listener:", error);
        }

        logger.info("init", "Service worker ready.");
        logger.info("init", "[SmrutiCortex] Service worker ready");
    } catch (error) {
        logger.error("init", "Init error:", error);
        logger.error("init", "[SmrutiCortex] Init error:", error);
    }
}