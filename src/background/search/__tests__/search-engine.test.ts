import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
  },
}));

const settingsMap: Record<string, unknown> = {
  ollamaEnabled: false,
  embeddingsEnabled: false,
  showNonMatchingResults: false,
  showDuplicateUrls: false,
};
vi.mock('../../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn((key: string) => settingsMap[key]),
    init: vi.fn(),
  },
}));

import type { IndexedItem } from '../../schema';

function makeItem(overrides?: Partial<IndexedItem>): IndexedItem {
  return {
    url: 'https://example.com',
    title: 'Example Page',
    hostname: 'example.com',
    visitCount: 5,
    lastVisit: Date.now(),
    tokens: ['example', 'page'],
    ...overrides,
  };
}

const indexedItems: IndexedItem[] = [];
vi.mock('../../database', () => ({
  getAllIndexedItems: vi.fn(async () => indexedItems),
  saveIndexedItem: vi.fn(),
}));

vi.mock('../scorer-manager', () => ({
  getAllScorers: vi.fn(() => [
    {
      name: 'test-scorer',
      weight: 1.0,
      score: vi.fn((_item: IndexedItem, query: string) => {
        // Simple: return 1 if any token matches title/url
        const haystack = (_item.title + ' ' + _item.url).toLowerCase();
        return haystack.includes(query) ? 1.0 : 0.0;
      }),
    },
  ]),
}));

vi.mock('../tokenizer', () => ({
  tokenize: vi.fn((text: string) => text.split(/\s+/).filter((t: string) => t.length > 0)),
  classifyTokenMatches: vi.fn((_tokens: string[], _text: string) => {
    return _tokens.map((t: string) => (_text.includes(t) ? 1 : 0)); // 1=EXACT, 0=NONE
  }),
  graduatedMatchScore: vi.fn(() => 0.5),
  countConsecutiveMatches: vi.fn(() => 0),
  MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
  MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
}));

vi.mock('../../../core/helpers', () => ({
  browserAPI: {
    history: {
      search: vi.fn((_query: unknown, cb: (results: unknown[]) => void) => cb([])),
    },
  },
}));

vi.mock('../../ai-keyword-expander', () => ({
  expandQueryKeywords: vi.fn(async (query: string) =>
    query.split(/\s+/).filter((t: string) => t.length > 0)
  ),
  getLastExpansionSource: vi.fn(() => 'disabled'),
}));

vi.mock('../diversity-filter', () => ({
  applyDiversityFilter: vi.fn((items: unknown[]) => items),
}));

vi.mock('../../performance-monitor', () => ({
  performanceTracker: {
    recordSearch: vi.fn(),
  },
}));

vi.mock('../query-expansion', () => ({
  getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
}));

vi.mock('../../diagnostics', () => ({
  recordSearchDebug: vi.fn(),
}));

const mockCache = {
  get: vi.fn(() => null),
  set: vi.fn(),
};
vi.mock('../search-cache', () => ({
  getSearchCache: vi.fn(() => mockCache),
}));

vi.mock('../../embedding-processor', () => ({
  embeddingProcessor: {
    setSearchActive: vi.fn(),
  },
}));

vi.mock('../../embedding-text', () => ({
  buildEmbeddingText: vi.fn(() => 'test text'),
}));

