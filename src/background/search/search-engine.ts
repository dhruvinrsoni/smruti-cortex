// search-engine.ts — SmritiCortex Search Brain

import { getAllIndexedItems } from "../database";
import { getAllScorers } from "./scorer-manager";
import { IndexedItem } from "../../background/schema";
import { tokenize } from "./tokenizer";

export async function runSearch(query: string): Promise<IndexedItem[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const tokens = tokenize(q);
    const scorers = getAllScorers();

    const items = await getAllIndexedItems();
    const results: Array<{ item: IndexedItem; finalScore: number }> = [];

    for (const item of items) {
        // Base filter: quick check before scoring
        const haystack = (item.title + " " + item.url).toLowerCase();
        if (!tokens.every(t => haystack.includes(t))) continue;

        // Run each scorer
        let score = 0;
        for (const scorer of scorers) {
            score += scorer.weight * scorer.score(item, q);
        }

        results.push({ item, finalScore: score });
    }

    // Sort by score DESC
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Return top 50 for speed
    return results.slice(0, 50).map(r => r.item);
}