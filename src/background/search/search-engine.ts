// search-engine.ts — SmrutiCortex Search Brain

import { BRAND_NAME } from "../../core/constants";
import { getAllIndexedItems } from "../database";
import { getAllScorers } from "./scorer-manager";
import { IndexedItem } from "../../background/schema";
import { tokenize } from "./tokenizer";
import { browserAPI } from "../../core/helpers";
import { Logger } from "../../core/logger";

export async function runSearch(query: string): Promise<IndexedItem[]> {
    Logger.debug("runSearch called with query:", query);
    const q = query.trim().toLowerCase();
    Logger.debug("Trimmed and lowercased query:", q);
    if (!q) {
        Logger.debug("Query is empty, returning empty array");
        return [];
    }

    Logger.debug("Tokenizing query");
    const tokens = tokenize(q);
    Logger.debug("Tokens:", tokens);
    const scorers = getAllScorers();
    Logger.debug("Got scorers:", scorers.length);

    Logger.debug("Getting all indexed items from database");
    const items = await getAllIndexedItems();
    Logger.debug("Retrieved items from DB:", items.length);

    if (items.length === 0) {
        Logger.debug("No indexed items, using browser history fallback");
        // Fallback to browser history search
        const historyItems = await new Promise<any[]>((resolve) => {
            Logger.debug("Searching browser history for:", q);
            browserAPI.history.search({ text: q, maxResults: 50 }, resolve);
        });
        Logger.debug("Browser history returned:", historyItems.length, "items");
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
        Logger.debug("Converted to IndexedItem format:", fallbackItems.length);
        return fallbackItems;
    }

    Logger.debug("Processing indexed items for scoring");
    const results: Array<{ item: IndexedItem; finalScore: number }> = [];

    for (const item of items) {
        Logger.debug("Processing item:", item.url);
        // Base filter: quick check before scoring
        const haystack = (item.title + " " + item.url).toLowerCase();
        Logger.debug("Haystack:", haystack);
        if (!tokens.every(t => haystack.includes(t))) {
            Logger.debug("Item doesn't match all tokens, skipping");
            continue;
        }

        Logger.debug("Item matches, calculating score");
        // Run each scorer
        let score = 0;
        for (const scorer of scorers) {
            const scorerScore = scorer.weight * scorer.score(item, q);
            Logger.debug("Scorer", scorer.name, "gave score:", scorerScore);
            score += scorerScore;
        }

        Logger.debug("Final score for item:", score);
        results.push({ item, finalScore: score });
    }

    Logger.debug("Sorting results by score");
    // Sort by score DESC
    results.sort((a, b) => b.finalScore - a.finalScore);

    Logger.debug("Diversifying results to avoid similar URLs");
    // Diversify: limit to max 3 results per domain for variety
    const diversified: Array<{ item: IndexedItem; finalScore: number }> = [];
    const domainCount = new Map<string, number>();
    const maxPerDomain = 3;
    for (const res of results) {
        const domain = res.item.hostname || "unknown";
        const count = domainCount.get(domain) || 0;
        if (count < maxPerDomain) {
            diversified.push(res);
            domainCount.set(domain, count + 1);
        }
    }

    Logger.debug("Returning top 50 diversified results");
    // Return top 50 for speed
    return diversified.slice(0, 50).map(r => r.item);
}