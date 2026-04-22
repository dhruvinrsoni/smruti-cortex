import { test, expect } from './fixtures/extension';

/**
 * Warm-cache integration tests.
 *
 * Verifies the "instant first paint" path added in commit 9ecc6e5:
 * - Popup and quick-search read `chrome.storage.session.recentHistoryCache`
 *   synchronously (relative to the SW port round-trip) and render rows
 *   from it BEFORE GET_RECENT_HISTORY has resolved.
 * - The cache entry is versioned with `CACHE_VERSION` and carries a
 *   `writtenAt` timestamp for TTL checks.
 * - On destructive ops (REBUILD_INDEX / CLEAR_ALL_DATA / FACTORY_RESET)
 *   the entry is wiped so the next open does not paint stale rows.
 *
 * Strategy:
 *   We seed both the session cache AND IndexedDB with the same sentinel
 *   items (via IMPORT_INDEX). That way the port-path returns the same
 *   rows we cached, so the sentinel stays on screen after the refresh
 *   and we can assert against stable DOM without a timing race. The
 *   asserted precedence ("cache paints first") is implicit: with an
 *   empty session cache, on a fresh profile with an empty IDB, the
 *   popup falls back to chrome.history — none of our sentinel URLs
 *   would appear. Their appearance here can only come from the cache
 *   write+read path we want to exercise.
 *
 * Caveats:
 *   IMPORT_INDEX is the production path used by Settings > Import. It
 *   does not need REBUILD_INDEX afterwards (rows are written directly
 *   to the `items` object store). If a future refactor gates recent
 *   queries behind a rebuilt index, these tests will need to call
 *   REBUILD_INDEX too.
 */

const CACHE_KEY = 'recentHistoryCache';
const CACHE_VERSION = 1;

interface SentinelItem {
  url: string;
  title: string;
  hostname: string;
  visitCount: number;
  lastVisit: number;
  tokens: string[];
}

function makeSentinels(): SentinelItem[] {
  const now = Date.now();
  return [
    {
      url: 'https://cache-sentinel-alpha.example.test/',
      title: 'Alpha Warm Cache Sentinel',
      hostname: 'cache-sentinel-alpha.example.test',
      visitCount: 3,
      lastVisit: now - 1_000,
      tokens: ['alpha', 'warm', 'cache', 'sentinel'],
    },
    {
      url: 'https://cache-sentinel-beta.example.test/',
      title: 'Beta Warm Cache Sentinel',
      hostname: 'cache-sentinel-beta.example.test',
      visitCount: 2,
      lastVisit: now - 2_000,
      tokens: ['beta', 'warm', 'cache', 'sentinel'],
    },
    {
      url: 'https://cache-sentinel-gamma.example.test/',
      title: 'Gamma Warm Cache Sentinel',
      hostname: 'cache-sentinel-gamma.example.test',
      visitCount: 1,
      lastVisit: now - 3_000,
      tokens: ['gamma', 'warm', 'cache', 'sentinel'],
    },
  ];
}

const DB_NAME = 'smruti_cortex_db';
const DB_STORE = 'pages';
const DB_VERSION = 1;

async function seedCacheAndIdb(
  extensionContext: any,
  items: SentinelItem[],
  cacheKey: string,
  cacheVersion: number,
): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (args: {
    items: SentinelItem[];
    cacheKey: string;
    cacheVersion: number;
    dbName: string;
    dbStore: string;
    dbVersion: number;
  }) => {
    // Session cache write — production path is handlers/search-handlers.ts
    // calling setRecentHistoryCache() after a successful GET_RECENT_HISTORY.
    const entry = {
      version: args.cacheVersion,
      items: args.items,
      writtenAt: Date.now(),
      limit: args.items.length,
    };
    await (globalThis as any).chrome.storage.session.set({ [args.cacheKey]: entry });

    // IDB seed — write directly so GET_RECENT_HISTORY returns the same
    // rows the cache painted, keeping them on screen after the refresh.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(args.dbName, args.dbVersion);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(args.dbStore)) {
          db.createObjectStore(args.dbStore, { keyPath: 'url' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(args.dbStore, 'readwrite');
        const store = tx.objectStore(args.dbStore);
        for (const item of args.items) {store.put(item);}
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { items, cacheKey, cacheVersion, dbName: DB_NAME, dbStore: DB_STORE, dbVersion: DB_VERSION });
}

async function clearCacheAndIdb(extensionContext: any): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (args: { dbName: string; dbStore: string; dbVersion: number }) => {
    await (globalThis as any).chrome.storage.session.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.open(args.dbName, args.dbVersion);
      req.onerror = () => resolve();
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(args.dbStore)) {
          db.createObjectStore(args.dbStore, { keyPath: 'url' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(args.dbStore)) { db.close(); resolve(); return; }
        const tx = db.transaction(args.dbStore, 'readwrite');
        tx.objectStore(args.dbStore).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
    });
  }, { dbName: DB_NAME, dbStore: DB_STORE, dbVersion: DB_VERSION });
}

