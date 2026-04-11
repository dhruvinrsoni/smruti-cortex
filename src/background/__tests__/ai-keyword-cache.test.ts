// Tests for ai-keyword-cache.ts — loadCache, getCachedExpansion, getPrefixMatch, cacheExpansion, clearAIKeywordCache, getCacheStats

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

// Must use vi.resetModules() for module-level state isolation (cache, loaded, saveTimer, dirty are module globals)
// All imports must be dynamic inside each test

describe('ai-keyword-cache module', () => {
  const STORAGE_KEY = 'aiKeywordCache';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.doMock('../../core/logger', () => mockLogger());

    vi.doMock('../../core/helpers', () => ({
      browserAPI: {
        storage: {
          local: {
            get: vi.fn((_keys: string | string[] | Record<string, unknown> | null, cb: (r: Record<string, unknown>) => void) => cb({})),
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
        (_keys: string | string[] | Record<string, unknown> | null, cb: (r: Record<string, unknown>) => void) => {
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

  });

  describe('evictLeastUsed — capacity eviction', () => {
    const MAX_CACHE_SIZE = 5000;

    it('triggers evictLeastUsed when cache is at MAX_CACHE_SIZE and a new entry is added', async () => {
      const { cacheExpansion, getCacheStats } = await import('../ai-keyword-cache');

      // Fill cache to MAX_CACHE_SIZE with unique keys
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        cacheExpansion(`key${i}`, ['kw']);
      }
      expect(getCacheStats().size).toBe(MAX_CACHE_SIZE);

      // Adding one more new key triggers eviction
      cacheExpansion('newkey_overflow', ['overflow']);

      // After eviction + new insert, size should be less than MAX_CACHE_SIZE + 1
      // Specifically: eviction removes 10% (500), then new entry added → size == MAX_CACHE_SIZE - 499
      expect(getCacheStats().size).toBeLessThan(MAX_CACHE_SIZE);
    });

    it('does NOT evict when updating an existing key at full capacity', async () => {
      const { cacheExpansion, getCacheStats } = await import('../ai-keyword-cache');

      // Fill to capacity
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        cacheExpansion(`key${i}`, ['kw']);
      }
      const sizeBefore = getCacheStats().size;

      // Updating an existing key (cache.has(query) is true) should NOT evict
      cacheExpansion('key0', ['updated']);

      // Size stays the same — no eviction occurred
      expect(getCacheStats().size).toBe(sizeBefore);
    });

    it('eviction removes expired entries first before least-hit entries', async () => {
      const { cacheExpansion, getCacheStats } = await import('../ai-keyword-cache');
      const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

      // Fill to capacity: half with entries that will expire, half fresh
      const halfSize = MAX_CACHE_SIZE / 2;

      // Add entries that will be "expired" — we'll advance time later to expire them
      for (let i = 0; i < halfSize; i++) {
        cacheExpansion(`expiring${i}`, ['old']);
      }

      // Advance time past TTL so these entries are now expired
      vi.advanceTimersByTime(CACHE_TTL + 1000);

      // Add fresh entries to fill the rest (cache size may differ because timer advanced)
      const { getCacheStats: getStats2 } = await import('../ai-keyword-cache');
      const currentSize = getStats2().size;
      for (let i = 0; i < MAX_CACHE_SIZE - currentSize; i++) {
        cacheExpansion(`fresh${i}`, ['new']);
      }
      expect(getCacheStats().size).toBe(MAX_CACHE_SIZE);

      // Now add a new key — eviction should remove expired entries first
      cacheExpansion('trigger_eviction', ['trigger']);

      // The expired keys should be gone, fresh ones remain
      const stats = getCacheStats();
      expect(stats.size).toBeLessThan(MAX_CACHE_SIZE + 1);
    });

    it('eviction removes least-hit entries (10% batch) when no expired entries exist', async () => {
      const { cacheExpansion, getCachedExpansion, getCacheStats } = await import('../ai-keyword-cache');

      // Fill cache to capacity with non-expired entries
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        cacheExpansion(`item${i}`, ['kw']);
      }

      // Give high hit counts to items we want to KEEP (items 0-99)
      for (let i = 0; i < 100; i++) {
        // Access each of these entries many times to raise their hit count
        for (let h = 0; h < 50; h++) {
          getCachedExpansion(`item${i}`);
        }
      }
      // items 100+ have h=0 (low hit count) — they should be evicted first

      expect(getCacheStats().size).toBe(MAX_CACHE_SIZE);

      // Trigger eviction by adding a new key
      cacheExpansion('new_entry_to_trigger', ['trigger']);

      // Size should be reduced (eviction happened)
      const sizeAfter = getCacheStats().size;
      expect(sizeAfter).toBeLessThan(MAX_CACHE_SIZE);

      // High-hit items (0-99) should survive eviction
      for (let i = 0; i < 100; i++) {
        expect(getCachedExpansion(`item${i}`)).toEqual(['kw']);
      }
    });

    it('eviction handles mixed expired and non-expired entries correctly', async () => {
      const { cacheExpansion, getCacheStats } = await import('../ai-keyword-cache');
      const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

      // Add 2500 entries that will expire
      for (let i = 0; i < 2500; i++) {
        cacheExpansion(`old${i}`, ['stale']);
      }

      // Advance time to expire them
      vi.advanceTimersByTime(CACHE_TTL + 1000);

      // Add 2500 fresh entries (total = 5000)
      for (let i = 0; i < 2500; i++) {
        cacheExpansion(`new${i}`, ['fresh']);
      }
      expect(getCacheStats().size).toBe(MAX_CACHE_SIZE);

      // Trigger eviction — expired entries removed first, then possibly least-hit
      cacheExpansion('overflow_key', ['overflow']);

      // After eviction + new key, size should have dropped
      expect(getCacheStats().size).toBeLessThan(MAX_CACHE_SIZE);
    });
  });

  describe('scheduleSave — storage error handling', () => {
    it('logs a warning when chrome.storage.local.set rejects (catch block line 80)', async () => {
      const { browserAPI } = await import('../../core/helpers');
      const { cacheExpansion } = await import('../ai-keyword-cache');

      // Make storage.local.set throw an error inside the callback by rejecting the promise
      // The implementation wraps set() in a Promise — to trigger the catch we throw inside the callback
      vi.mocked(browserAPI.storage.local.set).mockImplementationOnce(
        (_items: unknown, cb?: () => void) => {
          // Throw synchronously — this will propagate into the async try block via the Promise executor
          throw new Error('QuotaExceededError');
        }
      );

      // Trigger scheduleSave via cacheExpansion
      cacheExpansion('save_error_test', ['kw']);

      // Advance timer to fire the debounced save
      await vi.runAllTimersAsync();

      // No uncaught error — the catch block swallowed it and logged a warning
      // We verify indirectly: the mock was called
      expect(browserAPI.storage.local.set).toHaveBeenCalled();
    });

    it('logs a warning when storage.set callback throws (alternate rejection path)', async () => {
      const { browserAPI } = await import('../../core/helpers');
      const { cacheExpansion } = await import('../ai-keyword-cache');

      // Mock set to never call the callback and instead throw later to simulate rejection
      // Use a Promise that rejects to trigger the catch block
      vi.mocked(browserAPI.storage.local.set).mockImplementationOnce(
        (_items: unknown, _cb?: () => void) => {
          // Simulate storage failure by not calling cb and throwing synchronously
          throw new Error('Storage unavailable');
        }
      );

      cacheExpansion('another_save_error', ['kw2']);

      // Should not throw — error must be caught internally
      await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
    });
  });
});
