/**
 * Unit tests for indexing.ts — mergeMetadata and core indexing functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../database', () => ({
  getIndexedItem: vi.fn(),
  saveIndexedItem: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
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

// Import after mocks are set up
import { mergeMetadata } from '../indexing';
import { getIndexedItem, saveIndexedItem } from '../database';
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
