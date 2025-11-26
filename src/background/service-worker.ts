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

(async function initLogger() {
  // Initialize logger first, then start logging
  await Logger.init();
  await SettingsManager.init();
  Logger.info("[SmrutiCortex] Logger and settings initialized, starting main init");
  Logger.debug("Service worker script starting");

  // Set up messaging immediately
  Logger.debug("[SmrutiCortex] Setting up message listeners");
  browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    Logger.debug("Message listener triggered with message:", msg);
    Logger.trace("Sender:", sender);
    (async () => {
      Logger.debug("Processing message asynchronously");
      try {
        Logger.debug("Message type:", msg.type);
        switch (msg.type) {
          case "PING":
            Logger.debug("Handling PING");
            sendResponse({ status: "ok" });
            break;
          case "SET_LOG_LEVEL":
            Logger.info("[SmrutiCortex] Handling SET_LOG_LEVEL:", msg.level);
            await Logger.setLevel(msg.level);
            Logger.info("[SmrutiCortex] Log level set to", Logger.getLevel());
            sendResponse({ status: "ok" });
            break;
          case "SETTINGS_CHANGED":
            Logger.debug("Handling SETTINGS_CHANGED:", msg.settings);
            // Check if log level changed and update logger if needed
            if (msg.settings && typeof msg.settings.logLevel === 'number') {
              const currentLevel = Logger.getLevel();
              if (currentLevel !== msg.settings.logLevel) {
                Logger.setLevelInternal(msg.settings.logLevel);
                Logger.info("[SmrutiCortex] Log level updated from SETTINGS_CHANGED", {
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
              Logger.debug("Service worker not initialized yet, rejecting message:", msg.type);
              sendResponse({ error: "Service worker not ready" });
              break;
            }
            switch (msg.type) {
              case "SEARCH_QUERY":
                Logger.debug("Handling SEARCH_QUERY for:", msg.query);
                const results = await runSearch(msg.query);
                Logger.debug("Search completed, results:", results);
                sendResponse({ results });
                break;

              case "REBUILD_INDEX":
                Logger.debug("Handling REBUILD_INDEX");
                await ingestHistory();
                sendResponse({ status: "OK" });
                break;

              // inside messaging onMessage handler
              case "METADATA_CAPTURE": {
                Logger.debug("Handling METADATA_CAPTURE for:", msg.payload.url);
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
                Logger.warn("Unknown message type received:", msg.type);
                sendResponse({ error: "Unknown message type" });
            }
        }
        Logger.debug("Message processing completed");
      } catch (error) {
        Logger.error("Error processing message:", error);
        sendResponse({ error: error.message });
      }
    })();
    Logger.debug("Returning true for async response");
    return true; // async response
  });

  // Now start the main initialization
  await init();
})();

async function init() {
    Logger.info("[SmrutiCortex] Init function called");
    try {
        Logger.debug("Initializing service worker…");

        Logger.debug("Calling openDatabase");
        Logger.info("[SmrutiCortex] Opening database");
        await openDatabase();
        Logger.info("[SmrutiCortex] Database opened");

        // First run: full indexing
        Logger.debug("Checking if already indexed");
        const alreadyIndexed = await new Promise<boolean>((resolve) => {
            Logger.debug("Getting indexedOnce from storage");
            browserAPI.storage.local.get(["indexedOnce"], (data) => {
                Logger.trace("Storage get result:", data);
                resolve(Boolean(data.indexedOnce));
            });
        });
        Logger.debug("Already indexed:", alreadyIndexed);

        if (!alreadyIndexed) {
            Logger.info("Starting initial history ingestion");
            await ingestHistory();
            Logger.info("Initial history ingestion completed");
            Logger.debug("Setting indexedOnce to true");
            browserAPI.storage.local.set({ indexedOnce: true });
        } else {
            Logger.debug("Skipping indexing, already done");
        }

        // Listen for new visits
        Logger.debug("Setting up history listener");
        browserAPI.history.onVisited.addListener(async (item) => {
            Logger.trace("New visit detected:", item.url);
            await ingestHistory(); // lightweight incremental indexing
        });

        // Set up messaging
        Logger.debug("Setting up messaging");

        initialized = true;
        Logger.debug("Service worker initialized flag set");
        // Listen for keyboard commands
        Logger.debug("Setting up command listener");
        try {
            if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
                Logger.debug("Commands API is available, setting up listener");
                browserAPI.commands.onCommand.addListener(async (command) => {
                    Logger.debug("Command received:", command);
                    if (command === "open-popup") {
                        Logger.debug("Opening popup via keyboard shortcut");

                        // Check if popup is already open by trying to send a message first
                        const isPopupOpen = await new Promise<boolean>((resolve) => {
                            Logger.debug("Checking if popup is already open");
                            browserAPI.runtime.sendMessage({ type: "PING" }, (response) => {
                                if (browserAPI.runtime.lastError) {
                                    Logger.debug("Popup not open:", browserAPI.runtime.lastError);
                                    resolve(false);
                                } else {
                                    Logger.debug("Popup is open, response:", response);
                                    resolve(true);
                                }
                            });
                        });

                        if (isPopupOpen) {
                            Logger.debug("Popup is already open, sending focus message");
                            // Send the focus message
                            browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                if (browserAPI.runtime.lastError) {
                                    Logger.debug("Failed to send focus message:", browserAPI.runtime.lastError);
                                }
                            });
                            return;
                        } else {
                            Logger.debug("Popup not open, attempting to open it");
                        }

                        // Open the popup with keyboard shortcut flag
                        if (browserAPI.action && typeof browserAPI.action.openPopup === 'function') {
                            Logger.debug("Using action.openPopup()");
                            try {
                                browserAPI.action.openPopup();
                                Logger.debug("Popup opened successfully");
                                // Send message to popup to focus appropriately
                                setTimeout(() => {
                                    Logger.debug("Sending KEYBOARD_SHORTCUT_OPEN message to popup");
                                    browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                        if (browserAPI.runtime.lastError) {
                                            Logger.debug("Failed to send KEYBOARD_SHORTCUT_OPEN:", browserAPI.runtime.lastError);
                                        }
                                    });
                                }, 100);
                            } catch (error) {
                                Logger.error("Failed to open popup with action.openPopup():", error);
                                Logger.debug("Using final fallback: opening in new tab");
                                // Final fallback: create a new tab with the extension URL
                                browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                            }
                        } else {
                            Logger.debug("action.openPopup not available, using fallback: opening in new tab");
                            // Fallback: create a new tab with the extension URL
                            browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                        }
                    } else {
                        Logger.debug("Unknown command received:", command);
                    }
                });
                Logger.debug("Commands listener set up successfully");
            } else {
                Logger.warn("Commands API not available during init - this may be normal");
                Logger.debug("browserAPI.commands exists:", !!browserAPI.commands);
                if (browserAPI.commands) {
                    Logger.debug("browserAPI.commands properties:", Object.keys(browserAPI.commands));
                    Logger.debug("browserAPI.commands.onCommand:", browserAPI.commands.onCommand);
                }
                Logger.debug("Will retry commands setup later");

                // Try to set up commands listener after a delay
                setTimeout(() => {
                    Logger.debug("Retrying commands setup after delay");
                    try {
                        if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
                            Logger.debug("Commands API now available, setting up listener");
                            browserAPI.commands.onCommand.addListener(async (command) => {
                                Logger.debug("Command received (delayed setup):", command);
                                // ... same command handling code ...
                                if (command === "open-popup") {
                                    Logger.debug("Opening popup via keyboard shortcut (delayed)");

                                    const isPopupOpen = await new Promise<boolean>((resolve) => {
                                        Logger.debug("Checking if popup is already open (delayed)");
                                        browserAPI.runtime.sendMessage({ type: "PING" }, (response) => {
                                            if (browserAPI.runtime.lastError) {
                                                Logger.debug("Popup not open (delayed):", browserAPI.runtime.lastError);
                                                resolve(false);
                                            } else {
                                                Logger.debug("Popup is open (delayed), response:", response);
                                                resolve(true);
                                            }
                                        });
                                    });

                                    if (isPopupOpen) {
                                        Logger.debug("Popup is already open, sending focus message (delayed)");
                                        browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                            if (browserAPI.runtime.lastError) {
                                                Logger.debug("Failed to send focus message (delayed):", browserAPI.runtime.lastError);
                                            }
                                        });
                                        return;
                                    }

                                    if (browserAPI.action && typeof browserAPI.action.openPopup === 'function') {
                                        Logger.debug("Using action.openPopup() (delayed)");
                                        try {
                                            browserAPI.action.openPopup();
                                            Logger.debug("Popup opened successfully (delayed)");
                                            setTimeout(() => {
                                                Logger.debug("Sending KEYBOARD_SHORTCUT_OPEN message to popup (delayed)");
                                                browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" }, () => {
                                                    if (browserAPI.runtime.lastError) {
                                                        Logger.debug("Failed to send KEYBOARD_SHORTCUT_OPEN (delayed):", browserAPI.runtime.lastError);
                                                    }
                                                });
                                            }, 100);
                                        } catch (error) {
                                            Logger.error("Failed to open popup with action.openPopup() (delayed):", error);
                                            Logger.debug("Using final fallback: opening in new tab (delayed)");
                                            browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                                        }
                                    } else {
                                        Logger.debug("action.openPopup not available, using fallback: opening in new tab (delayed)");
                                        browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                                    }
                                } else {
                                    Logger.debug("Unknown command received (delayed):", command);
                                }
                            });
                            Logger.debug("Commands listener set up successfully (delayed)");
                        } else {
                            Logger.warn("Commands API still not available after delay - keyboard shortcuts disabled");
                        }
                    } catch (retryError) {
                        Logger.error("Error setting up commands listener (delayed):", retryError);
                    }
                }, 1000);
            }
        } catch (error) {
            Logger.error("Error setting up commands listener:", error);
        }

        Logger.info("Service worker ready.");
        Logger.info("[SmrutiCortex] Service worker ready");
    } catch (error) {
        Logger.error("Init error:", error);
        Logger.error("[SmrutiCortex] Init error:", error);
    }
}