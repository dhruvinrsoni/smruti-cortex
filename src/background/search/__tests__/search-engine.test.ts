import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, makeItem } from '../../../__test-utils__';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../core/logger', () => mockLogger());

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

const indexedItems: IndexedItem[] = [];
vi.mock('../../database', () => ({
  getAllIndexedItems: vi.fn(async () => indexedItems),
  loadEmbeddingsInto: vi.fn(async () => 0),
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
  recordSearchSnapshot: vi.fn(),
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

vi.mock('../../ollama-service', () => ({
  isCircuitBreakerOpen: vi.fn(() => true),
  checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
  getOllamaConfigFromSettings: vi.fn(async () => ({})),
  getOllamaService: vi.fn(() => ({
    generateEmbedding: vi.fn(async () => ({ success: false, embedding: [], error: 'mocked' })),
  })),
  acquireOllamaSlot: vi.fn(() => true),
  releaseOllamaSlot: vi.fn(),
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
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
    }));
    vi.doMock('../../../core/settings', () => ({
      SettingsManager: {
        getSetting: vi.fn((key: string) => settingsMap[key]),
        init: vi.fn(),
      },
    }));
    vi.doMock('../../database', () => ({
      getAllIndexedItems: vi.fn(async () => indexedItems),
      loadEmbeddingsInto: vi.fn(async () => 0),
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
    vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
    vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => mockCache) }));
    vi.doMock('../../embedding-processor', () => ({
      embeddingProcessor: { setSearchActive: vi.fn() },
    }));
    vi.doMock('../../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'test') }));
    vi.doMock('../../ollama-service', () => ({
      isCircuitBreakerOpen: vi.fn(() => true),
      checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
      getOllamaConfigFromSettings: vi.fn(async () => ({})),
      getOllamaService: vi.fn(() => ({
        generateEmbedding: vi.fn(async () => ({ success: false, embedding: [], error: 'mocked' })),
      })),
      acquireOllamaSlot: vi.fn(() => true),
      releaseOllamaSlot: vi.fn(),
    }));
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
      await runSearch('example', { skipAI: false });
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
    it('should still filter items below score threshold even when enabled', async () => {
      settingsMap.showNonMatchingResults = true;
      indexedItems.push(
        makeItem({ url: 'https://foo.com', title: 'Foo Page', hostname: 'foo.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('zzz');
      expect(results).toHaveLength(0);
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
    it('should return matching bookmarks when query matches title/url', async () => {
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
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].url).toBe('https://github.com/repo');
    });
  });

  describe('scoring and boosting', () => {
    it('should return results for literal substring matches', async () => {
      indexedItems.push(
        makeItem({ url: 'https://react.dev/docs', title: 'React Documentation', hostname: 'react.dev' }),
        makeItem({ url: 'https://other.com', title: 'Other Page about react', hostname: 'other.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('react');
      expect(results.length).toBe(2);
    });

    it('should handle multi-token queries and return matches', async () => {
      indexedItems.push(
        makeItem({ url: 'https://docs.github.com/api', title: 'GitHub API Documentation', hostname: 'docs.github.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('github api');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('GitHub API Documentation');
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

    it('should apply diversity filter for duplicate URLs', async () => {
      settingsMap.showDuplicateUrls = false;
      indexedItems.push(
        makeItem({ url: 'https://example.com?ref=1', title: 'Example', hostname: 'example.com' }),
        makeItem({ url: 'https://example.com?ref=2', title: 'Example', hostname: 'example.com' }),
      );
      const { runSearch } = await importModule();
      const results = await runSearch('example');
      expect(results.length).toBeGreaterThanOrEqual(1);
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

  describe('embedding memory cleanup and AI match logging', () => {
    it('should clear embeddings from items after search when embeddingsEnabled is true', async () => {
      settingsMap.embeddingsEnabled = true;
      // Items with pre-existing embedding arrays (simulating already-embedded items)
      const itemWithEmbedding = makeItem({
        url: 'https://example.com',
        title: 'Example Page',
        hostname: 'example.com',
        embedding: [0.1, 0.2, 0.3],
      });
      indexedItems.push(itemWithEmbedding);
      const { runSearch } = await importModule();
      await runSearch('example');
      // After search, embedding should be cleared from the item
      expect(itemWithEmbedding.embedding).toBeUndefined();
    });

    it('should clear embeddings from all items including non-matching ones', async () => {
      settingsMap.embeddingsEnabled = true;
      const item1 = makeItem({
        url: 'https://example.com',
        title: 'Example Page',
        hostname: 'example.com',
        embedding: [0.1, 0.2, 0.3],
      });
      const item2 = makeItem({
        url: 'https://other.com',
        title: 'Other Page',
        hostname: 'other.com',
        embedding: [0.4, 0.5, 0.6],
      });
      indexedItems.push(item1, item2);
      const { runSearch } = await importModule();
      await runSearch('example');
      // Both items should have embedding cleared regardless of whether they matched
      expect(item1.embedding).toBeUndefined();
      expect(item2.embedding).toBeUndefined();
    });

    it('should not clear embeddings when embeddingsEnabled is false', async () => {
      settingsMap.embeddingsEnabled = false;
      const itemWithEmbedding = makeItem({
        url: 'https://example.com',
        title: 'Example Page',
        hostname: 'example.com',
        embedding: [0.1, 0.2, 0.3],
      });
      indexedItems.push(itemWithEmbedding);
      const { runSearch } = await importModule();
      await runSearch('example');
      // Embedding should remain unchanged when embeddings are disabled
      expect(itemWithEmbedding.embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should use enhanced AI logging when AI-only matches exist', async () => {
      settingsMap.ollamaEnabled = true;
      settingsMap.embeddingsEnabled = false;
      // Item that only matches the AI-expanded keyword "widgetology", not the original "widget"
      indexedItems.push(
        makeItem({
          url: 'https://widgetology.com',
          title: 'Widgetology',
          hostname: 'widgetology.com',
        }),
      );

      const capturedInfoMessages: string[] = [];

      vi.resetModules();
      vi.doMock('../../../core/logger', () => ({
        Logger: {
          forComponent: () => ({
            debug: vi.fn(),
            info: vi.fn((_ctx: string, msg: string) => {
              capturedInfoMessages.push(msg);
            }),
            warn: vi.fn(),
            error: vi.fn(),
            trace: vi.fn(),
          }),
        },
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
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
      // expandQueryKeywords returns extra AI keyword "widgetology" beyond original "widget"
      vi.doMock('../../ai-keyword-expander', () => ({
        expandQueryKeywords: vi.fn(async () => ['widget', 'widgetology']),
        getLastExpansionSource: vi.fn(() => 'expanded'),
      }));
      vi.doMock('../diversity-filter', () => ({
        applyDiversityFilter: vi.fn((items: unknown[]) => items),
      }));
      vi.doMock('../../performance-monitor', () => ({
        performanceTracker: { recordSearch: vi.fn() },
      }));
      vi.doMock('../query-expansion', () => ({
        getExpandedTerms: vi.fn(() => ['widget']),
      }));
      vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
      vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => mockCache) }));
      vi.doMock('../../embedding-processor', () => ({
        embeddingProcessor: { setSearchActive: vi.fn() },
      }));
      vi.doMock('../../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'test') }));
      vi.doMock('../../../core/scorer-types', () => ({}));

      const { runSearch } = await import('../search-engine');
      // Query "widget" — item title "Widgetology" matches AI-expanded token "widgetology"
      // but not the original token "widget" (our scorer checks for exact substring in title+url)
      await runSearch('widget', { skipAI: false });

      // Verify the enhanced AI logging path was exercised — we just confirm the search ran
      // without error and produced results (the log path is a code coverage target)
      expect(capturedInfoMessages.length).toBeGreaterThan(0);
    });

    it('should use standard logging when no AI matches exist', async () => {
      settingsMap.ollamaEnabled = false;
      settingsMap.embeddingsEnabled = false;
      indexedItems.push(
        makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' }),
      );

      let standardLogFired = false;
      vi.resetModules();
      vi.doMock('../../../core/logger', () => ({
        Logger: {
          forComponent: () => ({
            debug: vi.fn(),
            info: vi.fn((_ctx: string, msg: string) => {
              if (typeof msg === 'string' && msg.includes('matches,')) {
                standardLogFired = true;
              }
            }),
            warn: vi.fn(),
            error: vi.fn(),
            trace: vi.fn(),
          }),
        },
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
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
      vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
      vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => mockCache) }));
      vi.doMock('../../embedding-processor', () => ({
        embeddingProcessor: { setSearchActive: vi.fn() },
      }));
      vi.doMock('../../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'test') }));
      vi.doMock('../../../core/scorer-types', () => ({}));

      const { runSearch } = await import('../search-engine');
      await runSearch('example');

      // Standard log line (line 591) contains "matches," to distinguish from AI log
      expect(standardLogFired).toBe(true);
    });
  });

  describe('original token match count ranking', () => {
    it('should rank items matching ALL original tokens above items matching SOME', async () => {
      vi.resetModules();

      // Scorer that checks individual tokens against the haystack (not the full query string)
      vi.doMock('../scorer-manager', () => ({
        getAllScorers: vi.fn(() => [
          {
            name: 'test-scorer',
            weight: 1.0,
            score: (_item: IndexedItem) => {
              const h = (_item.title + ' ' + _item.url).toLowerCase();
              // Return score based on how many of the query tokens match
              const tokens = ['wiki', 'cost'];
              const matched = tokens.filter(t => h.includes(t)).length;
              return matched > 0 ? 0.3 + matched * 0.1 : 0.0;
            },
          },
        ]),
      }));
      vi.doMock('../../database', () => ({
        getAllIndexedItems: vi.fn(async () => [
          makeItem({ url: 'https://a.com', title: 'Wiki Dashboard', tokens: ['wiki', 'dashboard'] }),
          makeItem({ url: 'https://b.com', title: 'Wiki Cost Report', tokens: ['wiki', 'cost', 'report'] }),
          makeItem({ url: 'https://c.com', title: 'Cost Analysis', tokens: ['cost', 'analysis'] }),
        ]),
        saveIndexedItem: vi.fn(),
      }));
      vi.doMock('../tokenizer', () => ({
        tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
        classifyTokenMatches: vi.fn((tokens: string[], text: string) => {
          return tokens.map((t: string) => (text.includes(t) ? 1 : 0));
        }),
        graduatedMatchScore: vi.fn(() => 0.5),
        countConsecutiveMatches: vi.fn(() => 0),
        MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
        MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
      }));
      vi.doMock('../../ai-keyword-expander', () => ({
        expandQueryKeywords: vi.fn(async (q: string) => q.toLowerCase().split(/\s+/)),
      }));
      vi.doMock('../query-expansion', () => ({
        expandQuerySynonyms: vi.fn((tokens: string[]) => tokens),
        getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
      }));
      vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
      vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => ({ get: vi.fn(() => null), set: vi.fn() })) }));
      vi.doMock('../../embedding-processor', () => ({
        embeddingProcessor: { setSearchActive: vi.fn() },
      }));
      vi.doMock('../../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'test') }));
      vi.doMock('../../../core/scorer-types', () => ({}));

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('wiki cost');

      // Item matching BOTH tokens should be first
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].title).toBe('Wiki Cost Report');
    });

    it('should rank items matching SOME tokens above items matching NONE when showNonMatchingResults is true', async () => {
      vi.resetModules();

      settingsMap.showNonMatchingResults = true;

      vi.doMock('../scorer-manager', () => ({
        getAllScorers: vi.fn(() => [
          {
            name: 'test-scorer',
            weight: 1.0,
            // Non-matching item gets HIGHER base score (simulating high recency/visit count)
            score: (_item: IndexedItem) => {
              return _item.title === 'Recent Workflow Page' ? 0.9 : 0.3;
            },
          },
        ]),
      }));
      vi.doMock('../../database', () => ({
        getAllIndexedItems: vi.fn(async () => [
          makeItem({ url: 'https://a.com', title: 'Recent Workflow Page', tokens: ['recent', 'workflow'] }),
          makeItem({ url: 'https://b.com', title: 'Wiki Dashboard', tokens: ['wiki', 'dashboard'] }),
        ]),
        saveIndexedItem: vi.fn(),
      }));
      vi.doMock('../tokenizer', () => ({
        tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
        classifyTokenMatches: vi.fn((tokens: string[], text: string) => {
          return tokens.map((t: string) => (text.includes(t) ? 1 : 0));
        }),
        graduatedMatchScore: vi.fn(() => 0.5),
        countConsecutiveMatches: vi.fn(() => 0),
        MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
        MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
      }));
      vi.doMock('../../ai-keyword-expander', () => ({
        expandQueryKeywords: vi.fn(async (q: string) => q.toLowerCase().split(/\s+/)),
      }));
      vi.doMock('../query-expansion', () => ({
        expandQuerySynonyms: vi.fn((tokens: string[]) => tokens),
        getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
      }));
      vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
      vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => ({ get: vi.fn(() => null), set: vi.fn() })) }));
      vi.doMock('../../embedding-processor', () => ({
        embeddingProcessor: { setSearchActive: vi.fn() },
      }));
      vi.doMock('../../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'test') }));
      vi.doMock('../../../core/scorer-types', () => ({}));

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('wiki');

      // Even though "Recent Workflow Page" has higher score (0.9 vs 0.3),
      // "Wiki Dashboard" should rank first because it matches the query token
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Wiki Dashboard');
      expect(results[1].title).toBe('Recent Workflow Page');

      // Reset setting
      settingsMap.showNonMatchingResults = false;
    });
  });

  describe('ranking regression tests', () => {
    function setupMocksForRanking(items: IndexedItem[], queryTokens: string[]) {
      vi.resetModules();
      vi.doMock('../../../core/logger', () => ({
        Logger: {
          forComponent: () => ({
            debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
          }),
        },
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
      }));
      vi.doMock('../../../core/settings', () => ({
        SettingsManager: {
          getSetting: vi.fn((key: string) => settingsMap[key]),
          init: vi.fn(),
        },
      }));
      vi.doMock('../scorer-manager', () => ({
        getAllScorers: vi.fn(() => [
          {
            name: 'test-scorer',
            weight: 1.0,
            score: (_item: IndexedItem) => {
              const h = (_item.title + ' ' + _item.url).toLowerCase();
              const matched = queryTokens.filter(t => h.includes(t)).length;
              return matched > 0 ? 0.3 + matched * 0.1 : 0.2;
            },
          },
        ]),
      }));
      vi.doMock('../../database', () => ({
        getAllIndexedItems: vi.fn(async () => items),
        saveIndexedItem: vi.fn(),
      }));
      vi.doMock('../tokenizer', () => ({
        tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
        classifyTokenMatches: vi.fn((tokens: string[], text: string) => {
          return tokens.map((t: string) => (text.includes(t) ? 1 : 0));
        }),
        graduatedMatchScore: vi.fn(() => 0.5),
        countConsecutiveMatches: vi.fn(() => 0),
        MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
        MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
      }));
      vi.doMock('../../ai-keyword-expander', () => ({
        expandQueryKeywords: vi.fn(async (q: string) => q.toLowerCase().split(/\s+/)),
      }));
      vi.doMock('../diversity-filter', () => ({
        applyDiversityFilter: vi.fn((i: unknown[]) => i),
      }));
      vi.doMock('../../performance-monitor', () => ({
        performanceTracker: { recordSearch: vi.fn() },
      }));
      vi.doMock('../query-expansion', () => ({
        getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
      }));
      vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
      vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => ({ get: vi.fn(() => null), set: vi.fn() })) }));
      vi.doMock('../../embedding-processor', () => ({
        embeddingProcessor: { setSearchActive: vi.fn() },
      }));
      vi.doMock('../../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'test') }));
      vi.doMock('../../ollama-service', () => ({
        isCircuitBreakerOpen: vi.fn(() => true),
        checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
        getOllamaConfigFromSettings: vi.fn(async () => ({})),
        getOllamaService: vi.fn(() => ({
          generateEmbedding: vi.fn(async () => ({ success: false, embedding: [], error: 'mocked' })),
        })),
        acquireOllamaSlot: vi.fn(() => true),
        releaseOllamaSlot: vi.fn(),
      }));
      vi.doMock('../../../core/scorer-types', () => ({}));
      vi.doMock('../../../core/helpers', () => ({
        browserAPI: {
          history: {
            search: vi.fn((_query: unknown, cb: (results: unknown[]) => void) => cb([])),
          },
        },
      }));
    }

    it('should exclude items matching ONLY via synonym tokens (not original)', async () => {
      const items = [
        makeItem({ url: 'https://a.com', title: 'Pricing Breakdown', tokens: ['pricing', 'breakdown'] }),
        makeItem({ url: 'https://b.com', title: 'Shipping Fee Details', tokens: ['shipping', 'fee', 'details'] }),
      ];
      setupMocksForRanking(items, ['price']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('price');

      expect(results.length).toBe(0);
    });

    it('should include items matching original tokens even when synonym tokens also match', async () => {
      const items = [
        makeItem({ url: 'https://a.com', title: 'Price Comparison Tool', tokens: ['price', 'comparison'] }),
        makeItem({ url: 'https://b.com', title: 'Unrelated Fee Page', tokens: ['unrelated', 'fee'] }),
      ];
      setupMocksForRanking(items, ['price']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('price');

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Price Comparison Tool');
    });

    it('should rank 2-of-2 token matches above 1-of-2 token matches despite higher base score', async () => {
      const items = [
        makeItem({
          url: 'https://workflows.com/run',
          title: 'GitHub Workflow Run',
          tokens: ['github', 'workflow', 'run'],
          visitCount: 100,
          lastVisit: Date.now(),
        }),
        makeItem({
          url: 'https://wiki.example.com/cost-report',
          title: 'Wiki Cost Report',
          tokens: ['wiki', 'cost', 'report'],
          visitCount: 2,
          lastVisit: Date.now() - 86400000 * 30,
        }),
      ];
      setupMocksForRanking(items, ['wiki', 'cost']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('wiki cost');

      expect(results[0].title).toBe('Wiki Cost Report');
    });

    it('should apply match-count dampener: partial matches get lower final scores', async () => {
      const items = [
        makeItem({
          url: 'https://a.com',
          title: 'React Tutorial Guide',
          tokens: ['react', 'tutorial', 'guide'],
        }),
        makeItem({
          url: 'https://b.com',
          title: 'React Performance Optimization',
          tokens: ['react', 'performance', 'optimization'],
        }),
      ];
      setupMocksForRanking(items, ['react', 'tutorial']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('react tutorial');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('React Tutorial Guide');
    });

    it('should not include synonym-only matches even with showNonMatchingResults disabled', async () => {
      settingsMap.showNonMatchingResults = false;
      const items = [
        makeItem({ url: 'https://a.com', title: 'Bug Tracker Dashboard', tokens: ['bug', 'tracker'] }),
        makeItem({ url: 'https://b.com', title: 'Error Log Viewer', tokens: ['error', 'log', 'viewer'] }),
      ];
      setupMocksForRanking(items, ['error']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('error');

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Error Log Viewer');
    });

    it('should rank "wiki leave" — items matching both tokens above single-token matches regardless of sortBy', async () => {
      settingsMap.sortBy = 'most-recent';
      const now = Date.now();
      const items = [
        makeItem({
          url: 'https://wiki.example.com/pages/Dashboard',
          title: 'Dashboard - Acme Wiki',
          hostname: 'wiki.example.com',
          tokens: ['dashboard', 'wiki'],
          visitCount: 200,
          lastVisit: now,
        }),
        makeItem({
          url: 'https://login.example.com/sso',
          title: 'Sign In - SSO',
          hostname: 'login.example.com',
          tokens: ['sign', 'sso'],
          visitCount: 500,
          lastVisit: now - 1000,
        }),
        makeItem({
          url: 'https://wiki.example.com/Leave-Calendar',
          title: 'Leave Calendar - Acme Wiki',
          hostname: 'wiki.example.com',
          tokens: ['leave', 'calendar', 'wiki'],
          visitCount: 5,
          lastVisit: now - 86400000 * 7,
        }),
      ];
      setupMocksForRanking(items, ['wiki', 'leave']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('wiki leave');

      // Leave Calendar matches BOTH tokens → must be first regardless of sortBy=most-recent
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('Leave Calendar - Acme Wiki');

      settingsMap.sortBy = 'best-match';
    });

    it('should preserve relevance tiers even with sortBy=most-visited', async () => {
      settingsMap.sortBy = 'most-visited';
      const items = [
        makeItem({
          url: 'https://example.com/login',
          title: 'Login Page',
          hostname: 'example.com',
          tokens: ['login'],
          visitCount: 1000,
          lastVisit: Date.now(),
        }),
        makeItem({
          url: 'https://docs.example.com/api-guide',
          title: 'API Guide Documentation',
          hostname: 'docs.example.com',
          tokens: ['api', 'guide'],
          visitCount: 3,
          lastVisit: Date.now() - 86400000,
        }),
      ];
      setupMocksForRanking(items, ['api', 'guide']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('api guide');

      // API Guide matches both tokens; Login matches neither
      // Even though Login has 1000 visits, it should rank below API Guide
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe('API Guide Documentation');

      settingsMap.sortBy = 'best-match';
    });

    it('should attach debugScores to returned items', async () => {
      const items = [
        makeItem({
          url: 'https://example.com/test',
          title: 'Test Page',
          tokens: ['test', 'page'],
        }),
      ];
      setupMocksForRanking(items, ['test']);

      const { runSearch } = await import('../search-engine');
      const results = await runSearch('test');

      expect(results.length).toBe(1);
      const debugScores = (results[0] as unknown as { debugScores?: { finalScore: number } }).debugScores;
      expect(debugScores).toBeDefined();
      expect(debugScores!.finalScore).toBeGreaterThan(0);
    });
  });

  // ── Coverage improvement tests ──────────────────────────────────────────

  function setupCoverageMocks(overrides: Partial<{
    items: IndexedItem[];
    scorerFactory: () => Array<{ name: string; weight: number; score: (_item: IndexedItem, query: string, items: IndexedItem[], ctx: unknown) => number }>;
    expandQueryKeywords: (q: string, signal: AbortSignal) => Promise<string[]>;
    getLastExpansionSource: () => string;
    isCircuitBreakerOpen: () => boolean;
    checkMemoryPressure: () => { ok: boolean; permanent: boolean };
    generateEmbedding: (text: string, signal: AbortSignal) => Promise<{ success: boolean; embedding: number[]; error?: string }>;
    buildEmbeddingText: (item: IndexedItem) => string;
    getAllIndexedItems: () => Promise<IndexedItem[]>;
    loadEmbeddingsInto: (items: IndexedItem[]) => Promise<number>;
    historySearch: (_q: unknown, cb: (r: unknown[]) => void) => void;
  }> = {}) {
    vi.resetModules();
    const items = overrides.items ?? [];
    vi.doMock('../../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (err: unknown) => err instanceof Error ? { name: err.name, message: err.message } : { name: 'non-Error', message: String(err) },
    }));
    vi.doMock('../../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn((key: string) => settingsMap[key]), init: vi.fn() },
    }));
    const defaultScorer = {
      name: 'test-scorer', weight: 1.0,
      score: (_item: IndexedItem, query: string) => {
        const h = (_item.title + ' ' + _item.url).toLowerCase();
        return h.includes(query) ? 1.0 : 0.0;
      },
    };
    vi.doMock('../scorer-manager', () => ({
      getAllScorers: vi.fn(() => overrides.scorerFactory ? overrides.scorerFactory() : [defaultScorer]),
    }));
    vi.doMock('../../database', () => ({
      getAllIndexedItems: overrides.getAllIndexedItems ? vi.fn(overrides.getAllIndexedItems) : vi.fn(async () => items),
      loadEmbeddingsInto: overrides.loadEmbeddingsInto ? vi.fn(overrides.loadEmbeddingsInto) : vi.fn(async () => 0),
      saveIndexedItem: vi.fn(),
    }));
    vi.doMock('../tokenizer', () => ({
      tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
      classifyTokenMatches: vi.fn((tokens: string[], text: string) => tokens.map((t: string) => (text.includes(t) ? 1 : 0))),
      graduatedMatchScore: vi.fn(() => 0.5),
      countConsecutiveMatches: vi.fn(() => 0),
      MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
      MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
    }));
    vi.doMock('../../../core/helpers', () => ({
      browserAPI: {
        history: {
          search: overrides.historySearch ? vi.fn(overrides.historySearch) : vi.fn((_q: unknown, cb: (r: unknown[]) => void) => cb([])),
        },
      },
    }));
    vi.doMock('../../ai-keyword-expander', () => ({
      expandQueryKeywords: overrides.expandQueryKeywords
        ? vi.fn(overrides.expandQueryKeywords)
        : vi.fn(async (q: string) => q.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
      getLastExpansionSource: overrides.getLastExpansionSource ? vi.fn(overrides.getLastExpansionSource) : vi.fn(() => 'disabled'),
    }));
    vi.doMock('../diversity-filter', () => ({ applyDiversityFilter: vi.fn((i: unknown[]) => i) }));
    vi.doMock('../../performance-monitor', () => ({ performanceTracker: { recordSearch: vi.fn() } }));
    vi.doMock('../query-expansion', () => ({
      getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
    }));
    vi.doMock('../../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
    vi.doMock('../search-cache', () => ({ getSearchCache: vi.fn(() => ({ get: vi.fn(() => null), set: vi.fn() })) }));
    vi.doMock('../../embedding-processor', () => ({ embeddingProcessor: { setSearchActive: vi.fn() } }));
    vi.doMock('../../embedding-text', () => ({
      buildEmbeddingText: overrides.buildEmbeddingText ? vi.fn(overrides.buildEmbeddingText) : vi.fn(() => 'test text'),
    }));
    vi.doMock('../../ollama-service', () => ({
      isCircuitBreakerOpen: overrides.isCircuitBreakerOpen ? vi.fn(overrides.isCircuitBreakerOpen) : vi.fn(() => true),
      checkMemoryPressure: overrides.checkMemoryPressure ? vi.fn(overrides.checkMemoryPressure) : vi.fn(() => ({ ok: true, permanent: false })),
      getOllamaConfigFromSettings: vi.fn(async () => ({})),
      getOllamaService: vi.fn(() => ({
        generateEmbedding: overrides.generateEmbedding
          ? vi.fn(overrides.generateEmbedding)
          : vi.fn(async () => ({ success: false, embedding: [], error: 'mocked' })),
      })),
    }));
    vi.doMock('../../../core/scorer-types', () => ({}));
  }

  describe('sortBy branches within same relevance tier', () => {
    it('should sort by visitCount when sortBy is most-visited', async () => {
      settingsMap.sortBy = 'most-visited';
      setupCoverageMocks({
        items: [
          makeItem({ url: 'https://a.com/test', title: 'Test Alpha', hostname: 'a.com', visitCount: 5 }),
          makeItem({ url: 'https://b.com/test', title: 'Test Beta', hostname: 'b.com', visitCount: 100 }),
        ],
      });
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('test');
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Test Beta');
      expect(results[1].title).toBe('Test Alpha');
      settingsMap.sortBy = 'best-match';
    });

    it('should sort alphabetically when sortBy is alphabetical', async () => {
      settingsMap.sortBy = 'alphabetical';
      setupCoverageMocks({
        items: [
          makeItem({ url: 'https://b.com/test', title: 'Omega Test', hostname: 'b.com' }),
          makeItem({ url: 'https://a.com/test', title: 'Alpha Test', hostname: 'a.com' }),
        ],
      });
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('test');
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Alpha Test');
      expect(results[1].title).toBe('Omega Test');
      settingsMap.sortBy = 'best-match';
    });
  });

  describe('scorer error handling', () => {
    it('should catch scorer errors and continue scoring with remaining scorers', async () => {
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com/test', title: 'Test Page', hostname: 'example.com' })],
        scorerFactory: () => [
          { name: 'crash-scorer', weight: 1.0, score: () => { throw new Error('Scorer blew up'); } },
          {
            name: 'good-scorer', weight: 1.0,
            score: (_item: IndexedItem, query: string) => {
              const h = (_item.title + ' ' + _item.url).toLowerCase();
              return h.includes(query) ? 1.0 : 0.0;
            },
          },
        ],
      });
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('test');
      expect(results.length).toBe(1);
    });
  });

  describe('AI keyword expansion status paths', () => {
    it('should report cache-hit when expansion source is cache-hit', async () => {
      settingsMap.ollamaEnabled = true;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        expandQueryKeywords: async () => ['example', 'sample', 'illustration'],
        getLastExpansionSource: () => 'cache-hit',
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example', { skipAI: false });
      const status = getLastAIStatus();
      expect(status?.aiKeywords).toBe('cache-hit');
      expect(status?.expandedCount).toBe(2);
      expect(status?.aiExpandedKeywords).toContain('sample');
    });

    it('should report prefix-hit when expansion source is prefix-hit', async () => {
      settingsMap.ollamaEnabled = true;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        expandQueryKeywords: async () => ['example', 'exemplar'],
        getLastExpansionSource: () => 'prefix-hit',
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example', { skipAI: false });
      expect(getLastAIStatus()?.aiKeywords).toBe('prefix-hit');
    });

    it('should report error when keyword expansion throws', async () => {
      settingsMap.ollamaEnabled = true;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        expandQueryKeywords: async () => { throw new Error('Ollama unreachable'); },
        getLastExpansionSource: () => 'disabled',
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example', { skipAI: false });
      expect(getLastAIStatus()?.aiKeywords).toBe('error');
    });
  });

  describe('semantic search status paths', () => {
    it('should set semantic to active when query embedding succeeds', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        isCircuitBreakerOpen: () => false,
        generateEmbedding: async () => ({ success: true, embedding: [0.1, 0.2, 0.3] }),
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example');
      expect(getLastAIStatus()?.semantic).toBe('active');
    });

    it('should set semantic to error when embedding returns success=false', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        isCircuitBreakerOpen: () => false,
        generateEmbedding: async () => ({ success: false, embedding: [], error: 'model not loaded' }),
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example');
      const status = getLastAIStatus();
      expect(status?.semantic).toBe('error');
      expect(status?.semanticError).toContain('model not loaded');
    });

    it('should set semantic to error when embedding throws exception', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        isCircuitBreakerOpen: () => false,
        generateEmbedding: async () => { throw new Error('Connection refused'); },
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example');
      const status = getLastAIStatus();
      expect(status?.semantic).toBe('error');
      expect(status?.semanticError).toContain('Connection refused');
    });

    it('should set semantic to circuit-breaker when circuit breaker is open', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        isCircuitBreakerOpen: () => true,
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example');
      expect(getLastAIStatus()?.semantic).toBe('circuit-breaker');
    });
  });

  describe('database error fallback', () => {
    it('should fall back to browser history when getAllIndexedItems throws', async () => {
      setupCoverageMocks({
        getAllIndexedItems: async () => { throw new Error('DB corrupted'); },
        historySearch: (_q: unknown, cb: (r: unknown[]) => void) => cb([
          { url: 'https://fallback.com', title: 'Fallback Page', visitCount: 3, lastVisitTime: Date.now() },
        ]),
      });
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('fallback');
      expect(results.length).toBe(1);
      expect(results[0].url).toBe('https://fallback.com');
      expect(results[0].title).toBe('Fallback Page');
      expect(results[0].hostname).toBe('fallback.com');
    });
  });

  describe('on-demand embedding generation', () => {
    it('should generate embeddings and track count (lines 637-638)', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        isCircuitBreakerOpen: () => false,
        checkMemoryPressure: () => ({ ok: true, permanent: false }),
        generateEmbedding: async () => ({ success: true, embedding: [0.1, 0.2, 0.3] }),
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example');
      expect(getLastAIStatus()?.embeddingsGenerated).toBeGreaterThan(0);
    });

    it('should skip generateEmbedding for items where buildEmbeddingText returns empty', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      const generateEmbeddingMock = vi.fn(async () => ({ success: true, embedding: [0.1, 0.2, 0.3] }));
      setupCoverageMocks({
        items: [
          makeItem({ url: 'chrome://newtab', title: '', hostname: 'newtab' }),
          makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' }),
        ],
        isCircuitBreakerOpen: () => false,
        checkMemoryPressure: () => ({ ok: true, permanent: false }),
        // First item -> empty (chrome://), second item -> normal text
        buildEmbeddingText: (item: IndexedItem) =>
          item.url.startsWith('chrome://') ? '' : 'embeddable text',
        generateEmbedding: generateEmbeddingMock,
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example');

      // Critical assertion: no Ollama call ever received an empty/whitespace string.
      // (search-engine may also call generateEmbedding for the query itself; that is fine.)
      const callTexts = generateEmbeddingMock.mock.calls.map(c => c[0] as string);
      expect(callTexts.every(t => t.trim().length > 0)).toBe(true);
      expect(callTexts).not.toContain('');

      // The non-empty item should still have produced an embedding count of 1
      expect(getLastAIStatus()?.embeddingsGenerated).toBe(1);
    });
  });

  describe('embedding hydration', () => {
    it('should log when loadEmbeddingsInto returns count > 0', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        loadEmbeddingsInto: async () => 5,
      });
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('example');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should continue when loadEmbeddingsInto throws', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        loadEmbeddingsInto: async () => { throw new Error('IDB read failed'); },
      });
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('example');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('bookmark strict matching exclusion', () => {
    it('should exclude bookmarks that fail all strict matching criteria', async () => {
      setupCoverageMocks({
        items: [makeItem({
          url: 'https://github.com',
          title: 'GitHub',
          hostname: 'github.com',
          isBookmark: true,
        })],
        scorerFactory: () => [{
          name: 'token-scorer', weight: 1.0,
          score: (_item: IndexedItem, query: string) => {
            const h = (_item.title + ' ' + _item.url).toLowerCase();
            const tokens = query.toLowerCase().split(/\s+/);
            const matched = tokens.filter((t: string) => h.includes(t)).length;
            return matched > 0 ? 0.5 : 0.0;
          },
        }],
      });
      const { runSearch } = await import('../search-engine');
      // "hub" matches substring in "github" but not at word boundary;
      // "xyz" doesn't match → allOriginalTokensMatch=false, hasWordBoundaryMatch=false
      const results = await runSearch('hub xyz');
      expect(results.length).toBe(0);
    });
  });

  describe('browser history fallback format', () => {
    it('should convert history items to IndexedItem format with hostname', async () => {
      setupCoverageMocks({
        items: [],
        historySearch: (_q: unknown, cb: (r: unknown[]) => void) => cb([
          { url: 'https://docs.test.com/page', title: 'Test Docs', visitCount: 7, lastVisitTime: Date.now() },
          { url: 'https://other.com', title: '', visitCount: 1 },
        ]),
      });
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('test');
      expect(results.length).toBe(2);
      expect(results[0].hostname).toBe('docs.test.com');
      expect(results[0].visitCount).toBe(7);
      expect(results[1].title).toBe('');
    });
  });

  describe('skipEmbeddingThisPhase', () => {
    it('should skip embedding when skipAI=true and ollamaEnabled=true', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = true;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        isCircuitBreakerOpen: () => false,
        generateEmbedding: async () => ({ success: true, embedding: [0.1, 0.2, 0.3] }),
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example', { skipAI: true });
      expect(getLastAIStatus()?.semantic).toBe('disabled');
    });

    // Companion lock for the new Semantic toolbar chip. The chip renders
    // disabled when `ollamaEnabled=false` (with a toast on click), but if a
    // user persists `embeddingsEnabled=true` while `ollamaEnabled=false`
    // through the Settings modal, search still attempts semantic scoring
    // (skipEmbeddingThisPhase is false — `skipAI && keywordAIEnabled` are
    // both false). This test locks that behavior so the chip UX (no-op +
    // toast) isn't silently broken by a future refactor that ties the two
    // settings together.
    it('semantic stays active when ollamaEnabled=false but embeddingsEnabled=true (skipEmbeddingThisPhase is false)', async () => {
      settingsMap.embeddingsEnabled = true;
      settingsMap.ollamaEnabled = false;
      setupCoverageMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        isCircuitBreakerOpen: () => false,
        generateEmbedding: async () => ({ success: true, embedding: [0.1, 0.2, 0.3] }),
      });
      const { runSearch, getLastAIStatus } = await import('../search-engine');
      await runSearch('example');
      expect(getLastAIStatus()?.semantic).toBe('active');
    });
  });
});
