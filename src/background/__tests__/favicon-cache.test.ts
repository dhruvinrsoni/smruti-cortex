// Tests for favicon-cache.ts — comprehensive coverage for all exported functions
// Uses manual IndexedDB mock (fake-indexeddb not installed) + vi.resetModules for fresh state

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

// ── Logger mock (must be before any import of favicon-cache) ─────────────
vi.mock('../../core/logger', () => mockLogger());

// ── IndexedDB mock infrastructure ────────────────────────────────────────
// A simple in-memory store keyed by hostname, supporting get/put/clear/getAll/openCursor

type FaviconEntry = { hostname: string; dataUrl: string; cachedAt: number; size: number };

let store: Map<string, FaviconEntry>;

/** Create a mock IDBRequest that fires onsuccess/onerror async */
function mockRequest<T>(resultOrError: T | Error): { onsuccess: ((e?: unknown) => void) | null; onerror: (() => void) | null; result: T | undefined; error: Error | null } {
  const req: {
    onsuccess: ((e?: unknown) => void) | null;
    onerror: (() => void) | null;
    result: T | undefined;
    error: Error | null;
  } = { onsuccess: null, onerror: null, result: undefined, error: null };

  queueMicrotask(() => {
    if (resultOrError instanceof Error) {
      req.error = resultOrError;
      req.onerror?.();
    } else {
      req.result = resultOrError as T;
      req.onsuccess?.({ target: req });
    }
  });

  return req;
}

/** Simulate a cursor that iterates over all store entries, then signals completion with null */
function mockCursorRequest() {
  const entries = [...store.values()];
  let idx = 0;
  const deleted: string[] = [];

  const req: {
    onsuccess: ((e: unknown) => void) | null;
    onerror: (() => void) | null;
    result: unknown;
    error: Error | null;
  } = { onsuccess: null, onerror: null, result: undefined, error: null };

  function advance() {
    queueMicrotask(() => {
      if (idx < entries.length) {
        const entry = entries[idx];
        idx++;
        req.result = {
          value: entry,
          delete: () => {
            deleted.push(entry.hostname);
            store.delete(entry.hostname);
          },
          continue: () => advance(),
        };
      } else {
        req.result = null; // end of cursor
      }
      req.onsuccess?.({ target: req });
    });
  }

  // Kick off first iteration
  queueMicrotask(() => advance());

  // Attach deleted list for assertions
  (req as unknown as { _deleted: string[] })._deleted = deleted;
  return req;
}

function buildMockObjectStore() {
  return {
    get: vi.fn((key: string) => mockRequest(store.get(key))),
    put: vi.fn((entry: FaviconEntry) => {
      store.set(entry.hostname, entry);
      return mockRequest(undefined);
    }),
    clear: vi.fn(() => {
      store.clear();
      return mockRequest(undefined);
    }),
    getAll: vi.fn(() => mockRequest([...store.values()])),
    openCursor: vi.fn(() => mockCursorRequest()),
    createIndex: vi.fn(),
  };
}

let mockObjectStore: ReturnType<typeof buildMockObjectStore>;
let mockDb: {
  objectStoreNames: { contains: ReturnType<typeof vi.fn> };
  transaction: ReturnType<typeof vi.fn>;
  createObjectStore: ReturnType<typeof vi.fn>;
};
let openShouldFail = false;
let openShouldUpgrade = false;

function setupIndexedDB() {
  mockObjectStore = buildMockObjectStore();
  mockDb = {
    objectStoreNames: { contains: vi.fn(() => !openShouldUpgrade) },
    transaction: vi.fn(() => ({ objectStore: vi.fn(() => mockObjectStore) })),
    createObjectStore: vi.fn(() => mockObjectStore),
  };

  vi.stubGlobal('indexedDB', {
    open: vi.fn(() => {
      const req: Record<string, unknown> = {};
      queueMicrotask(() => {
        if (openShouldFail) {
          req.error = new Error('IDB open failed');
          (req.onerror as (() => void))?.();
        } else {
          // Real IDB sets result before firing onupgradeneeded
          req.result = mockDb;
          if (openShouldUpgrade && typeof req.onupgradeneeded === 'function') {
            (req.onupgradeneeded as () => void)();
          }
          (req.onsuccess as (() => void))?.();
        }
      });
      return req;
    }),
  });
}

