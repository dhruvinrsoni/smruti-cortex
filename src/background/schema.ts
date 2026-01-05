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
    isBookmark?: boolean;  // true if this URL is bookmarked (v6.0+)
    bookmarkFolders?: string[];  // bookmark folder path(s) if applicable
    bookmarkTitle?: string;  // custom bookmark title (if different from page title)
}