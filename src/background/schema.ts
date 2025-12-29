// schema.ts — defines the indexed data structure

export interface IndexedItem {
    url: string;
    title: string;
    hostname: string;
    metaKeywords?: string[];
    metaDescription?: string;
    visitCount: number;
    lastVisit: number; // timestamp
    tokens: string[];  // tokenized text for search
    embedding?: number[];  // AI embeddings (optional, generated on-demand)
}