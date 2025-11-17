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
        browserAPI.commands.onCommand.addListener(async (command) => {
            console.log("[DEBUG] Command received:", command);
            if (command === "open-popup") {
                // Open the popup
                if (browserAPI.action && browserAPI.action.openPopup) {
                    await browserAPI.action.openPopup();
                } else {
                    // Fallback: create a new tab with the extension URL
                    browserAPI.tabs.create({ url: browserAPI.runtime.getURL("popup/popup.html") });
                }
            }
        });

        console.log("[DEBUG] Service worker ready.");
    } catch (error) {
        console.error("[DEBUG] Init error:", error);
    }
})();