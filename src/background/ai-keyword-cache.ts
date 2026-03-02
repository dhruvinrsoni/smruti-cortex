/**
 * Persistent AI Keyword Cache
 *
 * Stores keyword expansions in chrome.storage.local for:
 * - Persistence across service worker restarts and browser restarts
 * - Large capacity (5,000 entries — words are tiny, ~1MB total)
 * - Prefix matching (typing "git" finds cached "github api" keywords)
 * - Extension gets faster over time as cache grows
 *
 * Storage: single key 'aiKeywordCache' in chrome.storage.local.
 * Estimated size: 5,000 entries x ~200 bytes = ~1MB (well within 10MB limit).
 */

import { browserAPI } from '../core/helpers';
import { Logger } from '../core/logger';

const logger = Logger.forComponent('AIKeywordCache');

const STORAGE_KEY = 'aiKeywordCache';
const MAX_CACHE_SIZE = 5000;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (words don't change meaning)
const SAVE_DEBOUNCE_MS = 2000;

interface PersistentCacheEntry {
  k: string[];   // keywords (compact key name for storage)
  t: number;     // timestamp
  h: number;     // hit count (for LRU eviction)
}

// In-memory mirror of persistent cache (fast reads)
let cache: Map<string, PersistentCacheEntry> = new Map();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

/**
 * Load cache from chrome.storage.local into memory.
 * Safe to call multiple times — only loads once.
 */
export async function loadCache(): Promise<void> {
  if (loaded) {return;}

  try {
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      browserAPI.storage.local.get([STORAGE_KEY], resolve);
    });

    const stored = result[STORAGE_KEY];
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const entries = Object.entries(stored as Record<string, PersistentCacheEntry>);
      cache = new Map(entries);
      logger.info('loadCache', `Loaded ${cache.size} cached keyword expansions`);
    }
    loaded = true;
  } catch (error) {
    logger.warn('loadCache', 'Failed to load cache, starting fresh', { error });
    loaded = true;
  }
}

/**
 * Save cache to chrome.storage.local (debounced to avoid excessive writes)
 */
function scheduleSave(): void {
  dirty = true;
  if (saveTimer) {return;}

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!dirty) {return;}
    dirty = false;

    try {
      const obj: Record<string, PersistentCacheEntry> = Object.fromEntries(cache);
      await new Promise<void>((resolve) => {
        browserAPI.storage.local.set({ [STORAGE_KEY]: obj }, resolve);
      });
      logger.trace('scheduleSave', `Persisted ${cache.size} cache entries`);
    } catch (error) {
      logger.warn('scheduleSave', 'Failed to persist cache', { error });
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Exact match lookup.
 * Returns cached keywords or null if not found / expired.
 */
export function getCachedExpansion(query: string): string[] | null {
  const entry = cache.get(query);
  if (!entry) {return null;}

  if (Date.now() - entry.t > CACHE_TTL) {
    cache.delete(query);
    scheduleSave();
    return null;
  }

  entry.h++; // Track hits for LRU eviction
  return entry.k;
}

/**
 * Prefix matching: find cached expansion where a cached key starts with the query.
 * Example: typing "git" matches cached "github api" and returns those keywords.
 * Returns the best (most-hit) match, or null.
 */
export function getPrefixMatch(query: string): string[] | null {
  if (query.length < 2) {return null;} // Too short for prefix matching

  const now = Date.now();
  let bestMatch: { keywords: string[]; hits: number } | null = null;

  for (const [key, entry] of cache) {
    if (now - entry.t > CACHE_TTL) {continue;}

    // Cached key starts with what user typed (e.g. "github api" starts with "git")
    if (key.startsWith(query) && key !== query) {
      if (!bestMatch || entry.h > bestMatch.hits) {
        bestMatch = { keywords: entry.k, hits: entry.h };
      }
    }
  }

  if (bestMatch) {
    logger.debug('getPrefixMatch', `Prefix match for "${query}" found (${bestMatch.keywords.length} keywords)`);
  }

  return bestMatch?.keywords || null;
}

/**
 * Store expansion in cache.
 * Triggers debounced persistence to chrome.storage.local.
 */
export function cacheExpansion(query: string, keywords: string[]): void {
  // Evict if at capacity
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(query)) {
    evictLeastUsed();
  }

  cache.set(query, {
    k: keywords,
    t: Date.now(),
    h: 0
  });

  scheduleSave();
}

/**
 * Evict entries: first expired, then least-used (by hit count).
 */
function evictLeastUsed(): void {
  const now = Date.now();

  // First pass: remove expired entries
  for (const [key, entry] of cache) {
    if (now - entry.t > CACHE_TTL) {
      cache.delete(key);
    }
  }

  // If still over capacity, remove least-hit entries (10% batch)
  if (cache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].h - b[1].h);

    const toRemove = Math.max(1, Math.floor(cache.size * 0.1));
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      cache.delete(entries[i][0]);
    }

    logger.debug('evictLeastUsed', `Evicted ${toRemove} least-used entries`);
  }
}

/**
 * Clear the entire cache (both in-memory and persistent storage).
 */
export async function clearAIKeywordCache(): Promise<{ cleared: number }> {
  const count = cache.size;
  cache.clear();

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  dirty = false;

  await new Promise<void>((resolve) => {
    browserAPI.storage.local.remove(STORAGE_KEY, resolve);
  });

  logger.info('clearAIKeywordCache', `Cleared ${count} cached expansions`);
  return { cleared: count };
}

/**
 * Get cache statistics for the UI.
 */
export function getCacheStats(): { size: number; maxSize: number; estimatedBytes: number } {
  let estimatedBytes = 0;
  for (const [key, entry] of cache) {
    // Rough estimate: key chars + keyword chars + overhead
    estimatedBytes += key.length * 2 + entry.k.join('').length * 2 + 16;
  }

  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    estimatedBytes
  };
}
