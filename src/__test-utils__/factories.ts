/**
 * Shared test data factories.
 *
 * All factories accept a partial override object and fill in sensible defaults.
 * This eliminates the 12+ local `makeItem` / `makeResult` copies across tests.
 */
import type { IndexedItem } from '../background/schema';
import type { SearchResult } from '../shared/search-ui-base';
import type { SearchDebugSnapshot, SearchDebugResultEntry } from '../background/diagnostics';

/** Create a minimal IndexedItem with sensible defaults. */
export function makeItem(overrides: Partial<IndexedItem> = {}): IndexedItem {
  return {
    url: 'https://example.com',
    title: 'Test Page',
    hostname: 'example.com',
    visitCount: 1,
    lastVisit: Date.now(),
    tokens: ['test', 'page'],
    ...overrides,
  } as IndexedItem;
}

/** Create a minimal SearchResult with sensible defaults. */
export function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    url: 'https://example.com',
    title: 'Example',
    visitCount: 1,
    lastVisit: Date.now(),
    ...overrides,
  };
}

/** Create a minimal SearchDebugResultEntry for ranking report tests. */
export function makeResultEntry(overrides: Partial<SearchDebugResultEntry> = {}): SearchDebugResultEntry {
  return {
    rank: 1,
    url: 'https://example.com',
    title: 'Example Page',
    hostname: 'example.com',
    finalScore: 0.92,
    originalMatchCount: 2,
    intentPriority: 1,
    titleUrlCoverage: 0.85,
    titleUrlQuality: 0.9,
    splitFieldCoverage: 0.8,
    keywordMatch: true,
    aiMatch: false,
    scorerBreakdown: [
      { name: 'title', score: 0.9, weight: 0.3 },
      { name: 'url', score: 0.8, weight: 0.2 },
      { name: 'recency', score: 0.7, weight: 0.15 },
    ],
    ...overrides,
  };
}

/** Create a minimal SearchDebugSnapshot for ranking report tests. */
export function makeSnapshot(overrides: Partial<SearchDebugSnapshot> = {}): SearchDebugSnapshot {
  return {
    timestamp: Date.now(),
    query: 'test query',
    tokens: ['test', 'query'],
    aiExpandedKeywords: [],
    duration: 42.5,
    sortBy: 'best-match',
    showNonMatchingResults: false,
    showDuplicateUrls: false,
    ollamaEnabled: false,
    embeddingsEnabled: false,
    resultCount: 1,
    totalIndexedItems: 100,
    results: [makeResultEntry()],
    ...overrides,
  };
}