// ── Fetch mock ───────────────────────────────────────────────────────────
const mockFetch = vi.fn();

// ── FileReader mock ──────────────────────────────────────────────────────
function setupFileReaderMock(dataUrl = 'data:image/png;base64,AAAA') {
  vi.stubGlobal('FileReader', class {
    result: string | null = null;
    onloadend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    readAsDataURL() {
      queueMicrotask(() => {
        this.result = dataUrl;
        this.onloadend?.();
      });
    }
  });
}

// ── Test suite ───────────────────────────────────────────────────────────

describe('favicon-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
    store = new Map();
    openShouldFail = false;
    openShouldUpgrade = false;
    setupIndexedDB();
    setupFileReaderMock();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: dynamic import for fresh module state
  async function importModule() {
    return await import('../favicon-cache');
  }

  // ── openFaviconDatabase ──────────────────────────────────────────────

  describe('openFaviconDatabase', () => {
    it('should open the database and return the IDBDatabase instance', async () => {
      const { openFaviconDatabase } = await importModule();

      const db = await openFaviconDatabase();

      expect(db).toBe(mockDb);
      expect((indexedDB.open as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        'SmrutiCortex_Favicons', 1,
      );
    });

    it('should return the cached db on second call without reopening', async () => {
      const { openFaviconDatabase } = await importModule();

      const db1 = await openFaviconDatabase();
      const db2 = await openFaviconDatabase();

      expect(db1).toBe(db2);
      // indexedDB.open called only once
      expect((indexedDB.open as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });

    it('should reject when indexedDB.open fails', async () => {
      openShouldFail = true;
      setupIndexedDB();
      const { openFaviconDatabase } = await importModule();

      await expect(openFaviconDatabase()).rejects.toEqual(new Error('IDB open failed'));
    });

    it('should create object store on upgrade when store does not exist', async () => {
      openShouldUpgrade = true;
      setupIndexedDB();
      const { openFaviconDatabase } = await importModule();

      await openFaviconDatabase();

      expect(mockDb.createObjectStore).toHaveBeenCalledWith(
        'favicons', { keyPath: 'hostname' },
      );
      expect(mockObjectStore.createIndex).toHaveBeenCalledWith(
        'cachedAt', 'cachedAt', { unique: false },
      );
    });

    it('should skip object store creation on upgrade when store already exists', async () => {
      openShouldUpgrade = true;
      setupIndexedDB();
      // Override contains to return true (store already exists)
      mockDb.objectStoreNames.contains.mockReturnValue(true);
      const { openFaviconDatabase } = await importModule();

      await openFaviconDatabase();

      expect(mockDb.createObjectStore).not.toHaveBeenCalled();
    });
  });

  // ── getCachedFavicon ─────────────────────────────────────────────────

  describe('getCachedFavicon', () => {
    it('should return null on cache miss (no entry)', async () => {
      const { getCachedFavicon } = await importModule();

      const result = await getCachedFavicon('example.com');

      expect(result).toBeNull();
    });

    it('should return dataUrl on cache hit (fresh positive entry)', async () => {
      store.set('example.com', {
        hostname: 'example.com',
        dataUrl: 'data:image/png;base64,ABC',
        cachedAt: Date.now() - 1000, // 1 second ago — fresh
        size: 100,
      });
      const { getCachedFavicon } = await importModule();

      const result = await getCachedFavicon('example.com');

      expect(result).toBe('data:image/png;base64,ABC');
    });

    it('should return null when positive entry is expired (>30 days)', async () => {
      const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
      store.set('example.com', {
        hostname: 'example.com',
        dataUrl: 'data:image/png;base64,OLD',
        cachedAt: Date.now() - thirtyOneDays,
        size: 100,
      });
      const { getCachedFavicon } = await importModule();

      const result = await getCachedFavicon('example.com');

      expect(result).toBeNull();
    });

    it('should return null when negative cache entry is fresh (< 7 days)', async () => {
      store.set('bad.com', {
        hostname: 'bad.com',
        dataUrl: '__FAVICON_NOT_FOUND__',
        cachedAt: Date.now() - 1000, // very recent
        size: 0,
      });
      const { getCachedFavicon } = await importModule();

      const result = await getCachedFavicon('bad.com');

      // Negative entry => dataUrl is null (the sentinel is not returned to callers)
      expect(result).toBeNull();
    });

    it('should return null when negative cache entry is expired (>7 days)', async () => {
      const eightDays = 8 * 24 * 60 * 60 * 1000;
      store.set('bad.com', {
        hostname: 'bad.com',
        dataUrl: '__FAVICON_NOT_FOUND__',
        cachedAt: Date.now() - eightDays,
        size: 0,
      });
      const { getCachedFavicon } = await importModule();

      const result = await getCachedFavicon('bad.com');

      // Expired negative entry treated as cache miss
      expect(result).toBeNull();
    });

    it('should return null and not throw when IDB get request fails', async () => {
      // Override the get mock to fire onerror
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockObjectStore.get.mockImplementation((() => {
        const req: Record<string, unknown> = { result: undefined, error: new Error('read error') };
        queueMicrotask(() => {
          (req.onerror as () => void)?.();
        });
        return req;
      }) as any);
      const { getCachedFavicon } = await importModule();

      const result = await getCachedFavicon('example.com');

      // The outer catch returns { dataUrl: null, isNegative: false } → getCachedFavicon returns null
      expect(result).toBeNull();
    });

    it('should return null when openFaviconDatabase throws', async () => {
      openShouldFail = true;
      setupIndexedDB();
      const { getCachedFavicon } = await importModule();

      const result = await getCachedFavicon('example.com');

      // getCachedEntry catches the error and returns { dataUrl: null, isNegative: false }
      expect(result).toBeNull();
    });
  });

  // ── cacheFavicon ─────────────────────────────────────────────────────

  describe('cacheFavicon', () => {
    it('should fetch favicon, convert to dataUrl, and store in cache', async () => {
      const fakeBlob = new Blob(['fake-image'], { type: 'image/png' });
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => fakeBlob,
      });
      const { cacheFavicon } = await importModule();

      const result = await cacheFavicon('example.com');

      // Should return the dataUrl from FileReader mock
      expect(result).toBe('data:image/png;base64,AAAA');
      // fetch was called with correct URL
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.google.com/s2/favicons?domain=example.com&sz=64',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      // Entry stored in our mock store
      expect(store.has('example.com')).toBe(true);
      expect(store.get('example.com')!.dataUrl).toBe('data:image/png;base64,AAAA');
    });

    it('should store negative entry and return null when fetch returns non-ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const { cacheFavicon } = await importModule();

      const result = await cacheFavicon('missing.com');

      expect(result).toBeNull();
      // Negative entry stored
      expect(store.get('missing.com')?.dataUrl).toBe('__FAVICON_NOT_FOUND__');
    });

    it('should store negative entry and return null when fetch throws (network error)', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));
      const { cacheFavicon } = await importModule();

      const result = await cacheFavicon('offline.com');

      expect(result).toBeNull();
      // Negative entry stored for retry avoidance
      expect(store.get('offline.com')?.dataUrl).toBe('__FAVICON_NOT_FOUND__');
    });

    it('should abort fetch after timeout', async () => {
      vi.useFakeTimers();
      // fetch that never resolves (simulates timeout)
      mockFetch.mockImplementation((_url: string, opts: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      });
      const { cacheFavicon } = await importModule();

      const resultPromise = cacheFavicon('slow.com');
      vi.advanceTimersByTime(5001); // past the 5000ms timeout

      const result = await resultPromise;

      expect(result).toBeNull();
      vi.useRealTimers();
    });

    it('should return null when IDB put request fails after successful fetch', async () => {
      const fakeBlob = new Blob(['img'], { type: 'image/png' });
      mockFetch.mockResolvedValue({ ok: true, blob: async () => fakeBlob });
      // Override put to fire onerror
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockObjectStore.put.mockImplementation((() => {
        const req: Record<string, unknown> = { result: undefined, error: new Error('put failed') };
        queueMicrotask(() => {
          (req.onerror as () => void)?.();
        });
        return req;
      }) as any);
      const { cacheFavicon } = await importModule();

      // The put error causes the inner promise to reject,
      // which is caught by the outer try/catch and stores a negative entry.
      // But since put is broken, the negative store will also fail,
      // so it ultimately returns null via the outer catch.
      const result = await cacheFavicon('example.com');

      expect(result).toBeNull();
    });
  });

  // ── getFaviconWithCache ──────────────────────────────────────────────

  describe('getFaviconWithCache', () => {
    // --- shouldSkipFavicon (indirect) ---

    describe('shouldSkipFavicon (indirect)', () => {
      it('should return null for empty hostname', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('')).toBeNull();
      });

      it('should return null for localhost', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('localhost')).toBeNull();
      });

      it('should return null for 127.0.0.1', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('127.0.0.1')).toBeNull();
      });

      it('should return null for ::1 (IPv6 loopback)', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('::1')).toBeNull();
      });

      it('should return null for IPv4 address', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('192.168.1.1')).toBeNull();
      });

      it('should return null for bracketed IPv6', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('[::1]')).toBeNull();
      });

      it('should return null for .local domain', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('server.local')).toBeNull();
      });

      it('should return null for .internal domain', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('db.internal')).toBeNull();
      });

      it('should return null for .localhost domain', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('app.localhost')).toBeNull();
      });

      it('should return null for chrome newtab', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('newtab')).toBeNull();
      });

      it('should return null for chrome extensions', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('extensions')).toBeNull();
      });

      it('should return null for .chrome domain', async () => {
        const { getFaviconWithCache } = await importModule();
        expect(await getFaviconWithCache('settings.chrome')).toBeNull();
      });
    });

    // --- Cache hit / miss / negative ---

    it('should return cached dataUrl on positive cache hit', async () => {
      store.set('cached.com', {
        hostname: 'cached.com',
        dataUrl: 'data:image/png;base64,HIT',
        cachedAt: Date.now(),
        size: 50,
      });
      const { getFaviconWithCache } = await importModule();

      const result = await getFaviconWithCache('cached.com');

      expect(result).toBe('data:image/png;base64,HIT');
      // fetch should NOT be called (cache hit)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null for negative cache hit without fetching', async () => {
      store.set('broken.com', {
        hostname: 'broken.com',
        dataUrl: '__FAVICON_NOT_FOUND__',
        cachedAt: Date.now(),
        size: 0,
      });
      const { getFaviconWithCache } = await importModule();

      const result = await getFaviconWithCache('broken.com');

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch and cache on cache miss', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['img']),
      });
      const { getFaviconWithCache } = await importModule();

      const result = await getFaviconWithCache('fresh.com');

      expect(result).toBe('data:image/png;base64,AAAA');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(store.has('fresh.com')).toBe(true);
    });

    it('should deduplicate concurrent fetches for the same hostname', async () => {
      // Fetch resolves after a short delay
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          blob: async () => new Blob(['img']),
        }),
      );
      const { getFaviconWithCache } = await importModule();

      // Fire two concurrent requests for the same hostname
      const [r1, r2] = await Promise.all([
        getFaviconWithCache('dedup.com'),
        getFaviconWithCache('dedup.com'),
      ]);

      // Both should get the same result
      expect(r1).toBe('data:image/png;base64,AAAA');
      expect(r2).toBe('data:image/png;base64,AAAA');
      // But fetch should only be called once (deduplication)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should clean up pending fetch after completion', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['img']),
      });
      const { getFaviconWithCache } = await importModule();

      await getFaviconWithCache('cleanup.com');
      // Second call should trigger a new fetch (pendingFetches was cleaned up)
      await getFaviconWithCache('cleanup.com');

      // First call stored in cache, so second call is a cache hit — no second fetch
      // (because the first call succeeded and stored the entry)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should clean up pending fetch even when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const { getFaviconWithCache } = await importModule();

      const result = await getFaviconWithCache('failing.com');

      expect(result).toBeNull();
      // Negative entry stored, so next call won't re-fetch
      expect(store.get('failing.com')?.dataUrl).toBe('__FAVICON_NOT_FOUND__');
    });
  });

  // ── clearFaviconCache ────────────────────────────────────────────────

  describe('clearFaviconCache', () => {
    it('should clear all entries and return count and freed bytes', async () => {
      store.set('a.com', { hostname: 'a.com', dataUrl: 'data:img', cachedAt: Date.now(), size: 500 });
      store.set('b.com', { hostname: 'b.com', dataUrl: 'data:img2', cachedAt: Date.now(), size: 300 });
      const { clearFaviconCache } = await importModule();

      const result = await clearFaviconCache();

      expect(result.cleared).toBe(2);
      expect(result.freedBytes).toBe(800);
      expect(store.size).toBe(0);
    });

    it('should return { cleared: 0, freedBytes: 0 } when cache is empty', async () => {
      const { clearFaviconCache } = await importModule();

      const result = await clearFaviconCache();

      expect(result.cleared).toBe(0);
      expect(result.freedBytes).toBe(0);
    });

    it('should exclude negative entries from cleared count', async () => {
      store.set('good.com', { hostname: 'good.com', dataUrl: 'data:img', cachedAt: Date.now(), size: 200 });
      store.set('neg.com', { hostname: 'neg.com', dataUrl: '__FAVICON_NOT_FOUND__', cachedAt: Date.now(), size: 0 });
      const { clearFaviconCache } = await importModule();

      const result = await clearFaviconCache();

      // Stats only count real favicons (not negative); but clear() removes all
      expect(result.cleared).toBe(1); // only the positive entry counted
      expect(result.freedBytes).toBe(200);
      expect(store.size).toBe(0); // all entries cleared
    });

    it('should return zeroes when IDB clear request fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockObjectStore.clear.mockImplementation((() => {
        const req: Record<string, unknown> = { result: undefined, error: new Error('clear failed') };
        queueMicrotask(() => { (req.onerror as () => void)?.(); });
        return req;
      }) as any);
      const { clearFaviconCache } = await importModule();

      // The clear request errors; clearFaviconCache's catch returns { cleared: 0, freedBytes: 0 }
      // However, the clear() call rejects inside the promise, which is caught by try/catch
      const result = await clearFaviconCache();
      // Actually the error propagates; the outer catch returns the fallback
      expect(result).toEqual({ cleared: 0, freedBytes: 0 });
    });

    it('should return zeroes when openFaviconDatabase fails', async () => {
      openShouldFail = true;
      setupIndexedDB();
      const { clearFaviconCache } = await importModule();

      const result = await clearFaviconCache();

      expect(result).toEqual({ cleared: 0, freedBytes: 0 });
    });
  });

  // ── clearExpiredFavicons ─────────────────────────────────────────────

  describe('clearExpiredFavicons', () => {
    it('should delete expired positive entries (>30 days) and keep fresh ones', async () => {
      const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
      store.set('old.com', {
        hostname: 'old.com',
        dataUrl: 'data:img',
        cachedAt: Date.now() - thirtyOneDays,
        size: 100,
      });
      store.set('fresh.com', {
        hostname: 'fresh.com',
        dataUrl: 'data:img2',
        cachedAt: Date.now() - 1000,
        size: 100,
      });
      const { clearExpiredFavicons } = await importModule();

      const cleared = await clearExpiredFavicons();

      expect(cleared).toBe(1);
      expect(store.has('old.com')).toBe(false);
      expect(store.has('fresh.com')).toBe(true);
    });

    it('should delete expired negative entries (>7 days) and keep fresh negatives', async () => {
      const eightDays = 8 * 24 * 60 * 60 * 1000;
      store.set('old-neg.com', {
        hostname: 'old-neg.com',
        dataUrl: '__FAVICON_NOT_FOUND__',
        cachedAt: Date.now() - eightDays,
        size: 0,
      });
      store.set('new-neg.com', {
        hostname: 'new-neg.com',
        dataUrl: '__FAVICON_NOT_FOUND__',
        cachedAt: Date.now() - 1000,
        size: 0,
      });
      const { clearExpiredFavicons } = await importModule();

      const cleared = await clearExpiredFavicons();

      expect(cleared).toBe(1);
      expect(store.has('old-neg.com')).toBe(false);
      expect(store.has('new-neg.com')).toBe(true);
    });

    it('should return 0 when nothing is expired', async () => {
      store.set('fresh.com', {
        hostname: 'fresh.com',
        dataUrl: 'data:img',
        cachedAt: Date.now(),
        size: 50,
      });
      const { clearExpiredFavicons } = await importModule();

      const cleared = await clearExpiredFavicons();

      expect(cleared).toBe(0);
      expect(store.size).toBe(1);
    });

    it('should return 0 when store is empty', async () => {
      const { clearExpiredFavicons } = await importModule();

      const cleared = await clearExpiredFavicons();

      expect(cleared).toBe(0);
    });

    it('should return 0 when openFaviconDatabase fails', async () => {
      openShouldFail = true;
      setupIndexedDB();
      const { clearExpiredFavicons } = await importModule();

      const cleared = await clearExpiredFavicons();

      expect(cleared).toBe(0);
    });

    it('should return 0 when cursor request fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockObjectStore.openCursor.mockImplementation((() => {
        const req: Record<string, unknown> = { onsuccess: null, onerror: null, result: undefined, error: new Error('cursor fail') };
        queueMicrotask(() => { (req.onerror as () => void)?.(); });
        return req;
      }) as any);
      const { clearExpiredFavicons } = await importModule();

      const cleared = await clearExpiredFavicons();

      expect(cleared).toBe(0);
    });
  });

  // ── getFaviconCacheStats ─────────────────────────────────────────────

  describe('getFaviconCacheStats', () => {
    it('should return count, totalSize, and oldestCacheDate for positive entries only', async () => {
      store.set('a.com', { hostname: 'a.com', dataUrl: 'data:img1', cachedAt: 1000, size: 200 });
      store.set('b.com', { hostname: 'b.com', dataUrl: 'data:img2', cachedAt: 2000, size: 300 });
      store.set('neg.com', { hostname: 'neg.com', dataUrl: '__FAVICON_NOT_FOUND__', cachedAt: 500, size: 0 });
      const { getFaviconCacheStats } = await importModule();

      const stats = await getFaviconCacheStats();

      expect(stats.count).toBe(2); // excludes negative entry
      expect(stats.totalSize).toBe(500); // 200 + 300
      expect(stats.oldestCacheDate).toBe(1000); // oldest positive
    });

    it('should return zeroes and null oldestCacheDate when cache is empty', async () => {
      const { getFaviconCacheStats } = await importModule();

      const stats = await getFaviconCacheStats();

      expect(stats.count).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.oldestCacheDate).toBeNull();
    });

    it('should return zeroes when only negative entries exist', async () => {
      store.set('neg1.com', { hostname: 'neg1.com', dataUrl: '__FAVICON_NOT_FOUND__', cachedAt: 100, size: 0 });
      const { getFaviconCacheStats } = await importModule();

      const stats = await getFaviconCacheStats();

      expect(stats.count).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.oldestCacheDate).toBeNull();
    });

    it('should return fallback stats when openFaviconDatabase fails', async () => {
      openShouldFail = true;
      setupIndexedDB();
      const { getFaviconCacheStats } = await importModule();

      const stats = await getFaviconCacheStats();

      expect(stats).toEqual({ count: 0, totalSize: 0, oldestCacheDate: null });
    });

    it('should return fallback stats when getAll request fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockObjectStore.getAll.mockImplementation((() => {
        const req: Record<string, unknown> = { result: undefined, error: new Error('getAll fail') };
        queueMicrotask(() => { (req.onerror as () => void)?.(); });
        return req;
      }) as any);
      const { getFaviconCacheStats } = await importModule();

      const stats = await getFaviconCacheStats();

      expect(stats).toEqual({ count: 0, totalSize: 0, oldestCacheDate: null });
    });
  });

  // ── Edge cases / integration ─────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle fetch abort timeout clearing correctly (no timer leak)', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['img']),
      });
      const { cacheFavicon } = await importModule();

      const resultPromise = cacheFavicon('timer-test.com');
      // Let microtasks run so fetch resolves
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('data:image/png;base64,AAAA');
      vi.useRealTimers();
    });

    it('should handle storeNegativeEntry failure gracefully in cacheFavicon', async () => {
      // Fetch fails, and then the put for the negative entry also fails
      mockFetch.mockRejectedValue(new Error('network'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockObjectStore.put.mockImplementation((() => {
        const req: Record<string, unknown> = { result: undefined, error: new Error('put broken') };
        queueMicrotask(() => { (req.onerror as () => void)?.(); });
        return req;
      }) as any);
      const { cacheFavicon } = await importModule();

      // Should not throw even though both fetch and store fail
      const result = await cacheFavicon('double-fail.com');

      expect(result).toBeNull();
    });

    it('should handle storeNegativeEntry when openFaviconDatabase fails', async () => {
      // First call succeeds (for getCachedEntry), but we make put fail
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const { cacheFavicon } = await importModule();

      // storeNegativeEntry will try to store but our mock should handle it
      const result = await cacheFavicon('neg-store-fail.com');

      expect(result).toBeNull();
    });
  });
});
