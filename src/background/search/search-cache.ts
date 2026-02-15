// search-cache.ts — LRU cache for search results with TTL support

import { IndexedItem } from '../schema';
import { Logger } from '../../core/logger';

const logger = Logger.forComponent('SearchCache');

interface CacheEntry {
  results: IndexedItem[];
  timestamp: number;
  hits: number;
}

/**
 * LRU Cache with TTL for search results
 * Reduces repeated searches for the same query
 */
export class SearchCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 100, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached results for a query
   */
  get(query: string): IndexedItem[] | null {
    const key = this.normalizeQuery(query);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      logger.trace('get', `Cache expired for query: "${query}"`);
      return null;
    }

    // Update hit counter
    entry.hits++;
    logger.trace('get', `Cache hit for query: "${query}" (${entry.hits} hits)`);
    return entry.results;
  }

  /**
   * Store results for a query
   */
  set(query: string, results: IndexedItem[]): void {
    const key = this.normalizeQuery(query);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now(),
      hits: 0
    });

    logger.trace('set', `Cached ${results.length} results for query: "${query}"`);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    const prevSize = this.cache.size;
    this.cache.clear();
    logger.debug('clear', `Cleared ${prevSize} cache entries`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalHits = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const [, entry] of this.cache) {
      totalHits += entry.hits;
      if (now - entry.timestamp > this.ttlMs) {
        expiredCount++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalHits,
      expiredCount,
      hitRate: this.cache.size > 0 ? (totalHits / this.cache.size).toFixed(2) : '0.00'
    };
  }

  /**
   * Evict the oldest (least recently used) entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.trace('evictOldest', `Evicted oldest cache entry: "${oldestKey}"`);
    }
  }

  /**
   * Normalize query for consistent cache keys
   */
  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
  }

  /**
   * Remove expired entries (call periodically)
   */
  pruneExpired(): number {
    const now = Date.now();
    let prunedCount = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      logger.debug('pruneExpired', `Pruned ${prunedCount} expired cache entries`);
    }

    return prunedCount;
  }
}

// Singleton instance
let cacheInstance: SearchCache | null = null;

export function getSearchCache(): SearchCache {
  if (!cacheInstance) {
    cacheInstance = new SearchCache();
    
    // Prune expired entries every 60 seconds
    setInterval(() => {
      cacheInstance?.pruneExpired();
    }, 60 * 1000);
  }
  return cacheInstance;
}

export function clearSearchCache(): void {
  if (cacheInstance) {
    cacheInstance.clear();
  }
}
