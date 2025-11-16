// indexing.ts — URL ingestion, merging, enrichment, and storage

import { browserAPI } from "../core/helpers";
import { saveIndexedItem } from "./database";
import { tokenize } from "./search/tokenizer";
import { IndexedItem } from "../core/types";

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
export async function mergeMetadata(
    url: string,
    meta: { description?: string; keywords?: string[] }
): Promise<void> {
    // retrieve existing item
    // update metadata + retokenize
    // save back
}