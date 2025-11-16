// messaging.ts — message router between popup and service worker

import { browserAPI } from "../core/helpers";
import { runSearch } from "./search/search-engine";
import { ingestHistory } from "./indexing";

browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        switch (msg.type) {
            case "SEARCH_QUERY":
                const results = await runSearch(msg.query);
                sendResponse({ results });
                break;

            case "REBUILD_INDEX":
                await ingestHistory();
                sendResponse({ status: "OK" });
                break;

            // inside messaging onMessage handler
            case "METADATA_CAPTURE": {
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
                sendResponse({ error: "Unknown message type" });
        }
    })();
    return true; // async response
});