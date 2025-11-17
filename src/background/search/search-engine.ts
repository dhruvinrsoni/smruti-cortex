// search-engine.ts — SmrutiCortex Search Brain

import { BRAND_NAME } from "../../core/constants";
import { getAllIndexedItems } from "../database";
import { getAllScorers } from "./scorer-manager";
import { IndexedItem } from "../../background/schema";
import { tokenize } from "./tokenizer";
import { browserAPI } from "../../core/helpers";

export async function runSearch(query: string): Promise<IndexedItem[]> {
    console.log("[DEBUG] runSearch called with query:", query);
    const q = query.trim().toLowerCase();
    console.log("[DEBUG] Trimmed and lowercased query:", q);
    if (!q) {
        console.log("[DEBUG] Query is empty, returning empty array");
        return [];
    }

    console.log("[DEBUG] Tokenizing query");
    const tokens = tokenize(q);
    console.log("[DEBUG] Tokens:", tokens);
    const scorers = getAllScorers();
    console.log("[DEBUG] Got scorers:", scorers.length);

    console.log("[DEBUG] Getting all indexed items from database");
    const items = await getAllIndexedItems();
    console.log("[DEBUG] Retrieved items from DB:", items.length);

    if (items.length === 0) {
        console.log("[DEBUG] No indexed items, using browser history fallback");
        // Fallback to browser history search
        const historyItems = await new Promise<any[]>((resolve) => {
            console.log("[DEBUG] Searching browser history for:", q);
            browserAPI.history.search({ text: q, maxResults: 50 }, resolve);
        });
        console.log("[DEBUG] Browser history returned:", historyItems.length, "items");
        // Convert to IndexedItem format
        const fallbackItems: IndexedItem[] = historyItems.map(item => ({
            url: item.url,
            title: item.title || "",
            hostname: (() => { try { return new URL(item.url).hostname; } catch { return ""; } })(),
            metaKeywords: [],
            visitCount: item.visitCount || 1,
            lastVisit: item.lastVisitTime || Date.now(),
            tokens: tokenize((item.title || "") + " " + item.url)
        }));
        console.log("[DEBUG] Converted to IndexedItem format:", fallbackItems.length);
        return fallbackItems;
    }

    console.log("[DEBUG] Processing indexed items for scoring");
    const results: Array<{ item: IndexedItem; finalScore: number }> = [];

    for (const item of items) {
        console.log("[DEBUG] Processing item:", item.url);
        // Base filter: quick check before scoring
        const haystack = (item.title + " " + item.url).toLowerCase();
        console.log("[DEBUG] Haystack:", haystack);
        if (!tokens.every(t => haystack.includes(t))) {
            console.log("[DEBUG] Item doesn't match all tokens, skipping");
            continue;
        }

        console.log("[DEBUG] Item matches, calculating score");
        // Run each scorer
        let score = 0;
        for (const scorer of scorers) {
            const scorerScore = scorer.weight * scorer.score(item, q);
            console.log("[DEBUG] Scorer", scorer.name, "gave score:", scorerScore);
            score += scorerScore;
        }

        console.log("[DEBUG] Final score for item:", score);
        results.push({ item, finalScore: score });
    }

    console.log("[DEBUG] Sorting results by score");
    // Sort by score DESC
    results.sort((a, b) => b.finalScore - a.finalScore);

    console.log("[DEBUG] Returning top 50 results");
    // Return top 50 for speed
    return results.slice(0, 50).map(r => r.item);
}