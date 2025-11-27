// scorer-types.ts — Shared interfaces for modular scoring

import { IndexedItem } from "../background/schema";

export interface Scorer {
    name: string;                   // unique name
    weight: number;                 // 0–1 normalized weight
    score: (item: IndexedItem, query: string, allItems?: IndexedItem[]) => number;
}