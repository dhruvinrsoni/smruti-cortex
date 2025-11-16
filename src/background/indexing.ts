// indexing.ts — URL ingestion, merging, enrichment, and storage

import { browserAPI } from "../core/helpers";
import { saveIndexedItem } from "./database";
import { tokenize } from "./search/tokenizer";
import { IndexedItem } from "./schema";
import { getIndexedItem } from "./database";


export async function ingestHistory(): Promise<void> {
    const historyItems = await new Promise<any[]>((resolve) => {
        browserAPI.history.search(
            { text: "", maxResults: 50000 },
            (results) => resolve(results)
        );
    });

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

        await saveIndexedItem(indexed);
    }
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
        // Try canonical normalization (if needed)
        const normalizedUrl = url;

        // Fetch existing item
        let item = await getIndexedItem(normalizedUrl);

        if (!item) {
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
            // merge fields (prefer existing title unless meta.title is present)
            item.title = meta.title && meta.title.length ? meta.title : item.title;
            item.metaDescription = meta.description && meta.description.length ? meta.description : item.metaDescription;
            item.metaKeywords = (meta.keywords && meta.keywords.length) ? meta.keywords : item.metaKeywords;
            // update tokens to include new metadata text
            item.tokens = tokenize(item.title + " " + (item.metaDescription || "") + " " + (item.metaKeywords || []).join(" ") + " " + item.url);
            // do not change visitCount/lastVisit here
        }

        // Save updated item
        await saveIndexedItem(item);
    } catch (err) {
        console.error("[SmritiCortex] mergeMetadata error:", err);
    }
}