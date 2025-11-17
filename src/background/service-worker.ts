// service-worker.ts — Core brain of SmritiCortex

import { openDatabase } from "./database";
import { ingestHistory } from "./indexing";
import "./messaging";
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