// service-worker.ts — Core brain of SmritiCortex

import { openDatabase } from "./database";
import { ingestHistory } from "./indexing";
import "./messaging";
import { browserAPI } from "../core/helpers";

(async function init() {
    console.log("[SmritiCortex] Initializing service worker…");

    await openDatabase();

    // First run: full indexing
    const alreadyIndexed = await new Promise<boolean>((resolve) => {
        browserAPI.storage.local.get(["indexedOnce"], (data) => {
            resolve(Boolean(data.indexedOnce));
        });
    });

    if (!alreadyIndexed) {
        await ingestHistory();
        browserAPI.storage.local.set({ indexedOnce: true });
    }

    // Listen for new visits
    browserAPI.history.onVisited.addListener(async (item) => {
        console.log("[SmritiCortex] New visit:", item.url);
        await ingestHistory(); // lightweight incremental indexing
    });

    console.log("[SmritiCortex] Ready.");
})();