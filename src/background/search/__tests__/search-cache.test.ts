import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, makeItem as makeIndexedItem } from '../../../__test-utils__';

vi.mock('../../../core/logger', () => mockLogger());

import { SearchCache } from '../search-cache';
import type { IndexedItem } from '../../schema';

function makeItem(url: string): IndexedItem {
  return makeIndexedItem({ url });
}

describe('SearchCache', () => {
  let cache: SearchCache;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    cache = new SearchCache(5, 1000); // small maxSize + 1 second TTL for tests
  });

  describe('get / set basics', () => {
    it('should return null for unknown query', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should return stored results', () => {
      const items = [makeItem('https://example.com')];
      cache.set('test', items);
      expect(cache.get('test')).toEqual(items);
    });

    it('should normalize query: trim + lowercase', () => {
      const items = [makeItem('https://example.com')];
      cache.set('  React  ', items);
      expect(cache.get('react')).toEqual(items);
      expect(cache.get('  React  ')).toEqual(items);
    });

    it('should update existing entry without incrementing size', () => {
      cache.set('test', [makeItem('https://a.com')]);
      cache.set('test', [makeItem('https://b.com')]);
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
    });
  });

  describe('TTL expiry', () => {
    it('should return null after TTL expires', () => {
      vi.useFakeTimers();
      cache.set('ttl-test', [makeItem('https://example.com')]);

      // Advance time beyond TTL (1000ms)
      vi.advanceTimersByTime(1500);
      expect(cache.get('ttl-test')).toBeNull();
      vi.useRealTimers();
    });

    it('should return results before TTL expires', () => {
      vi.useFakeTimers();
      const items = [makeItem('https://example.com')];
      cache.set('ttl-test', items);

      vi.advanceTimersByTime(500); // still within TTL
      expect(cache.get('ttl-test')).toEqual(items);
      vi.useRealTimers();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when maxSize is reached', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(`query${i}`, [makeItem(`https://example.com/${i}`)]);
      }
      // query0 is oldest; adding query5 should evict it
      cache.set('query5', [makeItem('https://example.com/5')]);

      expect(cache.get('query0')).toBeNull();
      expect(cache.get('query5')).not.toBeNull();
    });

    it('should not exceed maxSize', () => {
      for (let i = 0; i < 8; i++) {
        cache.set(`query${i}`, [makeItem(`https://example.com/${i}`)]);
      }
      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(5);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('a', [makeItem('https://a.com')]);
      cache.set('b', [makeItem('https://b.com')]);
      cache.clear();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
    });

    it('should reset size to 0', () => {
      cache.set('a', [makeItem('https://a.com')]);
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return size of 0 for empty cache', () => {
      expect(cache.getStats().size).toBe(0);
    });

    it('should track hits', () => {
      cache.set('query', [makeItem('https://example.com')]);
      cache.get('query');
      cache.get('query');
      expect(cache.getStats().totalHits).toBe(2);
    });

    it('should count expired entries', () => {
      vi.useFakeTimers();
      cache.set('old', [makeItem('https://example.com')]);
      vi.advanceTimersByTime(2000); // past TTL
      cache.set('new', [makeItem('https://example.com/2')]);

      const stats = cache.getStats();
      expect(stats.expiredCount).toBe(1);
      vi.useRealTimers();
    });
  });

  describe('pruneExpired', () => {
    it('should return 0 when nothing is expired', () => {
      cache.set('query', [makeItem('https://example.com')]);
      expect(cache.pruneExpired()).toBe(0);
    });

    it('should remove expired entries and return count', () => {
      vi.useFakeTimers();
      const START = 1_700_000_000_000;
      vi.setSystemTime(START);

      cache.set('old1', [makeItem('https://example1.com')]);
      cache.set('old2', [makeItem('https://example2.com')]);

      // Advance past TTL so old entries expire
      vi.setSystemTime(START + 2000);
      cache.set('fresh', [makeItem('https://fresh.com')]); // new entry after advance

      const pruned = cache.pruneExpired();
      expect(pruned).toBe(2);
      vi.useRealTimers();
    });

    it('should leave non-expired entries intact', () => {
      vi.useFakeTimers();
      cache.set('old', [makeItem('https://old.com')]);
      vi.advanceTimersByTime(2000);

      const freshItems = [makeItem('https://fresh.com')];
      cache.set('fresh', freshItems);
      vi.advanceTimersByTime(100); // small advance, fresh still valid

      cache.pruneExpired();
      vi.useRealTimers();
      // After prune, 'fresh' should still be accessible (within TTL regardless of fake time restore)
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
    });
  });

  describe('constructor defaults', () => {
    it('should use default maxSize of 100', () => {
      const defaultCache = new SearchCache();
      expect(defaultCache.getStats().maxSize).toBe(100);
    });
  });
});
