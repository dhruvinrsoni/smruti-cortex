/**
 * Unit tests for indexing.ts — mergeMetadata and core indexing functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, chromeMock } from '../../__test-utils__';

// Mock the database module
vi.mock('../database', () => ({
  getIndexedItem: vi.fn(),
  saveIndexedItem: vi.fn(),
  getSetting: vi.fn(async (_key: string, defaultValue: unknown) => defaultValue),
  setSetting: vi.fn(),
  clearIndexedDB: vi.fn(),
  getAllIndexedItems: vi.fn(async () => []),
}));

// Mock the tokenizer
vi.mock('../search/tokenizer', () => ({
  tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter(t => t.length > 0)),
}));

// Mock browserAPI
vi.mock('../../core/helpers', () => ({
  browserAPI: {
    history: {
      search: vi.fn(),
    },
  },
}));

// Mock Logger
vi.mock('../../core/logger', () => mockLogger());

// Mock chrome.runtime.getManifest
vi.stubGlobal(
  'chrome',
  chromeMock()
    .withRuntime({
      getManifest: () => ({ version: '3.0.0' }),
    })
    .build(),
);

// Mock settings
vi.mock('../../core/settings', () => ({
  SettingsManager: {
    init: vi.fn(),
    getSetting: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        embeddingsEnabled: false,
        indexBookmarks: false,
      };
      return defaults[key];
    }),
  },
}));

// Mock embedding-text
vi.mock('../embedding-text', () => ({
  buildEmbeddingText: vi.fn(() => 'test text'),
}));

// Mock performance-monitor
vi.mock('../performance-monitor', () => ({
  performanceTracker: {
    recordIndexing: vi.fn(),
  },
}));

// Mock ollama-service (used by generateItemEmbedding via dynamic import)
vi.mock('../ollama-service', () => ({
  getOllamaService: vi.fn(() => ({
    generateEmbedding: vi.fn(async () => ({ success: true, embedding: [0.1, 0.2, 0.3] })),
  })),
  getOllamaConfigFromSettings: vi.fn(async () => ({})),
  isCircuitBreakerOpen: vi.fn(() => true),
  checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
}));

// Mock constants
vi.mock('../../core/constants', () => ({
  BRAND_NAME: 'SmrutiCortex',
}));

// Import after mocks are set up
import { mergeMetadata, generateItemEmbedding, generateBatchEmbeddings, ingestHistory, performFullRebuild, clearBookmarkFlags, performBookmarksIndex } from '../indexing';
import { getIndexedItem, saveIndexedItem, getSetting, setSetting, clearIndexedDB } from '../database';
import { tokenize } from '../search/tokenizer';

describe('mergeMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when no existing item exists', () => {
    it('should create a new item with provided metadata', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue(null);
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        description: 'Test description',
        keywords: ['test', 'example'],
        title: 'Test Page',
      });

      expect(getIndexedItem).toHaveBeenCalledWith('https://example.com/page');
      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/page',
          title: 'Test Page',
          hostname: 'example.com',
          metaDescription: 'Test description',
          metaKeywords: ['test', 'example'],
          visitCount: 1,
        })
      );
    });

    it('should create item with empty metadata when none provided', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue(null);
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {});

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/page',
          title: '',
          metaDescription: '',
          metaKeywords: [],
        })
      );
    });

    it('should generate tokens from metadata', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue(null);
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        title: 'Test Page',
        description: 'A test description',
      });

      // Verify tokenize was called with title + description + url
      expect(tokenize).toHaveBeenCalled();
    });
  });

  describe('when existing item exists', () => {
    const existingItem = {
      url: 'https://example.com/page',
      title: 'Old Title',
      hostname: 'example.com',
      metaDescription: 'Old description',
      metaKeywords: ['old'],
      visitCount: 5,
      lastVisit: Date.now() - 1000,
      tokens: ['old', 'title'],
    };

    it('should merge new title when provided', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue({ ...existingItem });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        title: 'New Title',
      });

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Title',
          visitCount: 5, // Preserved
        })
      );
    });

    it('should preserve existing title when new title is empty', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue({ ...existingItem });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        title: '',
      });

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Old Title',
        })
      );
    });

    it('should merge new description when provided', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue({ ...existingItem });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        description: 'New description',
      });

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          metaDescription: 'New description',
        })
      );
    });

    it('should preserve existing description when new description is empty', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue({ ...existingItem });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        description: '',
      });

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          metaDescription: 'Old description',
        })
      );
    });

    it('should merge new keywords when provided', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue({ ...existingItem });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        keywords: ['new', 'keywords'],
      });

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          metaKeywords: ['new', 'keywords'],
        })
      );
    });

    it('should preserve existing keywords when new keywords is empty array', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue({ ...existingItem });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        keywords: [],
      });

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          metaKeywords: ['old'],
        })
      );
    });

    it('should not modify visitCount or lastVisit', async () => {
      const originalLastVisit = Date.now() - 5000;
      vi.mocked(getIndexedItem).mockResolvedValue({
        ...existingItem,
        lastVisit: originalLastVisit,
      });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        title: 'Updated Title',
      });

      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          visitCount: 5,
          lastVisit: originalLastVisit,
        })
      );
    });

    it('should update tokens with merged metadata', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue({ ...existingItem });
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page', {
        title: 'New Title',
        description: 'New description',
        keywords: ['new', 'keywords'],
      });

      // Verify tokens were regenerated
      expect(tokenize).toHaveBeenCalled();
      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: expect.any(Array),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      // The function should not throw for invalid URLs
      vi.mocked(getIndexedItem).mockRejectedValue(new Error('Invalid URL'));

      // Should not throw
      await expect(mergeMetadata('not-a-valid-url', {
        title: 'Test',
      })).resolves.not.toThrow();
    });

    it('should handle database save errors gracefully', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue(null);
      vi.mocked(saveIndexedItem).mockRejectedValue(new Error('DB save failed'));

      // Should not throw - errors are logged but not propagated
      await expect(mergeMetadata('https://example.com/page', {
        title: 'Test',
      })).resolves.not.toThrow();
    });
  });

  describe('URL normalization', () => {
    it('should handle URLs with query parameters', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue(null);
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page?param=value', {
        title: 'Test',
      });

      expect(getIndexedItem).toHaveBeenCalledWith('https://example.com/page?param=value');
    });

    it('should handle URLs with fragments', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue(null);
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://example.com/page#section', {
        title: 'Test',
      });

      expect(getIndexedItem).toHaveBeenCalledWith('https://example.com/page#section');
    });

    it('should extract hostname correctly', async () => {
      vi.mocked(getIndexedItem).mockResolvedValue(null);
      vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

      await mergeMetadata('https://subdomain.example.com:8080/path', {
        title: 'Test',
      });

      // Note: new URL().hostname does NOT include port (use .host for port)
      expect(saveIndexedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'subdomain.example.com',
        })
      );
    });
  });
});

// ── generateItemEmbedding ─────────────────────────────────────────────────

describe('generateItemEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return undefined when embeddings are disabled', async () => {
    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when circuit breaker is open', async () => {
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(true);

    // Mock ollama-service dynamically
    vi.doMock('../ollama-service', () => ({
      getOllamaService: vi.fn(),
      getOllamaConfigFromSettings: vi.fn(),
      isCircuitBreakerOpen: vi.fn(() => true),
      checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
    }));

    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    // With embeddings disabled in the default mock, returns undefined
    expect(result).toBeUndefined();
  });
});

// ── generateBatchEmbeddings ───────────────────────────────────────────────

describe('generateBatchEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return array of undefineds when embeddings are disabled', async () => {
    const items = [
      { title: 'A', url: 'https://a.com' },
      { title: 'B', url: 'https://b.com' },
    ];
    const result = await generateBatchEmbeddings(items);
    expect(result).toEqual([undefined, undefined]);
  });
});

// ── ingestHistory ─────────────────────────────────────────────────────────

describe('ingestHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSetting).mockImplementation(async (_key: string, defaultValue: unknown) => defaultValue);
    vi.mocked(setSetting).mockResolvedValue(undefined);
  });

  it('should skip indexing when version is the same and too recent', async () => {
    // Same version, just indexed
    vi.mocked(getSetting).mockImplementation(async (key: string, defaultValue: unknown) => {
      if (key === 'lastIndexedVersion') {return '3.0.0';} // same as manifest
      if (key === 'lastIndexedTimestamp') {return Date.now();} // just now
      return defaultValue;
    });

    await ingestHistory();
    // Should not call clearIndexedDB (no full rebuild)
    expect(clearIndexedDB).not.toHaveBeenCalled();
  });

  it('should trigger full re-index when version is newer', async () => {
    vi.mocked(getSetting).mockImplementation(async (key: string, defaultValue: unknown) => {
      if (key === 'lastIndexedVersion') {return '1.0.0';} // old version
      if (key === 'lastIndexedTimestamp') {return 0;}
      return defaultValue;
    });

    // Mock browserAPI.history.search to return some items
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (results: unknown[]) => void)([
          { url: 'https://example.com', title: 'Test', visitCount: 1, lastVisitTime: Date.now() },
        ]);
      }
    );
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

    await ingestHistory();

    // Should have saved the version
    expect(setSetting).toHaveBeenCalledWith('lastIndexedVersion', '3.0.0');
  });
});

// ── performFullRebuild ────────────────────────────────────────────────────

describe('performFullRebuild', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
    vi.mocked(setSetting).mockResolvedValue(undefined);
    vi.mocked(getSetting).mockResolvedValue('0.0.0');
  });

  it('should clear IndexedDB and rebuild', async () => {
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (results: unknown[]) => void)([]);
      }
    );
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

    await performFullRebuild();

    expect(clearIndexedDB).toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('lastIndexedVersion', '3.0.0');
  });
});

// ── clearBookmarkFlags ────────────────────────────────────────────────────

// ── performIncrementalHistoryIndexManual ───────────────────────────────────

describe('performIncrementalHistoryIndexManual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);
    vi.mocked(getIndexedItem).mockResolvedValue(null);
  });

  it('should return zeros when no new history items', async () => {
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => { (cb as (r: unknown[]) => void)([]); }
    );
    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(Date.now());
    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should add new items', async () => {
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://new.com', title: 'New Page', visitCount: 1, lastVisitTime: Date.now() },
        ]);
      }
    );
    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(0);
    expect(result.added).toBe(1);
  });

  it('should update existing items when visit is newer', async () => {
    const now = Date.now();
    vi.mocked(getIndexedItem).mockResolvedValue({
      url: 'https://existing.com',
      title: 'Existing',
      hostname: 'existing.com',
      visitCount: 1,
      lastVisit: now - 10000,
      tokens: ['existing'],
    });
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://existing.com', title: 'Existing Updated', visitCount: 5, lastVisitTime: now },
        ]);
      }
    );
    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(0);
    expect(result.updated).toBe(1);
  });

  it('should skip existing items when visit is older', async () => {
    const now = Date.now();
    vi.mocked(getIndexedItem).mockResolvedValue({
      url: 'https://existing.com',
      title: 'Existing',
      hostname: 'existing.com',
      visitCount: 5,
      lastVisit: now,
      tokens: ['existing'],
    });
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://existing.com', title: 'Existing', visitCount: 1, lastVisitTime: now - 10000 },
        ]);
      }
    );
    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(0);
    expect(result.updated).toBe(0);
    expect(result.added).toBe(0);
  });
});

// ── performBookmarksIndex ─────────────────────────────────────────────────

describe('performBookmarksIndex', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);
    vi.mocked(getIndexedItem).mockResolvedValue(null);
    // Mock browserAPI.bookmarks.getTree (source uses browserAPI, not chrome directly)
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [
          { url: 'https://bookmarked.com', title: 'My Bookmark' },
          { title: 'Dev Folder', children: [
            { url: 'https://nested.com', title: 'Nested Bookmark' },
          ] },
        ] },
      ])),
    };
  });

  it('should return zeros when bookmarks are disabled', async () => {
    const result = await performBookmarksIndex(false);
    expect(result.indexed).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('should index new bookmarks', async () => {
    const result = await performBookmarksIndex(true);
    expect(result.indexed).toBe(2);
    expect(result.updated).toBe(0);
    expect(saveIndexedItem).toHaveBeenCalledTimes(2);
  });

  it('should update existing items with bookmark info', async () => {
    vi.mocked(getIndexedItem).mockResolvedValue({
      url: 'https://bookmarked.com',
      title: 'Bookmarked Page',
      hostname: 'bookmarked.com',
      visitCount: 5,
      lastVisit: Date.now(),
      tokens: ['bookmarked'],
    });
    const result = await performBookmarksIndex(true);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ isBookmark: true })
    );
  });

  it('should skip non-http URLs', async () => {
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [
          { url: 'chrome://settings', title: 'Settings' },
          { url: 'javascript:void(0)', title: 'JS' },
          { url: 'https://valid.com', title: 'Valid' },
        ] },
      ])),
    };
    const result = await performBookmarksIndex(true);
    expect(result.indexed).toBe(1);
  });
});

describe('clearBookmarkFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should clear isBookmark flag on bookmark items', async () => {
    // getAllIndexedItems is dynamically imported in clearBookmarkFlags
    const { getAllIndexedItems } = await import('../database');
    vi.mocked(getAllIndexedItems).mockResolvedValue([
      { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'], isBookmark: true },
      { url: 'https://b.com', title: 'B', hostname: 'b.com', visitCount: 1, lastVisit: Date.now(), tokens: ['b'], isBookmark: false },
    ]);
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

    await clearBookmarkFlags();

    // Should only save the bookmarked item (with isBookmark cleared)
    expect(saveIndexedItem).toHaveBeenCalledTimes(1);
    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://a.com', isBookmark: false })
    );
  });

  it('should handle empty items list', async () => {
    const { getAllIndexedItems } = await import('../database');
    vi.mocked(getAllIndexedItems).mockResolvedValue([]);

    await clearBookmarkFlags();
    expect(saveIndexedItem).not.toHaveBeenCalled();
  });
});

// ── generateItemEmbedding (with embeddings enabled) ───────────────────────

describe('generateItemEmbedding (embeddings enabled paths)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(true as never);
    const mod = await import('../ollama-service');
    vi.mocked(mod.isCircuitBreakerOpen).mockReturnValue(false);
    vi.mocked(mod.checkMemoryPressure).mockReturnValue({ ok: true, permanent: false });
    vi.mocked(mod.getOllamaConfigFromSettings).mockResolvedValue({} as never);
    vi.mocked(mod.getOllamaService).mockReturnValue({
      generateEmbedding: vi.fn(async () => ({ success: true, embedding: [0.1, 0.2, 0.3] })),
    } as never);
    const { buildEmbeddingText } = await import('../embedding-text');
    vi.mocked(buildEmbeddingText).mockReturnValue('test embedding text');
  });

  it('should return undefined when circuit breaker is open', async () => {
    const { isCircuitBreakerOpen } = await import('../ollama-service');
    vi.mocked(isCircuitBreakerOpen).mockReturnValue(true);

    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when memory pressure is not ok', async () => {
    const { checkMemoryPressure } = await import('../ollama-service');
    vi.mocked(checkMemoryPressure).mockReturnValue({ ok: false, permanent: false });

    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when buildEmbeddingText returns empty string', async () => {
    const { buildEmbeddingText } = await import('../embedding-text');
    vi.mocked(buildEmbeddingText).mockReturnValue('');

    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    expect(result).toBeUndefined();
  });

  it('should return embedding array on successful generation', async () => {
    const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const { getOllamaService } = await import('../ollama-service');
    vi.mocked(getOllamaService).mockReturnValue({
      generateEmbedding: vi.fn(async () => ({ success: true, embedding: mockEmbedding })),
    } as never);

    const result = await generateItemEmbedding({ title: 'Test Page', url: 'https://test.com' });
    expect(result).toEqual(mockEmbedding);
  });

  it('should return undefined when embedding result has success false', async () => {
    const { getOllamaService } = await import('../ollama-service');
    vi.mocked(getOllamaService).mockReturnValue({
      generateEmbedding: vi.fn(async () => ({ success: false, embedding: [] })),
    } as never);

    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    expect(result).toBeUndefined();
  });

  it('should return undefined when embedding result is empty array', async () => {
    const { getOllamaService } = await import('../ollama-service');
    vi.mocked(getOllamaService).mockReturnValue({
      generateEmbedding: vi.fn(async () => ({ success: true, embedding: [] })),
    } as never);

    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    expect(result).toBeUndefined();
  });

  it('should catch embedding generation errors and return undefined', async () => {
    const { getOllamaService } = await import('../ollama-service');
    vi.mocked(getOllamaService).mockReturnValue({
      generateEmbedding: vi.fn(async () => { throw new Error('Connection refused'); }),
    } as never);

    const result = await generateItemEmbedding({ title: 'Test', url: 'https://test.com' });
    expect(result).toBeUndefined();
  });

  it('should pass the item to buildEmbeddingText', async () => {
    const { buildEmbeddingText } = await import('../embedding-text');
    const item = { title: 'My Page', metaDescription: 'A description', url: 'https://test.com/page' };
    await generateItemEmbedding(item);

    expect(buildEmbeddingText).toHaveBeenCalledWith(item);
  });
});

// ── generateBatchEmbeddings (with embeddings enabled) ─────────────────────

describe('generateBatchEmbeddings (embeddings enabled paths)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(true as never);
    const mod = await import('../ollama-service');
    vi.mocked(mod.isCircuitBreakerOpen).mockReturnValue(false);
    vi.mocked(mod.checkMemoryPressure).mockReturnValue({ ok: true, permanent: false });
    vi.mocked(mod.getOllamaConfigFromSettings).mockResolvedValue({} as never);
    vi.mocked(mod.getOllamaService).mockImplementation(() => ({
      generateEmbedding: async () => ({ success: true, embedding: [0.1, 0.2] }),
    }) as never);
    const { buildEmbeddingText } = await import('../embedding-text');
    vi.mocked(buildEmbeddingText).mockReturnValue('test text');
  });

  it('should process items and return embeddings when enabled', async () => {
    const items = [
      { title: 'A', url: 'https://a.com' },
      { title: 'B', url: 'https://b.com' },
    ];
    const result = await generateBatchEmbeddings(items, 1);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([0.1, 0.2]);
    expect(result[1]).toEqual([0.1, 0.2]);
  });

  it('should process items in specified batch sizes', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      title: `Item ${i}`,
      url: `https://item${i}.com`,
    }));
    const result = await generateBatchEmbeddings(items, 2);
    expect(result).toHaveLength(5);
  });

  it('should handle mixed success and failure in batch', async () => {
    const mod = await import('../ollama-service');
    let callCount = 0;
    vi.mocked(mod.getOllamaService).mockImplementation(() => ({
      generateEmbedding: async () => {
        callCount++;
        if (callCount === 2) {return { success: false, embedding: [] };}
        return { success: true, embedding: [0.1] };
      },
    }) as never);

    const items = [
      { title: 'A', url: 'https://a.com' },
      { title: 'B', url: 'https://b.com' },
      { title: 'C', url: 'https://c.com' },
    ];
    const result = await generateBatchEmbeddings(items, 1);
    expect(result).toHaveLength(3);
    const defined = result.filter(r => r !== undefined);
    expect(defined).toHaveLength(2);
  });
});

// ── performFullRebuild (additional) ───────────────────────────────────────

describe('performFullRebuild (additional)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
    vi.mocked(setSetting).mockResolvedValue(undefined);
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);
    vi.mocked(getIndexedItem).mockResolvedValue(null);
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => { (cb as (r: unknown[]) => void)([]); }
    );
  });

  it('should re-throw errors after logging', async () => {
    vi.mocked(clearIndexedDB).mockRejectedValue(new Error('DB clear failed'));
    await expect(performFullRebuild()).rejects.toThrow('DB clear failed');
  });

  it('should index bookmarks when setting is enabled', async () => {
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockImplementation((key: string) => {
      if (key === 'indexBookmarks') {return true;}
      return false;
    });

    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [{ url: 'https://bookmark.com', title: 'Bookmark' }] },
      ])),
    };

    await performFullRebuild();

    expect(clearIndexedDB).toHaveBeenCalled();
    expect(setSetting).toHaveBeenCalledWith('lastIndexedVersion', '3.0.0');
    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ isBookmark: true, url: 'https://bookmark.com' })
    );
  });

  it('should handle items with missing title and visitCount', async () => {
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://example.com', title: undefined, visitCount: undefined, lastVisitTime: undefined },
        ]);
      }
    );
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(false);

    await performFullRebuild();

    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: '', visitCount: 1 })
    );
  });

  it('should handle invalid URLs in history items gracefully', async () => {
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'not-a-valid-url', title: 'Bad', visitCount: 1, lastVisitTime: Date.now() },
          { url: 'https://valid.com', title: 'Good', visitCount: 1, lastVisitTime: Date.now() },
        ]);
      }
    );
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(false);

    await performFullRebuild();

    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://valid.com' })
    );
  });
});

// ── ingestHistory (additional) ────────────────────────────────────────────

describe('ingestHistory (additional)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(setSetting).mockResolvedValue(undefined);
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);
    vi.mocked(getIndexedItem).mockResolvedValue(null);
  });

  it('should perform incremental index when version matches but enough time passed', async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    vi.mocked(getSetting).mockImplementation(async (key: string, defaultValue: unknown) => {
      if (key === 'lastIndexedVersion') {return '3.0.0';}
      if (key === 'lastIndexedTimestamp') {return twoHoursAgo;}
      if (key === 'lastBookmarksIndexedTimestamp') {return Date.now();}
      return defaultValue;
    });

    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://new.com', title: 'New', visitCount: 1, lastVisitTime: Date.now() },
        ]);
      }
    );
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(false);

    await ingestHistory();

    expect(setSetting).toHaveBeenCalledWith('lastIndexedTimestamp', expect.any(Number));
  });

  it('should refresh bookmarks when stale and indexBookmarks enabled', async () => {
    vi.mocked(getSetting).mockImplementation(async (key: string, defaultValue: unknown) => {
      if (key === 'lastIndexedVersion') {return '3.0.0';}
      if (key === 'lastIndexedTimestamp') {return Date.now();}
      if (key === 'lastBookmarksIndexedTimestamp') {return 0;}
      return defaultValue;
    });

    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(true);

    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => { (cb as (r: unknown[]) => void)([]); }
    );
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [{ url: 'https://bm.com', title: 'BM' }] },
      ])),
    };

    await ingestHistory();

    expect(setSetting).toHaveBeenCalledWith('lastBookmarksIndexedTimestamp', expect.any(Number));
  });

  it('should full re-index and refresh bookmarks on version upgrade', async () => {
    vi.mocked(getSetting).mockImplementation(async (key: string, defaultValue: unknown) => {
      if (key === 'lastIndexedVersion') {return '1.0.0';}
      if (key === 'lastBookmarksIndexedTimestamp') {return 0;}
      return defaultValue;
    });

    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => { (cb as (r: unknown[]) => void)([]); }
    );
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(true);
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [] },
      ])),
    };

    await ingestHistory();

    expect(setSetting).toHaveBeenCalledWith('lastIndexedVersion', '3.0.0');
    expect(setSetting).toHaveBeenCalledWith('lastBookmarksIndexedTimestamp', expect.any(Number));
  });

  it('should perform incremental index with updates and adds', async () => {
    const now = Date.now();
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    vi.mocked(getSetting).mockImplementation(async (key: string, defaultValue: unknown) => {
      if (key === 'lastIndexedVersion') {return '3.0.0';}
      if (key === 'lastIndexedTimestamp') {return twoHoursAgo;}
      if (key === 'lastBookmarksIndexedTimestamp') {return now;}
      return defaultValue;
    });

    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://existing.com', title: 'Updated', visitCount: 10, lastVisitTime: now },
          { url: 'https://brand-new.com', title: 'Brand New', visitCount: 1, lastVisitTime: now },
        ]);
      }
    );
    vi.mocked(getIndexedItem).mockImplementation(async (url: string) => {
      if (url === 'https://existing.com') {
        return {
          url: 'https://existing.com', title: 'Old', hostname: 'existing.com',
          visitCount: 1, lastVisit: twoHoursAgo, tokens: ['old'],
        };
      }
      return null;
    });
    const { SettingsManager } = await import('../../core/settings');
    vi.mocked(SettingsManager.getSetting).mockReturnValue(false);

    await ingestHistory();

    expect(saveIndexedItem).toHaveBeenCalledTimes(2);
  });
});

// ── performIncrementalHistoryIndexManual (additional) ──────────────────────

describe('performIncrementalHistoryIndexManual (additional)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);
  });

  it('should handle errors for individual items gracefully', async () => {
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://error.com', title: 'Error', visitCount: 1, lastVisitTime: Date.now() },
          { url: 'https://good.com', title: 'Good', visitCount: 1, lastVisitTime: Date.now() },
        ]);
      }
    );
    vi.mocked(getIndexedItem)
      .mockRejectedValueOnce(new Error('DB read error'))
      .mockResolvedValueOnce(null);

    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(0);
    expect(result.added).toBe(1);
  });

  it('should use higher visitCount when updating existing items', async () => {
    const now = Date.now();
    vi.mocked(getIndexedItem).mockResolvedValue({
      url: 'https://page.com', title: 'Page', hostname: 'page.com',
      visitCount: 10, lastVisit: now - 5000, tokens: ['page'],
    });

    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://page.com', title: 'Page Updated', visitCount: 3, lastVisitTime: now },
        ]);
      }
    );

    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(0);
    expect(result.updated).toBe(1);
    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ visitCount: 10, lastVisit: now, title: 'Page Updated' })
    );
  });

  it('should preserve existing title when new title is empty', async () => {
    const now = Date.now();
    vi.mocked(getIndexedItem).mockResolvedValue({
      url: 'https://page.com', title: 'Original Title', hostname: 'page.com',
      visitCount: 1, lastVisit: now - 5000, tokens: ['page'],
    });

    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://page.com', title: '', visitCount: 2, lastVisitTime: now },
        ]);
      }
    );

    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(0);
    expect(result.updated).toBe(1);
    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Original Title' })
    );
  });

  it('should return correct duration and total', async () => {
    const { browserAPI } = await import('../../core/helpers');
    vi.mocked(browserAPI.history.search).mockImplementation(
      (_query: unknown, cb: unknown) => {
        (cb as (r: unknown[]) => void)([
          { url: 'https://a.com', title: 'A', visitCount: 1, lastVisitTime: Date.now() },
          { url: 'https://b.com', title: 'B', visitCount: 1, lastVisitTime: Date.now() },
        ]);
      }
    );
    vi.mocked(getIndexedItem).mockResolvedValue(null);

    const { performIncrementalHistoryIndexManual } = await import('../indexing');
    const result = await performIncrementalHistoryIndexManual(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.total).toBe(2);
    expect(result.added).toBe(2);
  });
});

// ── performBookmarksIndex (additional) ────────────────────────────────────

describe('performBookmarksIndex (additional)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);
  });

  it('should set bookmarkTitle when it differs from page title', async () => {
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [{ url: 'https://page.com', title: 'Custom BM Title' }] },
      ])),
    };
    vi.mocked(getIndexedItem).mockResolvedValue({
      url: 'https://page.com', title: 'Original Page Title', hostname: 'page.com',
      visitCount: 5, lastVisit: Date.now(), tokens: ['page'],
    });

    const result = await performBookmarksIndex(true);

    expect(result.updated).toBe(1);
    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ bookmarkTitle: 'Custom BM Title', isBookmark: true })
    );
  });

  it('should not set bookmarkTitle when it matches page title', async () => {
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [{ url: 'https://page.com', title: 'Same Title' }] },
      ])),
    };
    vi.mocked(getIndexedItem).mockResolvedValue({
      url: 'https://page.com', title: 'Same Title', hostname: 'page.com',
      visitCount: 5, lastVisit: Date.now(), tokens: ['page'],
    });

    const result = await performBookmarksIndex(true);

    expect(result.updated).toBe(1);
    const savedItem = vi.mocked(saveIndexedItem).mock.calls[0][0];
    expect(savedItem.bookmarkTitle).toBeUndefined();
  });

  it('should handle individual bookmark save errors gracefully', async () => {
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [
          { url: 'https://good.com', title: 'Good' },
          { url: 'https://bad.com', title: 'Bad' },
        ] },
      ])),
    };
    vi.mocked(getIndexedItem).mockResolvedValue(null);
    vi.mocked(saveIndexedItem)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Save failed'));

    const result = await performBookmarksIndex(true);
    expect(result.indexed).toBe(1);
  });

  it('should handle getTree error gracefully', async () => {
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn(() => { throw new Error('Bookmarks API unavailable'); }),
    };

    const result = await performBookmarksIndex(true);

    expect(result.indexed).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('should track folder paths for deeply nested bookmarks', async () => {
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [
          { title: 'Work', children: [
            { title: 'Projects', children: [
              { url: 'https://deep.com', title: 'Deep Bookmark' },
            ] },
          ] },
        ] },
      ])),
    };
    vi.mocked(getIndexedItem).mockResolvedValue(null);

    const result = await performBookmarksIndex(true);

    expect(result.indexed).toBe(1);
    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ bookmarkFolders: ['Work', 'Projects'], isBookmark: true })
    );
  });

  it('should skip bookmarks without URL or with empty URL', async () => {
    const { browserAPI } = await import('../../core/helpers');
    (browserAPI as unknown as Record<string, unknown>).bookmarks = {
      getTree: vi.fn((cb: (results: unknown[]) => void) => cb([
        { children: [
          { url: '', title: 'Empty URL' },
          { url: 'https://valid.com', title: 'Valid' },
        ] },
      ])),
    };
    vi.mocked(getIndexedItem).mockResolvedValue(null);

    const result = await performBookmarksIndex(true);
    expect(result.indexed).toBe(1);
  });
});

// ── clearBookmarkFlags (additional) ───────────────────────────────────────

describe('clearBookmarkFlags (additional)', () => {
  it('should handle getAllIndexedItems error gracefully', async () => {
    vi.clearAllMocks();
    const { getAllIndexedItems } = await import('../database');
    vi.mocked(getAllIndexedItems).mockRejectedValue(new Error('DB connection error'));

    await expect(clearBookmarkFlags()).resolves.not.toThrow();
  });

  it('should clear bookmarkFolders along with isBookmark flag', async () => {
    vi.clearAllMocks();
    const { getAllIndexedItems } = await import('../database');
    vi.mocked(getAllIndexedItems).mockResolvedValue([
      {
        url: 'https://bm.com', title: 'BM', hostname: 'bm.com',
        visitCount: 1, lastVisit: Date.now(), tokens: ['bm'],
        isBookmark: true, bookmarkFolders: ['Dev', 'Tools'],
      },
    ]);
    vi.mocked(saveIndexedItem).mockResolvedValue(undefined);

    await clearBookmarkFlags();

    expect(saveIndexedItem).toHaveBeenCalledWith(
      expect.objectContaining({ isBookmark: false, bookmarkFolders: undefined })
    );
  });
});
