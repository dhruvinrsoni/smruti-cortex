/**
 * Warm cache for the "recent history" list that quick-search and the popup
 * render when no query has been typed yet. Lives in
 * `chrome.storage.session` so that:
 *
 * - It persists across service worker evictions within a browser session
 *   (the whole point — after hibernate the SW is cold, but this cache is
 *   still warm and can paint instantly).
 * - It is cleared when the browser closes, so we never serve ancient data
 *   from a previous session.
 * - It does not consume disk quota.
 *
 * Layering with the rest of the hibernate-robustness work:
 *
 * - Commit 1-3 of the earlier plan fixed *correctness* (quick-search
 *   actually boots the SW after hibernate). This module fixes *perceived
 *   latency* by giving an instant first paint from cache while the port
 *   cold-start finishes in the background.
 * - The write path runs every time the SW answers GET_RECENT_HISTORY, so
 *   there is zero speculative writing — we only cache what a consumer
 *   just asked for.
 * - The read path is non-blocking on both surfaces; fresh results from
 *   the port overwrite the cached paint as soon as they arrive.
 *
 * Invariants:
 *
 * - Embeddings are stripped before write (huge, not needed for render).
 * - Versioned with `CACHE_VERSION` so a schema change invalidates old
 *   entries without a migration step.
 * - Hard TTL of 24h as a safety net against pathological staleness; in
 *   practice the 30-min keep-alive cadence overwrites it far more often.
 */

import { Logger, errorMeta } from '../core/logger';

const log = Logger.forComponent('RecentHistoryCache');

const CACHE_KEY = 'recentHistoryCache';

// Bump when the shape of `RecentHistoryCacheEntry.items` changes in a way
// that would make the renderer trip over older entries. Simple way to
// invalidate without migrations.
const CACHE_VERSION = 1;

// Entries older than this are treated as cache-miss. Chosen to be much
// longer than a typical active session so normal use never hits this
// path; it is a safety net for edge cases (very long idle, clock skew).
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Hard cap on items stored per entry. Even at the 500-item upper bound
// for GET_RECENT_HISTORY, capping here keeps the serialized payload
// bounded if a caller ever passes a larger list.
const MAX_CACHED_ITEMS = 200;

export interface RecentHistoryCacheEntry<T = unknown> {
  version: number;
  items: T[];
  writtenAt: number;
  limit: number;
}

interface StorageSessionLike {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

/**
 * Resolve `chrome.storage.session`, returning `null` on browsers or
 * contexts where it is unavailable (Firefox MV3 without the session
 * area, content scripts prior to extension context bootstrap, tests
 * that did not stub it). Callers treat null as cache-miss / no-op.
 */
function getSessionStorage(): StorageSessionLike | null {
  type GlobalShim = {
    chrome?: { storage?: { session?: StorageSessionLike } };
    browser?: { storage?: { session?: StorageSessionLike } };
  };
  const g = globalThis as unknown as GlobalShim;
  const session = g.chrome?.storage?.session ?? g.browser?.storage?.session;
  if (!session || typeof session.get !== 'function') {return null;}
  return session;
}

/**
 * Strip fields that would balloon the cache payload without being needed
 * for list rendering. Embeddings are the big one — 1024-dim Float32 per
 * item is ~4 KB, which at 50 items is ~200 KB per cache write.
 */
function projectForCache<T>(items: T[]): T[] {
  const capped = items.slice(0, MAX_CACHED_ITEMS);
  return capped.map((item) => {
    if (!item || typeof item !== 'object') {return item;}
    const rec = item as Record<string, unknown>;
    if (!('embedding' in rec)) {return item;}
    const { embedding: _drop, ...rest } = rec;
    void _drop;
    return rest as unknown as T;
  });
}

/**
 * Read the cached recent-history list. Returns `null` on any of:
 * storage unavailable, key absent, version mismatch, stale, or a read
 * error. Never throws.
 */
export async function getRecentHistoryCache<T = unknown>(): Promise<RecentHistoryCacheEntry<T> | null> {
  const session = getSessionStorage();
  if (!session) {return null;}
  try {
    const bag = await session.get(CACHE_KEY);
    const entry = bag?.[CACHE_KEY] as RecentHistoryCacheEntry<T> | undefined;
    if (!entry || typeof entry !== 'object') {return null;}
    if (entry.version !== CACHE_VERSION) {return null;}
    if (!Array.isArray(entry.items) || entry.items.length === 0) {return null;}
    if (typeof entry.writtenAt !== 'number') {return null;}
    if (Date.now() - entry.writtenAt > CACHE_MAX_AGE_MS) {return null;}
    return entry;
  } catch (err) {
    log.debug('getRecentHistoryCache', 'Session storage read failed — treating as cache miss', errorMeta(err));
    return null;
  }
}

/**
 * Write a recent-history list to the cache. Fire-and-forget: always
 * resolves, never throws, never blocks the caller's critical path.
 */
export async function setRecentHistoryCache<T>(items: T[], limit: number): Promise<void> {
  const session = getSessionStorage();
  if (!session) {return;}
  if (!Array.isArray(items) || items.length === 0) {return;}
  try {
    const entry: RecentHistoryCacheEntry<T> = {
      version: CACHE_VERSION,
      items: projectForCache(items),
      writtenAt: Date.now(),
      limit,
    };
    await session.set({ [CACHE_KEY]: entry });
  } catch (err) {
    // Storage quota, context invalidated, etc. — cache is a hint, not
    // a source of truth; swallowing is safe. Still emit a DEBUG so the
    // breadcrumb is in the buffer for post-mortems.
    log.debug('setRecentHistoryCache', 'Session storage write failed — cache is a hint, not a source of truth', errorMeta(err));
  }
}

/**
 * Remove the cache entry. Called after user-initiated destructive
 * actions (factory reset, clear all embeddings, full rebuild) so the
 * next open starts from a known state instead of painting stale rows.
 */
export async function clearRecentHistoryCache(): Promise<void> {
  const session = getSessionStorage();
  if (!session) {return;}
  try {
    await session.remove(CACHE_KEY);
  } catch (err) {
    // Same rationale as setRecentHistoryCache.
    log.debug('clearRecentHistoryCache', 'Session storage remove failed — next open may paint stale rows once', errorMeta(err));
  }
}

export const __testing = {
  CACHE_KEY,
  CACHE_VERSION,
  CACHE_MAX_AGE_MS,
  MAX_CACHED_ITEMS,
};