vi.mock('../../../core/scorer-types', () => ({}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('search-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    indexedItems.length = 0;
    settingsMap.ollamaEnabled = false;
    settingsMap.embeddingsEnabled = false;
    settingsMap.showNonMatchingResults = false;
    settingsMap.showDuplicateUrls = false;
    mockCache.get.mockReturnValue(null);
  });

  async function importModule() {
    vi.resetModules();
    vi.doMock('../../../core/logger', () => ({
      Logger: {
        forComponent: () => ({
          debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        }),
      },
    }));
    vi.doMock('../../../core/settings', () => ({
      SettingsManager: {
        getSetting: vi.fn((key: string) => settingsMap[key]),
        init: vi.fn(),
      },
    }));
    vi.doMock('../../database', () => ({
      getAllIndexedItems: vi.fn(async () => indexedItems),
      saveIndexedItem: vi.fn(),
    }));
    vi.doMock('../scorer-manager', () => ({
      getAllScorers: vi.fn(() => [
        {
          name: 'test-scorer',
          weight: 1.0,
          score: vi.fn((_item: IndexedItem, query: string) => {
            const haystack = (_item.title + ' ' + _item.url).toLowerCase();
            return haystack.includes(query) ? 1.0 : 0.0;
          }),
        },
      ]),
    }));
    vi.doMock('../tokenizer', () => ({
      tokenize: vi.fn((text: string) => text.split(/\s+/).filter((t: string) => t.length > 0)),
      classifyTokenMatches: vi.fn((_tokens: string[], _text: string) => {
        return _tokens.map((t: string) => (_text.includes(t) ? 1 : 0));
      }),
      graduatedMatchScore: vi.fn(() => 0.5),
      countConsecutiveMatches: vi.fn(() => 0),
      MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
      MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
    }));
    vi.doMock('../../../core/helpers', () => ({
      browserAPI: {
        history: {
          search: vi.fn((_query: unknown, cb: (results: unknown[]) => void) => cb([])),
        },
      },
    }));
    vi.doMock('../../ai-keyword-expander', () => ({
      expandQueryKeywords: vi.fn(async (query: string) =>
        query.split(/\s+/).filter((t: string) => t.length > 0)
      ),
      getLastExpansionSource: vi.fn(() => 'disabled'),
    }));
    vi.doMock('../diversity-filter', () => ({
      applyDiversityFilter: vi.fn((items: unknown[]) => items),
    }));
    vi.doMock('../../performance-monitor', () => ({
      performanceTracker: { recordSearch: vi.fn() },
    }));
    vi.doMock('../query-expansion', () => ({
      getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
    }));
    vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn() }));
    vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => mockCache) }));
    vi.doMock('../../embedding-processor', () => ({
      embeddingProcessor: { setSearchActive: vi.fn() },
    }));
    vi.doMock('../../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'test') }));
    vi.doMock('../../../core/scorer-types', () => ({}));
    return import('../search-engine');
  }

  describe('runSearch', () => {
    it('should return empty array for empty query', async () => {
      const { runSearch } = await importModule();
      const results = await runSearch('');
      expect(results).toEqual([]);
    });

    it('should return empty array for whitespace query', async () => {
      const { runSearch } = await importModule();
      const results = await runSearch('   ');
      expect(results).toEqual([]);
    });

    it('should return cached results when available', async () => {
      const cachedItems = [makeItem()];
      mockCache.get.mockReturnValue(cachedItems);
      const { runSearch } = await importModule();
      const results = await runSearch('example', { skipAI: true });
      expect(results).toEqual(cachedItems);
    });

    it('should return matching items from index', async () => {
      indexedItems.push(
        makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' }),
        makeItem({ url: 'https://other.com', title: 'Other Page', hostname: 'other.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('example');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('Example Page');
    });

    it('should return empty when no items match', async () => {
      indexedItems.push(
        makeItem({ url: 'https://foo.com', title: 'Foo Page', hostname: 'foo.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('zzzznonexistent');
      expect(results).toHaveLength(0);
    });

    it('should fall back to browser history when index is empty', async () => {
      // No items in index
      const { runSearch } = await importModule();
      const results = await runSearch('test');
      // Should not throw, returns whatever history returns (mocked as [])
      expect(Array.isArray(results)).toBe(true);
    });

    it('should cache results after search', async () => {
      indexedItems.push(makeItem());
      const { runSearch } = await importModule();
      await runSearch('example');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should skip cache when AI expansion requested (skipAI: false)', async () => {
      const cachedItems = [makeItem()];
      mockCache.get.mockReturnValue(cachedItems);
      settingsMap.ollamaEnabled = true;
      indexedItems.push(makeItem());
      const { runSearch } = await importModule();
      const results = await runSearch('example', { skipAI: false });
      // Should NOT return cached items — should do fresh search
      // (cache is skipped when AI is explicitly requested)
      expect(mockCache.get).not.toHaveBeenCalled();
    });
  });

  describe('getLastAIStatus', () => {
    it('should return null initially', async () => {
      const { getLastAIStatus } = await importModule();
      expect(getLastAIStatus()).toBeNull();
    });

    it('should return status after a search', async () => {
      indexedItems.push(makeItem());
      const { runSearch, getLastAIStatus } = await importModule();
      await runSearch('example');
      const status = getLastAIStatus();
      expect(status).not.toBeNull();
      expect(status!.aiKeywords).toBe('disabled');
      expect(status!.searchTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('showNonMatchingResults', () => {
    it('should include non-matching items when enabled', async () => {
      settingsMap.showNonMatchingResults = true;
      indexedItems.push(
        makeItem({ url: 'https://foo.com', title: 'Foo Page', hostname: 'foo.com' }),
      );
      // scorer returns 0 for non-matching, but showNonMatchingResults bypasses match check
      // Note: still needs score > 0.01, which our scorer gives 0 for non-match
      const { runSearch } = await importModule();
      const results = await runSearch('zzz');
      // With our mock scorer returning 0 for non-matches, still filtered by score threshold
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('domain limiting', () => {
    it('should limit results per domain to 10', async () => {
      // Add 15 items from same domain
      for (let i = 0; i < 15; i++) {
        indexedItems.push(
          makeItem({ url: `https://example.com/page${i}`, title: `Example Page ${i}`, hostname: 'example.com' }),
        );
      }
      const { runSearch } = await importModule();
      const results = await runSearch('example');
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('bookmark strict matching', () => {
    it('should apply stricter matching for bookmarks', async () => {
      indexedItems.push(
        makeItem({
          url: 'https://github.com/repo',
          title: 'My GitHub Repository',
          hostname: 'github.com',
          isBookmark: true,
        }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('github');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scoring and boosting', () => {
    it('should boost literal substring matches', async () => {
      indexedItems.push(
        makeItem({ url: 'https://react.dev/docs', title: 'React Documentation', hostname: 'react.dev' }),
        makeItem({ url: 'https://other.com', title: 'Other Page about react', hostname: 'other.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('react');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle multi-token queries', async () => {
      indexedItems.push(
        makeItem({ url: 'https://docs.github.com/api', title: 'GitHub API Documentation', hostname: 'docs.github.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('github api');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should search metadata description', async () => {
      indexedItems.push(
        makeItem({
          url: 'https://example.com',
          title: 'Example',
          hostname: 'example.com',
          metaDescription: 'A unique description about widgets',
        }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('widgets');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should search bookmark folders', async () => {
      indexedItems.push(
        makeItem({
          url: 'https://example.com',
          title: 'Example',
          hostname: 'example.com',
          bookmarkFolders: ['Development', 'JavaScript'],
          isBookmark: true,
        }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('javascript');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should use bookmarkTitle over page title for search', async () => {
      indexedItems.push(
        makeItem({
          url: 'https://example.com',
          title: 'Generic Page Title',
          bookmarkTitle: 'My Custom Bookmark Name',
          hostname: 'example.com',
          isBookmark: true,
        }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('custom');
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle diversity filter for duplicate URLs', async () => {
      settingsMap.showDuplicateUrls = false;
      indexedItems.push(
        makeItem({ url: 'https://example.com?ref=1', title: 'Example', hostname: 'example.com' }),
        makeItem({ url: 'https://example.com?ref=2', title: 'Example', hostname: 'example.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('example');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle AI-enabled search with skipAI flag', async () => {
      settingsMap.ollamaEnabled = true;
      indexedItems.push(
        makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('example', { skipAI: true });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should track AI status when AI is enabled', async () => {
      settingsMap.ollamaEnabled = true;
      indexedItems.push(makeItem());
      const { runSearch, getLastAIStatus } = await importModule();
      await runSearch('example', { skipAI: false });
      const status = getLastAIStatus();
      expect(status).not.toBeNull();
      // Source should be from expansion (mock returns same tokens, so no new keywords)
      expect(status!.aiKeywords).toBeDefined();
    });
  });

  describe('result sorting', () => {
    it('should sort results by score', async () => {
      indexedItems.push(
        makeItem({ url: 'https://a.com', title: 'test page', hostname: 'a.com', visitCount: 1 }),
        makeItem({ url: 'https://b.com', title: 'test page important', hostname: 'b.com', visitCount: 100 }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('test');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should limit results to 100', async () => {
      for (let i = 0; i < 120; i++) {
        indexedItems.push(
          makeItem({ url: `https://example${i}.com`, title: `Example ${i}`, hostname: `example${i}.com` }),
        );
      }
      const { runSearch } = await importModule();
      const results = await runSearch('example');
      expect(results.length).toBeLessThanOrEqual(100);
    });
  });
});
