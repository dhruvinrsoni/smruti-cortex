// indexing.ts — URL ingestion, merging, enrichment, and storage

import { browserAPI } from "../core/helpers";
import { saveIndexedItem } from "./database";
import { tokenize } from "./search/tokenizer";
import { IndexedItem } from "./schema";
import { BRAND_NAME } from "../core/constants";
import { getIndexedItem } from "./database";
import { Logger } from "../core/logger";


export async function ingestHistory(): Promise<void> {
    Logger.info("[Indexing] Starting history ingestion...");
    const historyItems = await new Promise<any[]>((resolve) => {
        browserAPI.history.search(
            { text: "", maxResults: 50000 },
            (results) => resolve(results)
        );
    });
    Logger.info("[Indexing] Found", historyItems.length, "history items");

    Logger.debug("Processing history items for indexing");
    for (const item of historyItems) {
        const indexed: IndexedItem = {
            url: item.url,
            title: item.title || "",
            hostname: new URL(item.url).hostname,
            metaDescription: "",
            metaKeywords: [],
            visitCount: item.visitCount || 1,
            lastVisit: item.lastVisitTime || Date.now(),
            tokens: tokenize(item.title + " " + item.url),
        };

        Logger.trace("Saving indexed item:", item.url);
        await saveIndexedItem(indexed);
    }
    Logger.info("[Indexing] History ingestion completed");
}

// Called by content script metadata updates
// indexing.ts — URL ingestion, merging, enrichment, and storage
/**
 * mergeMetadata: update existing item with metadata captured by content script.
 */
export async function mergeMetadata(
    url: string,
    meta: { description?: string; keywords?: string[]; title?: string }
): Promise<void> {
    try {
        Logger.debug("Merging metadata for URL:", url);
        // Try canonical normalization (if needed)
        const normalizedUrl = url;

        // Fetch existing item
        let item = await getIndexedItem(normalizedUrl);

        if (!item) {
            Logger.debug("No existing item found, creating new item with metadata");
            // If no existing item, create a minimal item so metadata isn't lost
            item = {
                url: normalizedUrl,
                title: meta.title || "",
                hostname: (new URL(normalizedUrl)).hostname,
                metaDescription: meta.description || "",
                metaKeywords: meta.keywords || [],
                visitCount: 1,
                lastVisit: Date.now(),
                tokens: tokenize((meta.title || "") + " " + (meta.description || "") + " " + normalizedUrl),
            };
        } else {
            Logger.trace("Updating existing item with new metadata");
            // merge fields (prefer existing title unless meta.title is present)
            item.title = meta.title && meta.title.length ? meta.title : item.title;
            item.metaDescription = meta.description && meta.description.length ? meta.description : item.metaDescription;
            item.metaKeywords = (meta.keywords && meta.keywords.length) ? meta.keywords : item.metaKeywords;
            // update tokens to include new metadata text
            item.tokens = tokenize(item.title + " " + (item.metaDescription || "") + " " + (item.metaKeywords || []).join(" ") + " " + item.url);
            // do not change visitCount/lastVisit here
        }

        // Save updated item
        Logger.trace("Saving updated item to database");
        await saveIndexedItem(item);
        Logger.debug("Metadata merge completed for:", url);
    } catch (err) {
        Logger.error(`[${BRAND_NAME}] mergeMetadata error:`, err);
    }
}