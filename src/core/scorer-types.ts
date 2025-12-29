// scorer-types.ts — Shared interfaces for modular scoring

import { IndexedItem } from '../background/schema';

export interface ScorerContext {
    // AI keyword expansion (prompting approach - RECOMMENDED)
    expandedTokens?: string[];     // Original + AI-expanded keywords
    aiExpanded?: boolean;          // True if AI expansion was successful
    
    // Legacy embedding approach (deprecated - not recommended)
    queryEmbedding?: number[];     // Query embedding for cosine similarity
}

export interface Scorer {
    name: string;                   // unique name
    weight: number;                 // 0–1 normalized weight
    score: (item: IndexedItem, query: string, allItems?: IndexedItem[], context?: ScorerContext) => number;
}