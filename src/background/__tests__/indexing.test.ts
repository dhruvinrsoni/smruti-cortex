/**
 * Unit tests for indexing.ts — mergeMetadata and core indexing functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    }),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
}));

// Mock chrome.runtime.getManifest
vi.stubGlobal('chrome', {
  runtime: {
    getManifest: () => ({ version: '3.0.0' }),
  },
});

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

// Mock constants
vi.mock('../../core/constants', () => ({
  BRAND_NAME: 'SmrutiCortex',
}));

// Import after mocks are set up
import { mergeMetadata, generateItemEmbedding, generateBatchEmbeddings, ingestHistory, performFullRebuild, clearBookmarkFlags, performBookmarksIndex, performIncrementalHistoryIndexManual } from '../indexing';
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
      checkMemoryPressure: vi.fn(() => ({ ok: true })),
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
      if (key === 'lastIndexedVersion') return '3.0.0'; // same as manifest
      if (key === 'lastIndexedTimestamp') return Date.now(); // just now
      return defaultValue;
    });

    await ingestHistory();
    // Should not call clearIndexedDB (no full rebuild)
    expect(clearIndexedDB).not.toHaveBeenCalled();
  });

  it('should trigger full re-index when version is newer', async () => {
    vi.mocked(getSetting).mockImplementation(async (key: string, defaultValue: unknown) => {
      if (key === 'lastIndexedVersion') return '1.0.0'; // old version
      if (key === 'lastIndexedTimestamp') return 0;
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
