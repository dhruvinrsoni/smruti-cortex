// messaging.ts — message router between popup and service worker

import { browserAPI } from "../core/helpers";
import { runSearch } from "./search/search-engine";
import { ingestHistory } from "./indexing";
import { mergeMetadata } from "./indexing";

export function setupMessaging() {
    console.log("[DEBUG] Messaging script loaded, setting up listener");

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
}