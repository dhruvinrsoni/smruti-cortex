import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRecentHistoryCache,
  setRecentHistoryCache,
  clearRecentHistoryCache,
  __testing,
} from '../recent-history-cache';

const { CACHE_KEY, CACHE_VERSION, CACHE_MAX_AGE_MS, MAX_CACHED_ITEMS } = __testing;

// Build a minimal chrome.storage.session-like mock with in-memory backing
// so we exercise the real get/set/remove flows, not Vitest's own spies.
function mockSessionStorage(initial: Record<string, unknown> = {}) {
  let store: Record<string, unknown> = { ...initial };
  return {
    get: vi.fn(async (key: string) => ({ [key]: store[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      store = { ...store, ...items };
    }),
    remove: vi.fn(async (key: string) => {
      const next = { ...store };
      delete next[key];
      store = next;
    }),
    _peek: () => store,
  };
}

describe('recent-history-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('getRecentHistoryCache', () => {
    it('returns null when chrome.storage.session is unavailable', async () => {
      vi.stubGlobal('chrome', { storage: {} });
      const result = await getRecentHistoryCache();
      expect(result).toBeNull();
    });

    it('returns null when chrome itself is missing', async () => {
      vi.stubGlobal('chrome', undefined);
      vi.stubGlobal('browser', undefined);
      const result = await getRecentHistoryCache();
      expect(result).toBeNull();
    });

    it('returns null when the key has never been written', async () => {
      const session = mockSessionStorage();
      vi.stubGlobal('chrome', { storage: { session } });
      const result = await getRecentHistoryCache();
      expect(result).toBeNull();
    });

    it('returns null when the cached entry has an older version', async () => {
      const session = mockSessionStorage({
        [CACHE_KEY]: {
          version: CACHE_VERSION - 1,
          items: [{ url: 'a' }],
          writtenAt: Date.now(),
          limit: 50,
        },
      });
      vi.stubGlobal('chrome', { storage: { session } });
      const result = await getRecentHistoryCache();
      expect(result).toBeNull();
    });

    it('returns null when the cached entry is older than the hard TTL', async () => {
      const session = mockSessionStorage({
        [CACHE_KEY]: {
          version: CACHE_VERSION,
          items: [{ url: 'a' }],
          writtenAt: Date.now() - CACHE_MAX_AGE_MS - 1,
          limit: 50,
        },
      });
      vi.stubGlobal('chrome', { storage: { session } });
      const result = await getRecentHistoryCache();
      expect(result).toBeNull();
    });

    it('returns null when items is empty', async () => {
      const session = mockSessionStorage({
        [CACHE_KEY]: {
          version: CACHE_VERSION,
          items: [],
          writtenAt: Date.now(),
          limit: 50,
        },
      });
      vi.stubGlobal('chrome', { storage: { session } });
      const result = await getRecentHistoryCache();
      expect(result).toBeNull();
    });

    it('returns the entry when valid and fresh', async () => {
      const items = [{ url: 'https://example.com', title: 'Example' }];
      const session = mockSessionStorage({
        [CACHE_KEY]: {
          version: CACHE_VERSION,
          items,
          writtenAt: Date.now(),
          limit: 50,
        },
      });
      vi.stubGlobal('chrome', { storage: { session } });
      const result = await getRecentHistoryCache<{ url: string; title: string }>();
      expect(result).not.toBeNull();
      expect(result?.items).toEqual(items);
      expect(result?.limit).toBe(50);
    });

    it('swallows storage read errors and returns null', async () => {
      vi.stubGlobal('chrome', {
        storage: {
          session: {
            get: vi.fn(async () => { throw new Error('quota'); }),
            set: vi.fn(),
            remove: vi.fn(),
          },
        },
      });
      const result = await getRecentHistoryCache();
      expect(result).toBeNull();
    });

    it('falls back to browser.storage.session when chrome is unavailable', async () => {
      const session = mockSessionStorage({
        [CACHE_KEY]: {
          version: CACHE_VERSION,
          items: [{ url: 'a' }],
          writtenAt: Date.now(),
          limit: 50,
        },
      });
      vi.stubGlobal('chrome', undefined);
      vi.stubGlobal('browser', { storage: { session } });
      const result = await getRecentHistoryCache();
      expect(result?.items.length).toBe(1);
    });
  });

  describe('setRecentHistoryCache', () => {
    it('no-ops when storage is unavailable', async () => {
      vi.stubGlobal('chrome', { storage: {} });
      await expect(setRecentHistoryCache([{ url: 'a' }], 10)).resolves.toBeUndefined();
    });

    it('no-ops when items array is empty', async () => {
      const session = mockSessionStorage();
      vi.stubGlobal('chrome', { storage: { session } });
      await setRecentHistoryCache([], 10);
      expect(session.set).not.toHaveBeenCalled();
    });

    it('writes a versioned entry with writtenAt and limit', async () => {
      const session = mockSessionStorage();
      vi.stubGlobal('chrome', { storage: { session } });
      await setRecentHistoryCache([{ url: 'a', title: 't' }], 25);
      expect(session.set).toHaveBeenCalledTimes(1);
      const call = session.set.mock.calls[0][0] as Record<string, unknown>;
      const entry = call[CACHE_KEY] as {
        version: number;
        items: unknown[];
        writtenAt: number;
        limit: number;
      };
      expect(entry.version).toBe(CACHE_VERSION);
      expect(entry.limit).toBe(25);
      expect(entry.writtenAt).toBe(Date.now());
      expect(entry.items).toEqual([{ url: 'a', title: 't' }]);
    });

    it('strips embedding fields before writing', async () => {
      const session = mockSessionStorage();
      vi.stubGlobal('chrome', { storage: { session } });
      await setRecentHistoryCache(
        [{ url: 'a', title: 't', embedding: new Array(1024).fill(0.1) }],
        1,
      );
      const call = session.set.mock.calls[0][0] as Record<string, unknown>;
      const entry = call[CACHE_KEY] as { items: Record<string, unknown>[] };
      expect(entry.items[0]).toEqual({ url: 'a', title: 't' });
      expect(entry.items[0].embedding).toBeUndefined();
    });

    it('caps at MAX_CACHED_ITEMS even if caller passes more', async () => {
      const session = mockSessionStorage();
      vi.stubGlobal('chrome', { storage: { session } });
      const huge = Array.from({ length: MAX_CACHED_ITEMS + 50 }, (_, i) => ({ url: `u${i}` }));
      await setRecentHistoryCache(huge, huge.length);
      const call = session.set.mock.calls[0][0] as Record<string, unknown>;
      const entry = call[CACHE_KEY] as { items: unknown[] };
      expect(entry.items.length).toBe(MAX_CACHED_ITEMS);
    });

    it('swallows storage write errors', async () => {
      vi.stubGlobal('chrome', {
        storage: {
          session: {
            get: vi.fn(),
            set: vi.fn(async () => { throw new Error('quota'); }),
            remove: vi.fn(),
          },
        },
      });
      await expect(setRecentHistoryCache([{ url: 'a' }], 1)).resolves.toBeUndefined();
    });
  });

  describe('clearRecentHistoryCache', () => {
    it('no-ops when storage is unavailable', async () => {
      vi.stubGlobal('chrome', { storage: {} });
      await expect(clearRecentHistoryCache()).resolves.toBeUndefined();
    });

    it('removes the cache key', async () => {
      const session = mockSessionStorage({
        [CACHE_KEY]: { version: CACHE_VERSION, items: [{ url: 'a' }], writtenAt: Date.now(), limit: 1 },
      });
      vi.stubGlobal('chrome', { storage: { session } });
      await clearRecentHistoryCache();
      expect(session.remove).toHaveBeenCalledWith(CACHE_KEY);
      expect(session._peek()[CACHE_KEY]).toBeUndefined();
    });

    it('swallows storage remove errors', async () => {
      vi.stubGlobal('chrome', {
        storage: {
          session: {
            get: vi.fn(),
            set: vi.fn(),
            remove: vi.fn(async () => { throw new Error('fail'); }),
          },
        },
      });
      await expect(clearRecentHistoryCache()).resolves.toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('writes then reads back the same payload (after projection)', async () => {
      const session = mockSessionStorage();
      vi.stubGlobal('chrome', { storage: { session } });
      await setRecentHistoryCache(
        [
          { url: 'a', title: 't1', embedding: [1, 2, 3] },
          { url: 'b', title: 't2' },
        ],
        2,
      );
      const got = await getRecentHistoryCache();
      expect(got?.items).toEqual([
        { url: 'a', title: 't1' },
        { url: 'b', title: 't2' },
      ]);
      expect(got?.limit).toBe(2);
    });
  });
});