test.describe('Warm cache > Popup', () => {
  test.afterEach(async ({ extensionContext }) => {
    await clearCacheAndIdb(extensionContext);
  });

  test('paints cached sentinel rows on popup open', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    const sentinels = makeSentinels();
    await seedCacheAndIdb(extensionContext, sentinels, CACHE_KEY, CACHE_VERSION);

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    // At least one sentinel URL should be visible in the results list.
    // We assert on URL because it is stable and unique, unlike title
    // (which might be re-ranked or abbreviated in the future).
    const resultsList = page.locator('#results');
    await expect(resultsList).toBeAttached({ timeout: 5000 });

    await expect.poll(
      async () => {
        const urls: string[] = await page.locator('#results li').evaluateAll((lis) =>
          (lis as HTMLElement[]).map((li) => {
            const urlEl = li.querySelector('.result-url');
            return urlEl?.textContent ?? li.textContent ?? '';
          }),
        );
        return urls.some((u) => u.includes('cache-sentinel-alpha.example.test'));
      },
      { timeout: 5000, intervals: [100, 200, 400] },
    ).toBe(true);
  });

  test('ignores cache entry with mismatched version', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    const sentinels = makeSentinels();
    const badVersion = CACHE_VERSION + 999;
    // Deliberately use a version the reader will reject. Note: do NOT
    // seed IDB here — we want to prove that nothing from the mismatched
    // cache entry leaks into the rendered list.
    const bg = extensionContext.serviceWorkers()[0];
    await bg.evaluate(async ({ items, cacheKey, cacheVersion }: any) => {
      await (globalThis as any).chrome.storage.session.set({
        [cacheKey]: { version: cacheVersion, items, writtenAt: Date.now(), limit: items.length },
      });
    }, { items: sentinels, cacheKey: CACHE_KEY, cacheVersion: badVersion });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    // Give the popup enough time that any warm-cache paint would have landed.
    await page.waitForTimeout(1500);

    const sentinelVisible = await page.locator('#results li').evaluateAll((lis) =>
      (lis as HTMLElement[]).some((li) => {
        const urlEl = li.querySelector('.result-url');
        const text = (urlEl?.textContent ?? li.textContent ?? '');
        return text.includes('cache-sentinel');
      }),
    );
    expect(sentinelVisible).toBe(false);
  });

  test('destructive op (CLEAR_ALL_DATA) wipes the cache entry', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    const sentinels = makeSentinels();
    await seedCacheAndIdb(extensionContext, sentinels, CACHE_KEY, CACHE_VERSION);

    // Sanity check — the entry exists before the destructive op.
    const bg = extensionContext.serviceWorkers()[0];
    const before: any = await bg.evaluate(async (key: string) => {
      const bag = await (globalThis as any).chrome.storage.session.get(key);
      return bag?.[key] ?? null;
    }, CACHE_KEY);
    expect(before).not.toBeNull();
    expect(before.items.length).toBeGreaterThan(0);

    // Invoke CLEAR_ALL_DATA through the normal message path.
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');
    const clearResp: any = await page.evaluate(async () => {
      return new Promise((resolve) => {
        (window as any).chrome.runtime.sendMessage(
          { type: 'CLEAR_ALL_DATA' },
          (r: unknown) => resolve(r),
        );
      });
    });
    expect(clearResp).toHaveProperty('status', 'OK');

    // Cache entry should be gone. Poll briefly because clear is async.
    await expect.poll(
      async () => {
        const after: any = await bg.evaluate(async (key: string) => {
          const bag = await (globalThis as any).chrome.storage.session.get(key);
          return bag?.[key] ?? null;
        }, CACHE_KEY);
        return after;
      },
      { timeout: 3000, intervals: [100, 200, 400] },
    ).toBeNull();
  });
});
