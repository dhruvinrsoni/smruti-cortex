/**
 * search-handlers — focused unit tests for the cache-integration branches
 * added in the warm-cache plan:
 *
 * - GET_RECENT_HISTORY warms the session cache after a successful IDB read.
 * - GET_RECENT_HISTORY does not write to the cache on error or when the
 *   result set is empty.
 * - REBUILD_INDEX and CLEAR_ALL_DATA invalidate the cache on success so
 *   the next open does not paint pre-rebuild rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandlerRegistry } from '../registry';
import { registerSearchHandlers } from '../search-handlers';

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  errorMeta: (err: unknown) => ({ error: String(err) }),
}));

vi.mock('../../database', () => ({
  getRecentIndexedItems: vi.fn(),
  getAllIndexedItems: vi.fn(async () => []),
  saveIndexedItem: vi.fn(async () => {}),
  getStorageQuotaInfo: vi.fn(async () => ({})),
  // Default getSetting returns false so live-merge is OFF by default in
  // tests that don't opt in. Tests that exercise the live-merge path
  // override this per-call with mockResolvedValueOnce(true).
  getSetting: vi.fn(async () => false),
  setSetting: vi.fn(async () => {}),
}));

vi.mock('../../indexing', () => ({
  performFullRebuild: vi.fn(async () => {}),
  performBookmarksIndex: vi.fn(async () => ({})),
  performIncrementalHistoryIndexManual: vi.fn(async () => ({})),
  mergeMetadata: vi.fn(async () => {}),
}));

vi.mock('../../resilience', () => ({
  clearAndRebuild: vi.fn(async () => ({ success: true, message: 'ok', itemCount: 0 })),
  checkHealth: vi.fn(async () => ({})),
  selfHeal: vi.fn(async () => true),
  recoverFromCorruption: vi.fn(async () => true),
  handleQuotaExceeded: vi.fn(async () => {}),
}));

vi.mock('../../search/search-engine', () => ({
  runSearch: vi.fn(async () => []),
  getLastAIStatus: vi.fn(() => null),
}));

vi.mock('../../search/search-cache', () => ({
  clearSearchCache: vi.fn(),
}));

vi.mock('../../../shared/recent-history-cache', () => ({
  setRecentHistoryCache: vi.fn().mockResolvedValue(undefined),
  clearRecentHistoryCache: vi.fn().mockResolvedValue(undefined),
}));

function dispatch(
  registry: MessageHandlerRegistry,
  msg: { type: string; [k: string]: unknown },
) {
  return new Promise<Record<string, unknown>>((resolve) => {
    void registry.dispatch(
      msg,
      {} as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as Record<string, unknown>),
    );
  });
}

/** Yield back to the event loop so dynamic `import()` and the chained
 *  `.then()` / cache-write fire-and-forget both settle before assertions.
 *  A plain microtask flush is not enough for dynamic imports, which
 *  resolve on a macrotask in Node's ESM loader. */
