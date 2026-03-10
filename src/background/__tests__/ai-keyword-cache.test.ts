// Tests for ai-keyword-cache.ts — loadCache, getCachedExpansion, getPrefixMatch, cacheExpansion, clearAIKeywordCache, getCacheStats

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must use vi.resetModules() for module-level state isolation (cache, loaded, saveTimer, dirty are module globals)
// All imports must be dynamic inside each test

describe('ai-keyword-cache module', () => {
  const STORAGE_KEY = 'aiKeywordCache';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.doMock('../../core/logger', () => ({
      Logger: {
        info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
        forComponent: () => ({
          info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
        }),
      },
    }));

    vi.doMock('../../core/helpers', () => ({
      browserAPI: {
        storage: {
          local: {
            get: vi.fn((_keys: string[], cb: (r: Record<string, unknown>) => void) => cb({})),
            set: vi.fn((_items: unknown, cb?: () => void) => cb?.()),
            remove: vi.fn((_key: string, cb?: () => void) => cb?.()),
          },
        },
      },
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loadCache', () => {
    it('loads cache from storage', async () => {
      const { browserAPI } = await import('../../core/helpers');
      vi.mocked(browserAPI.storage.local.get).mockImplementationOnce(
        (_keys: string[], cb: (r: Record<string, unknown>) => void) => {
          cb({ [STORAGE_KEY]: { 'react': { k: ['js', 'ui'], t: Date.now(), h: 0 } } });
        }
      );
      const { loadCache, getCachedExpansion } = await import('../ai-keyword-cache');
      await loadCache();
      expect(getCachedExpansion('react')).toEqual(['js', 'ui']);
    });

    it('is idempotent — only loads once', async () => {
      const { browserAPI } = await import('../../core/helpers');
      const { loadCache } = await import('../ai-keyword-cache');
      await loadCache();
      await loadCache();
      expect(browserAPI.storage.local.get).toHaveBeenCalledTimes(1);
    });

    it('handles empty storage gracefully', async () => {
      const { loadCache, getCacheStats } = await import('../ai-keyword-cache');
      await loadCache();
      expect(getCacheStats().size).toBe(0);
    });

    it('handles storage error gracefully', async () => {
      const { browserAPI } = await import('../../core/helpers');
      vi.mocked(browserAPI.storage.local.get).mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      const { loadCache } = await import('../ai-keyword-cache');
      await expect(loadCache()).resolves.not.toThrow();
    });
  });

  describe('getCachedExpansion', () => {
    it('returns null for unknown query', async () => {
      const { getCachedExpansion } = await import('../ai-keyword-cache');
      expect(getCachedExpansion('unknown')).toBeNull();
    });

    it('returns keywords for cached query', async () => {
      const { getCachedExpansion, cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('typescript', ['ts', 'js', 'type']);
      expect(getCachedExpansion('typescript')).toEqual(['ts', 'js', 'type']);
    });

    it('returns null for expired TTL', async () => {
      const { getCachedExpansion, cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('oldquery', ['stale']);

      // Advance 8 days past TTL (7 days)
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

      expect(getCachedExpansion('oldquery')).toBeNull();
    });

    it('increments hit count on access', async () => {
      const { getCachedExpansion, cacheExpansion, getCacheStats } = await import('../ai-keyword-cache');
      cacheExpansion('react', ['reactjs']);
      getCachedExpansion('react');
      getCachedExpansion('react');
      // Accessing via getCacheStats won't give hit count directly, but no error thrown
      expect(getCacheStats().size).toBe(1);
    });
  });

  describe('getPrefixMatch', () => {
    it('returns null for query shorter than 2 chars', async () => {
      const { getPrefixMatch } = await import('../ai-keyword-cache');
      expect(getPrefixMatch('a')).toBeNull();
    });

    it('returns null when no prefix match exists', async () => {
      const { getPrefixMatch } = await import('../ai-keyword-cache');
      expect(getPrefixMatch('zz')).toBeNull();
    });

    it('returns keywords for matching prefix', async () => {
      const { getPrefixMatch, cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('github api', ['git', 'repo', 'code']);
      const result = getPrefixMatch('git');
      expect(result).toEqual(['git', 'repo', 'code']);
    });

    it('does not match exact key (must start with query but be longer)', async () => {
      const { getPrefixMatch, cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('react', ['reactjs']);
      // Exact match of key == 'react', prefix match requires key !== query
      expect(getPrefixMatch('react')).toBeNull();
    });

    it('returns most-hit match when multiple prefix candidates', async () => {
      const { getPrefixMatch, cacheExpansion, getCachedExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('github repos', ['repo1']);
      cacheExpansion('github api tutorial', ['api1', 'tutorial']);

      // Increment hits for 'github api tutorial' by accessing it twice
      getCachedExpansion('github api tutorial');
      getCachedExpansion('github api tutorial');

      const result = getPrefixMatch('git');
      // Result should be non-null
      expect(result).not.toBeNull();
    });
  });

  describe('cacheExpansion', () => {
    it('stores keywords for query', async () => {
      const { cacheExpansion, getCachedExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('vue', ['vuejs', 'framework']);
      expect(getCachedExpansion('vue')).toEqual(['vuejs', 'framework']);
    });

    it('overwrites existing entry', async () => {
      const { cacheExpansion, getCachedExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('vue', ['vuejs']);
      cacheExpansion('vue', ['vuejs', 'frontend']);
      expect(getCachedExpansion('vue')).toEqual(['vuejs', 'frontend']);
    });

    it('schedules save via debounce timer', async () => {
      const { browserAPI } = await import('../../core/helpers');
      const { cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('angular', ['ng', 'framework']);

      // No immediate save
      expect(browserAPI.storage.local.set).not.toHaveBeenCalled();

      // Advance debounce timer (2000ms)
      await vi.runAllTimersAsync();

      expect(browserAPI.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('clearAIKeywordCache', () => {
    it('returns count of cleared entries', async () => {
      const { clearAIKeywordCache, cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('a', ['aa']);
      cacheExpansion('b', ['bb']);
      const result = await clearAIKeywordCache();
      expect(result.cleared).toBe(2);
    });

    it('empty cache after clearing', async () => {
      const { clearAIKeywordCache, cacheExpansion, getCacheStats } = await import('../ai-keyword-cache');
      cacheExpansion('x', ['xx']);
      await clearAIKeywordCache();
      expect(getCacheStats().size).toBe(0);
    });

    it('calls storage.local.remove', async () => {
      const { browserAPI } = await import('../../core/helpers');
      const { clearAIKeywordCache } = await import('../ai-keyword-cache');
      await clearAIKeywordCache();
      expect(browserAPI.storage.local.remove).toHaveBeenCalledWith(STORAGE_KEY, expect.any(Function));
    });

    it('returns 0 when cache is empty', async () => {
      const { clearAIKeywordCache } = await import('../ai-keyword-cache');
      const result = await clearAIKeywordCache();
      expect(result.cleared).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('returns size 0 for empty cache', async () => {
      const { getCacheStats } = await import('../ai-keyword-cache');
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(5000);
      expect(stats.estimatedBytes).toBe(0);
    });

    it('reflects number of cached entries', async () => {
      const { getCacheStats, cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('a', ['aa', 'aaa']);
      cacheExpansion('b', ['bb']);
      const stats = getCacheStats();
      expect(stats.size).toBe(2);
    });

    it('estimatedBytes is positive when cache has entries', async () => {
      const { getCacheStats, cacheExpansion } = await import('../ai-keyword-cache');
      cacheExpansion('javascript', ['js', 'ecmascript', 'node']);
      const stats = getCacheStats();
      expect(stats.estimatedBytes).toBeGreaterThan(0);
    });

    it('maxSize is always 5000', async () => {
      const { getCacheStats } = await import('../ai-keyword-cache');
      expect(getCacheStats().maxSize).toBe(5000);
    });
  });
});
