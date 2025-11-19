// service-worker.ts — Core brain of SmrutiCortex

import { BRAND_NAME } from "../core/constants";
import { openDatabase } from "./database";
import { ingestHistory } from "./indexing";
import { runSearch } from "./search/search-engine";
import { mergeMetadata } from "./indexing";
import { browserAPI } from "../core/helpers";

console.log("[DEBUG] Service worker script starting");

(async function init() {
    console.log("[DEBUG] Init function called");
    try {
        console.log("[DEBUG] Initializing service worker…");

        console.log("[DEBUG] Calling openDatabase");
        await openDatabase();
        console.log("[DEBUG] Database opened successfully");

        // First run: full indexing
        console.log("[DEBUG] Checking if already indexed");
        const alreadyIndexed = await new Promise<boolean>((resolve) => {
            console.log("[DEBUG] Getting indexedOnce from storage");
            browserAPI.storage.local.get(["indexedOnce"], (data) => {
                console.log("[DEBUG] Storage get result:", data);
                resolve(Boolean(data.indexedOnce));
            });
        });
        console.log("[DEBUG] Already indexed:", alreadyIndexed);

        if (!alreadyIndexed) {
            console.log("[DEBUG] Starting history ingestion");
            await ingestHistory();
            console.log("[DEBUG] Setting indexedOnce to true");
            browserAPI.storage.local.set({ indexedOnce: true });
        } else {
            console.log("[DEBUG] Skipping indexing, already done");
        }

        // Listen for new visits
        console.log("[DEBUG] Setting up history listener");
        browserAPI.history.onVisited.addListener(async (item) => {
            console.log("[DEBUG] New visit detected:", item.url);
            await ingestHistory(); // lightweight incremental indexing
        });

        // Set up messaging
        console.log("[DEBUG] Setting up messaging");
        browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            console.log("[DEBUG] Message listener triggered with message:", msg);
            console.log("[DEBUG] Sender:", sender);
            (async () => {
                console.log("[DEBUG] Processing message asynchronously");
                try {
                    console.log("[DEBUG] Message type:", msg.type);
                    switch (msg.type) {
                        case "SEARCH_QUERY":
                            console.log("[DEBUG] Handling SEARCH_QUERY for:", msg.query);
                            const results = await runSearch(msg.query);
                            console.log("[DEBUG] Search completed, results:", results);
                            sendResponse({ results });
                            break;

                        case "REBUILD_INDEX":
                            console.log("[DEBUG] Handling REBUILD_INDEX");
                            await ingestHistory();
                            sendResponse({ status: "OK" });
                            break;

                        case "PING":
                            console.log("[DEBUG] Handling PING");
                            sendResponse({ status: "ok" });
                            break;

                        // inside messaging onMessage handler
                        case "METADATA_CAPTURE": {
                            console.log("[DEBUG] Handling METADATA_CAPTURE for:", msg.payload.url);
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
                            console.log("[DEBUG] Unknown message type:", msg.type);
                            sendResponse({ error: "Unknown message type" });
                    }
                    console.log("[DEBUG] Message processing completed");
                } catch (error) {
                    console.error("[DEBUG] Error processing message:", error);
                    sendResponse({ error: error.message });
                }
            })();
            console.log("[DEBUG] Returning true for async response");
            return true; // async response
        });

        // Listen for keyboard commands
        console.log("[DEBUG] Setting up command listener");
        try {
            if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
                console.log("[DEBUG] Commands API is available, setting up listener");
                browserAPI.commands.onCommand.addListener(async (command) => {
                    console.log("[DEBUG] Command received:", command);
                    if (command === "open-popup") {
                        console.log("[DEBUG] Opening popup via keyboard shortcut");

                        // Check if popup is already open by trying to send a message first
                        try {
                            console.log("[DEBUG] Checking if popup is already open");
                            await browserAPI.runtime.sendMessage({ type: "PING" });
                            console.log("[DEBUG] Popup is already open, sending focus message");
                            // If we get here, popup is open, just send the focus message
                            browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" });
                            return;
                        } catch (pingError) {
                            console.log("[DEBUG] Popup not open or not responding, attempting to open it");
                        }

                        // Open the popup with keyboard shortcut flag
                        if (browserAPI.action && typeof browserAPI.action.openPopup === 'function') {
                            console.log("[DEBUG] Using action.openPopup()");
                            try {
                                await browserAPI.action.openPopup();
                                console.log("[DEBUG] Popup opened successfully");
                                // Send message to popup to focus appropriately
                                setTimeout(() => {
                                    console.log("[DEBUG] Sending KEYBOARD_SHORTCUT_OPEN message to popup");
                                    browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" });
                                }, 100);
                            } catch (error) {
                                console.error("[DEBUG] Failed to open popup with action.openPopup():", error);
                                console.log("[DEBUG] Using final fallback: opening in new tab");
                                // Final fallback: create a new tab with the extension URL
                                browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                            }
                        } else {
                            console.log("[DEBUG] action.openPopup not available, using fallback: opening in new tab");
                            // Fallback: create a new tab with the extension URL
                            browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                        }
                    } else {
                        console.log("[DEBUG] Unknown command received:", command);
                    }
                });
                console.log("[DEBUG] Commands listener set up successfully");
            } else {
                console.warn("[DEBUG] Commands API not available during init - this may be normal");
                console.log("[DEBUG] browserAPI.commands exists:", !!browserAPI.commands);
                if (browserAPI.commands) {
                    console.log("[DEBUG] browserAPI.commands properties:", Object.keys(browserAPI.commands));
                    console.log("[DEBUG] browserAPI.commands.onCommand:", browserAPI.commands.onCommand);
                }
                console.log("[DEBUG] Will retry commands setup later");

                // Try to set up commands listener after a delay
                setTimeout(() => {
                    console.log("[DEBUG] Retrying commands setup after delay");
                    try {
                        if (browserAPI.commands && browserAPI.commands.onCommand && typeof browserAPI.commands.onCommand.addListener === 'function') {
                            console.log("[DEBUG] Commands API now available, setting up listener");
                            browserAPI.commands.onCommand.addListener(async (command) => {
                                console.log("[DEBUG] Command received (delayed setup):", command);
                                // ... same command handling code ...
                                if (command === "open-popup") {
                                    console.log("[DEBUG] Opening popup via keyboard shortcut (delayed)");

                                    try {
                                        console.log("[DEBUG] Checking if popup is already open (delayed)");
                                        await browserAPI.runtime.sendMessage({ type: "PING" });
                                        console.log("[DEBUG] Popup is already open, sending focus message (delayed)");
                                        browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" });
                                        return;
                                    } catch (pingError) {
                                        console.log("[DEBUG] Popup not open or not responding, attempting to open it (delayed)");
                                    }

                                    if (browserAPI.action && typeof browserAPI.action.openPopup === 'function') {
                                        console.log("[DEBUG] Using action.openPopup() (delayed)");
                                        try {
                                            await browserAPI.action.openPopup();
                                            console.log("[DEBUG] Popup opened successfully (delayed)");
                                            setTimeout(() => {
                                                console.log("[DEBUG] Sending KEYBOARD_SHORTCUT_OPEN message to popup (delayed)");
                                                browserAPI.runtime.sendMessage({ type: "KEYBOARD_SHORTCUT_OPEN" });
                                            }, 100);
                                        } catch (error) {
                                            console.error("[DEBUG] Failed to open popup with action.openPopup() (delayed):", error);
                                            console.log("[DEBUG] Using final fallback: opening in new tab (delayed)");
                                            browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                                        }
                                    } else {
                                        console.log("[DEBUG] action.openPopup not available, using fallback: opening in new tab (delayed)");
                                        browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                                    }
                                } else {
                                    console.log("[DEBUG] Unknown command received (delayed):", command);
                                }
                            });
                            console.log("[DEBUG] Commands listener set up successfully (delayed)");
                        } else {
                            console.warn("[DEBUG] Commands API still not available after delay - keyboard shortcuts disabled");
                        }
                    } catch (retryError) {
                        console.error("[DEBUG] Error setting up commands listener (delayed):", retryError);
                    }
                }, 1000);
            }
        } catch (error) {
            console.error("[DEBUG] Error setting up commands listener:", error);
        }

        console.log("[DEBUG] Service worker ready.");
    } catch (error) {
        console.error("[DEBUG] Init error:", error);
    }
})();