async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('registerSearchHandlers', () => {
  let registry: MessageHandlerRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ version: '1.0.0' }) },
    });
    registry = new MessageHandlerRegistry();
    registerSearchHandlers(registry);
  });

  describe('GET_RECENT_HISTORY cache integration', () => {
    it('writes the result set into the session cache after a successful IDB read', async () => {
      const { getRecentIndexedItems } = await import('../../database');
      const { setRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      const items = [
        { url: 'https://a.example', title: 'A', lastVisit: 1 },
        { url: 'https://b.example', title: 'B', lastVisit: 2 },
      ];
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(items);

      const res = await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 25 });
      await flushMicrotasks();

      expect(res).toEqual({ results: items });
      expect(setRecentHistoryCache).toHaveBeenCalledTimes(1);
      expect(setRecentHistoryCache).toHaveBeenCalledWith(items, 25);
    });

    it('does not write to the cache when IDB returns an empty list', async () => {
      const { getRecentIndexedItems } = await import('../../database');
      const { setRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const res = await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 10 });
      await flushMicrotasks();

      expect(res).toEqual({ results: [] });
      expect(setRecentHistoryCache).not.toHaveBeenCalled();
    });

    it('does not write to the cache when IDB throws', async () => {
      const { getRecentIndexedItems } = await import('../../database');
      const { setRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db fail'));

      const res = await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 10 });
      await flushMicrotasks();

      expect(res).toEqual({ results: [] });
      expect(setRecentHistoryCache).not.toHaveBeenCalled();
    });

    it('does NOT call chrome.history.search when recentLiveMergeEnabled is false', async () => {
      // Default getSetting() returns false in this suite. The handler
      // must short-circuit before touching chrome.history at all so
      // operators who disable the live-merge see exactly the IDB rows.
      const { getRecentIndexedItems } = await import('../../database');
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'https://idb.example', lastVisit: 1 }]);
      const historySearch = vi.fn();
      vi.stubGlobal('chrome', {
        runtime: { getManifest: () => ({ version: '1.0.0' }), lastError: null },
        history: { search: historySearch },
      });

      const res = await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 5 });
      await flushMicrotasks();

      expect(res).toEqual({ results: [{ url: 'https://idb.example', lastVisit: 1 }] });
      expect(historySearch).not.toHaveBeenCalled();
    });

    it('merges chrome.history.search results into the IDB rows when live-merge is enabled', async () => {
      const { getRecentIndexedItems, getSetting } = await import('../../database');
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { url: 'https://idb.example/p', title: 'IDB row', hostname: 'idb.example', visitCount: 1, lastVisit: 100, tokens: ['t'] },
      ]);
      (getSetting as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      const liveRows = [
        { url: 'https://live-only.example/p', title: 'Live only', lastVisitTime: 500 },
        { url: 'https://idb.example/p', title: 'live-conflict', lastVisitTime: 600 }, // conflict; IDB wins, lastVisit advances
      ];
      const historySearch = vi.fn((_q: unknown, cb: (r: unknown[]) => void) => cb(liveRows));
      vi.stubGlobal('chrome', {
        runtime: { getManifest: () => ({ version: '1.0.0' }), lastError: null },
        history: { search: historySearch },
      });

      const res = await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 10 });
      await flushMicrotasks();

      expect(historySearch).toHaveBeenCalledTimes(1);
      const results = (res as { results: Array<Record<string, unknown>> }).results;
      expect(results.map(r => r.url)).toEqual([
        'https://idb.example/p',     // lastVisit advanced to 600
        'https://live-only.example/p', // lastVisit 500
      ]);
      expect(results[0].title).toBe('IDB row'); // IDB wins on field conflicts
      expect(results[0].lastVisit).toBe(600);
    });

    it('falls back to IDB-only when chrome.history.search throws synchronously', async () => {
      const { getRecentIndexedItems, getSetting } = await import('../../database');
      const idbRows = [{ url: 'https://idb.example', title: 'idb', hostname: 'idb.example', visitCount: 1, lastVisit: 1, tokens: [] }];
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(idbRows);
      (getSetting as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      vi.stubGlobal('chrome', {
        runtime: { getManifest: () => ({ version: '1.0.0' }), lastError: null },
        history: { search: () => { throw new Error('history blocked'); } },
      });

      const res = await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 10 });
      await flushMicrotasks();

      // IDB rows surface unchanged; the merge failure is silent.
      expect((res as { results: unknown[] }).results).toEqual(idbRows);
    });

    it('falls back to IDB-only when chrome.history.search never invokes its callback (timeout)', async () => {
      const { getRecentIndexedItems, getSetting } = await import('../../database');
      const idbRows = [{ url: 'https://idb-timeout.example', title: 'idb', hostname: 'idb-timeout.example', visitCount: 1, lastVisit: 7, tokens: [] }];
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(idbRows);
      (getSetting as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      // Callback never called — the 500 ms internal timeout must fire.
      vi.stubGlobal('chrome', {
        runtime: { getManifest: () => ({ version: '1.0.0' }), lastError: null },
        history: { search: vi.fn() },
      });

      const res = await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 5 });
      await flushMicrotasks();

      expect((res as { results: unknown[] }).results).toEqual(idbRows);
    }, 2000);

    it('response is sent before the cache write awaits, so cache latency cannot slow the consumer', async () => {
      const { getRecentIndexedItems } = await import('../../database');
      const { setRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'a' }]);

      let cacheResolvedAt: number | null = null;
      let responseResolvedAt: number | null = null;
      (setRecentHistoryCache as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => new Promise<void>((resolve) => {
          setTimeout(() => {
            cacheResolvedAt = Date.now();
            resolve();
          }, 20);
        }),
      );

      const started = Date.now();
      await dispatch(registry, { type: 'GET_RECENT_HISTORY', limit: 1 });
      responseResolvedAt = Date.now();

      // The handler's sendResponse should return well before the cache
      // write settles. We allow 15 ms slack for test-runner jitter; the
      // cache is capped at 20 ms by the mock above.
      expect(responseResolvedAt - started).toBeLessThan(15);
      expect(cacheResolvedAt).toBeNull();
    });
  });

  describe('destructive handlers invalidate the cache', () => {
    it('REBUILD_INDEX clears the cache after a successful rebuild', async () => {
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      const res = await dispatch(registry, { type: 'REBUILD_INDEX' });
      await flushMicrotasks();
      expect(res).toMatchObject({ status: 'OK' });
      expect(clearRecentHistoryCache).toHaveBeenCalledTimes(1);
    });

    it('REBUILD_INDEX does not clear the cache when rebuild fails', async () => {
      const { performFullRebuild } = await import('../../indexing');
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (performFullRebuild as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));

      const res = await dispatch(registry, { type: 'REBUILD_INDEX' });
      await flushMicrotasks();

      expect(res).toMatchObject({ status: 'ERROR' });
      expect(clearRecentHistoryCache).not.toHaveBeenCalled();
    });

    it('CLEAR_ALL_DATA clears the cache after a successful wipe', async () => {
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      const res = await dispatch(registry, { type: 'CLEAR_ALL_DATA' });
      await flushMicrotasks();
      expect(res).toMatchObject({ status: 'OK' });
      expect(clearRecentHistoryCache).toHaveBeenCalledTimes(1);
    });

    it('CLEAR_ALL_DATA does not clear the cache when the underlying wipe reports failure', async () => {
      const { clearAndRebuild } = await import('../../resilience');
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (clearAndRebuild as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        success: false,
        message: 'no',
        itemCount: 0,
      });

      const res = await dispatch(registry, { type: 'CLEAR_ALL_DATA' });
      await flushMicrotasks();

      expect(res).toMatchObject({ status: 'ERROR' });
      expect(clearRecentHistoryCache).not.toHaveBeenCalled();
    });

    it('MANUAL_INDEX clears the cache after a successful incremental index', async () => {
      // Mirrors REBUILD_INDEX behaviour. Without this, the next popup open
      // can paint pre-index rows from the warm session cache even though
      // the incremental indexer just wrote fresher rows to IndexedDB.
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      const res = await dispatch(registry, { type: 'MANUAL_INDEX' });
      await flushMicrotasks();
      expect(res).toMatchObject({ status: 'OK' });
      expect(clearRecentHistoryCache).toHaveBeenCalledTimes(1);
    });

    it('MANUAL_INDEX does not clear the cache when the incremental indexer throws', async () => {
      const { performIncrementalHistoryIndexManual } = await import('../../indexing');
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (performIncrementalHistoryIndexManual as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('history.search blew up'));

      const res = await dispatch(registry, { type: 'MANUAL_INDEX' });
      await flushMicrotasks();

      expect(res).toMatchObject({ status: 'ERROR' });
      expect(clearRecentHistoryCache).not.toHaveBeenCalled();
    });
  });
});
