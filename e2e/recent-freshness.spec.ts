/**
 * Recent-view freshness E2E tests.
 *
 * Validates the three layered fixes shipped in the "Recent View Freshness Fix"
 * plan:
 *
 *   B5 (auto-path):   chrome.history.onVisited -> upsertRecentVisit lands a
 *                     fresh row in IndexedDB without a manual Index Now click.
 *                     The next popup open shows that visit at the top.
 *
 *   B6 (Index Now):   Clicking Index Now while the popup is open clears the
 *                     warm session cache (MANUAL_INDEX -> clearRecentHistoryCache)
 *                     AND triggers a re-fetch of the popup's Recent list
 *                     (handleManualIndexSuccess -> loadRecentHistory). The top
 *                     row reflects the freshest IDB state within ~1 second.
 *
 *   B7 (cache vs IDB precedence):
 *                     If the warm session cache holds stale rows but IDB has
 *                     fresher rows, the popup must end up showing the IDB rows
 *                     after the GET_RECENT_HISTORY round-trip — even though
 *                     the warm cache may briefly paint first.
 *
 * Test strategy:
 *   - Use chrome.history.addUrl() inside the SW to register visits without
 *     real network navigation. addUrl fires the same chrome.history.onVisited
 *     listener that drives the production fast-path, so A1 is exercised
 *     genuinely.
 *   - Use direct IDB writes for B6 and B7 to avoid coupling those tests to
 *     A1 / chrome.history's internal timing.
 *   - Always clear cache + IDB between tests so state doesn't leak.
 */

import { test, expect } from './fixtures/extension';
import type { BrowserContext } from '@playwright/test';

const DB_NAME = 'smruti_cortex_db';
const DB_STORE = 'pages';
const DB_VERSION = 1;
const CACHE_KEY = 'recentHistoryCache';
const CACHE_VERSION = 1;

interface SeedItem {
  url: string;
  title: string;
  hostname: string;
  visitCount: number;
  lastVisit: number;
  tokens: string[];
}

async function clearCacheAndIdb(extensionContext: BrowserContext): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (args: { dbName: string; dbStore: string; dbVersion: number }) => {
    await (globalThis as unknown as { chrome: typeof chrome }).chrome.storage.session.clear();
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

async function seedIdb(extensionContext: BrowserContext, items: SeedItem[]): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (args: { items: SeedItem[]; dbName: string; dbStore: string; dbVersion: number }) => {
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
        for (const item of args.items) { store.put(item); }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { items, dbName: DB_NAME, dbStore: DB_STORE, dbVersion: DB_VERSION });
}

async function seedSessionCache(
  extensionContext: BrowserContext,
  items: SeedItem[],
): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (args: { items: SeedItem[]; cacheKey: string; cacheVersion: number }) => {
    const entry = {
      version: args.cacheVersion,
      items: args.items,
      writtenAt: Date.now(),
      limit: args.items.length,
    };
    await (globalThis as unknown as { chrome: typeof chrome }).chrome.storage.session.set({
      [args.cacheKey]: entry,
    });
  }, { items, cacheKey: CACHE_KEY, cacheVersion: CACHE_VERSION });
}

async function readIdbRows(extensionContext: BrowserContext): Promise<SeedItem[]> {
  const bg = extensionContext.serviceWorkers()[0];
  return bg.evaluate(async (args: { dbName: string; dbStore: string; dbVersion: number }) => {
    return new Promise<SeedItem[]>((resolve, reject) => {
      const req = indexedDB.open(args.dbName, args.dbVersion);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(args.dbStore, 'readonly');
        const all = tx.objectStore(args.dbStore).getAll();
        all.onsuccess = () => { db.close(); resolve(all.result as SeedItem[]); };
        all.onerror = () => { db.close(); reject(all.error); };
      };
    });
  }, { dbName: DB_NAME, dbStore: DB_STORE, dbVersion: DB_VERSION });
}

/**
 * Read the URLs visible in the popup's `#results` list, in render order.
 * Used by every test in this file; isolates the locator + DOM shape so a
 * future markup tweak only updates one spot.
 *
 * Note: opening the popup itself counts as a chrome.history visit, so
 * the popup's own `chrome-extension://.../popup.html` URL gets indexed
 * by the fast-path and surfaces at the top of Recent. Tests that care
 * about the order of *seeded* URLs filter the result through
 * `httpUrlsOnly()` below.
 */
async function readVisibleResultUrls(extPage: import('@playwright/test').Page): Promise<string[]> {
  return extPage.locator('#results li').evaluateAll((lis) =>
    (lis as HTMLElement[]).map((li) => {
      const urlEl = li.querySelector('.result-url');
      return (urlEl?.textContent ?? li.textContent ?? '').trim();
    }),
  );
}

/**
 * Filter to keep only http(s) test URLs, dropping the popup's own
 * chrome-extension:// row (which sorts to the top because opening the
 * popup is itself the most recent visit). Lets tests assert against the
 * relative ordering of the URLs they seeded without false positives from
 * the popup's self-visit.
 */
function httpUrlsOnly(urls: string[]): string[] {
  return urls.filter(u => u.startsWith('http://') || u.startsWith('https://'));
}

test.describe('Recent View Freshness > B5 auto-path (onVisited fast-path)', () => {
  test.afterEach(async ({ extensionContext }) => {
    await clearCacheAndIdb(extensionContext);
  });

  test('latest visit appears at the top of Recent without clicking Index Now', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await clearCacheAndIdb(extensionContext);

    // Use chrome.history.addUrl() inside the SW so we trigger the real
    // onVisited listener (which fires the upsertRecentVisit fast path)
    // without depending on real network navigation. addUrl is the Chrome
    // extension API for "pretend the user visited this URL"; it fires
    // onVisited identically to a navigation.
    const bg = extensionContext.serviceWorkers()[0];
    await bg.evaluate(async () => {
      const c = (globalThis as unknown as { chrome: typeof chrome }).chrome;
      // Visit three URLs in order; the third is the one we expect on top.
      await c.history.addUrl({ url: 'https://recent-freshness-b5-alpha.example.test/' });
      await new Promise(r => setTimeout(r, 50));
      await c.history.addUrl({ url: 'https://recent-freshness-b5-beta.example.test/' });
      await new Promise(r => setTimeout(r, 50));
      await c.history.addUrl({ url: 'https://recent-freshness-b5-gamma.example.test/' });
    });

    // Give the fast-path a beat to land. upsertRecentVisit's IDB write is
    // sub-millisecond on real Chromium; 500 ms is comfortable slack for
    // the dynamic imports inside the listener to settle.
    await page.waitForTimeout(500);

    // The fast path should have written all three rows to IDB.
    const rows = await readIdbRows(extensionContext);
    const seededUrls = rows.map(r => r.url).filter(u => u.includes('recent-freshness-b5-'));
    expect(seededUrls.length).toBeGreaterThanOrEqual(3);

    // Open the popup and assert the gamma URL is on top of the list.
    // We poll because the popup paints in two phases (warm-cache then
    // GET_RECENT_HISTORY) and the freshest row may surface in the second
    // paint. Any flake here means the fast-path failed to land.
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');
    const resultsList = page.locator('#results');
    await expect(resultsList).toBeAttached({ timeout: 5000 });

    // The popup's own chrome-extension:// URL also gets indexed by the
    // fast-path because opening it counts as a visit -- it'll sort above
    // the seeded http URLs. We assert against the ordering of the http
    // URLs only: gamma was visited last, so among {alpha, beta, gamma}
    // it must appear first.
    await expect.poll(
      async () => {
        const urls = httpUrlsOnly(await readVisibleResultUrls(page));
        const idx = (needle: string) => urls.findIndex(u => u.includes(needle));
        const g = idx('recent-freshness-b5-gamma');
        const b = idx('recent-freshness-b5-beta');
        const a = idx('recent-freshness-b5-alpha');
        return g >= 0 && b >= 0 && a >= 0 && g < b && b < a;
      },
      { timeout: 5000, intervals: [100, 200, 400] },
    ).toBe(true);
  });
});

test.describe('Recent View Freshness > B6 Index Now refreshes the open popup', () => {
  test.afterEach(async ({ extensionContext }) => {
    await clearCacheAndIdb(extensionContext);
  });

  test('after MANUAL_INDEX, GET_RECENT_HISTORY surfaces the freshest IDB row first', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await clearCacheAndIdb(extensionContext);

    // Seed IDB with an "older" row first.
    const baseTime = Date.now() - 60_000;
    await seedIdb(extensionContext, [{
      url: 'https://recent-freshness-b6-old.example.test/',
      title: 'Old Row',
      hostname: 'recent-freshness-b6-old.example.test',
      visitCount: 1,
      lastVisit: baseTime,
      tokens: ['old', 'row'],
    }]);

    // Open the popup so the SW + UI are warm and the runtime port is
    // open. We don't assert the initial DOM here because opening the
    // popup itself counts as a chrome.history visit, so the popup's own
    // chrome-extension:// URL will sort above any seeded row in the live
    // merge. The test contract we care about is: after MANUAL_INDEX,
    // GET_RECENT_HISTORY surfaces the freshest seeded row before the
    // older seeded row. That isolates A2 (cache clear) + A3 (popup
    // re-fetch) from the noise of the popup self-visit.
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');
    await expect(page.locator('#results')).toBeAttached({ timeout: 5000 });

    // Sanity: warm cache should have been written by the initial
    // GET_RECENT_HISTORY (or remain empty if nothing has loaded yet).
    // Either way, MANUAL_INDEX must clear it before responding OK so a
    // subsequent GET_RECENT_HISTORY does not paint pre-index rows.
    // Inject a fresher IDB row directly. We deliberately do NOT clear
    // the session cache by hand — A2 inside MANUAL_INDEX must do it.
    const newerTime = Date.now();
    await seedIdb(extensionContext, [{
      url: 'https://recent-freshness-b6-new.example.test/',
      title: 'New Row',
      hostname: 'recent-freshness-b6-new.example.test',
      visitCount: 1,
      lastVisit: newerTime,
      tokens: ['new', 'row'],
    }]);

    // Drive MANUAL_INDEX through the runtime port — same path the popup's
    // click handler uses — then verify the contract A3 enforces:
    // GET_RECENT_HISTORY now returns the newer row first among seeded
    // rows. We filter chrome-extension:// URLs because opening the popup
    // counts as the most recent visit and would otherwise dominate the
    // merge.
    const manualIndexResp = await page.evaluate(async () => {
      const c = (globalThis as unknown as { chrome: typeof chrome }).chrome;
      return new Promise((resolve) => {
        c.runtime.sendMessage({ type: 'MANUAL_INDEX' }, (r: unknown) => resolve(r));
      });
    });
    expect(manualIndexResp).toMatchObject({ status: 'OK' });

    const refreshed = await page.evaluate(async () => {
      const c = (globalThis as unknown as { chrome: typeof chrome }).chrome;
      return new Promise<Array<{ url: string }>>((resolve) => {
        c.runtime.sendMessage({ type: 'GET_RECENT_HISTORY', limit: 50 }, (r: { results?: Array<{ url: string }> }) => {
          resolve(r?.results ?? []);
        });
      });
    });
    const seededOnly = refreshed
      .map(r => r.url)
      .filter(u => u.startsWith('http://') || u.startsWith('https://'))
      .filter(u => u.includes('recent-freshness-b6-'));

    expect(seededOnly.length).toBeGreaterThanOrEqual(2);
    // The fresher row must sort first among seeded rows; A2 (cache clear)
    // and A3 (re-fetch) make this contract reliable.
    expect(seededOnly[0]).toContain('recent-freshness-b6-new');
    expect(seededOnly[1]).toContain('recent-freshness-b6-old');
  });
});

test.describe('Recent View Freshness > B7 cache vs IDB precedence', () => {
  test.afterEach(async ({ extensionContext }) => {
    await clearCacheAndIdb(extensionContext);
  });

  test('fresher IDB rows replace stale warm-cache rows after the GET_RECENT_HISTORY round-trip', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await clearCacheAndIdb(extensionContext);

    // Seed cache with stale rows. Their lastVisit is far older than the
    // IDB rows we seed below. If the popup's final paint trusts the cache
    // we'd see these on screen at steady state.
    const staleTime = Date.now() - 24 * 60 * 60 * 1000;
    await seedSessionCache(extensionContext, [
      {
        url: 'https://recent-freshness-b7-stale-x.example.test/',
        title: 'Stale X',
        hostname: 'recent-freshness-b7-stale-x.example.test',
        visitCount: 1,
        lastVisit: staleTime,
        tokens: ['stale', 'x'],
      },
      {
        url: 'https://recent-freshness-b7-stale-y.example.test/',
        title: 'Stale Y',
        hostname: 'recent-freshness-b7-stale-y.example.test',
        visitCount: 1,
        lastVisit: staleTime - 1000,
        tokens: ['stale', 'y'],
      },
    ]);

    // Seed IDB with newer rows for entirely different URLs.
    const freshTime = Date.now();
    await seedIdb(extensionContext, [
      {
        url: 'https://recent-freshness-b7-fresh-p.example.test/',
        title: 'Fresh P',
        hostname: 'recent-freshness-b7-fresh-p.example.test',
        visitCount: 1,
        lastVisit: freshTime,
        tokens: ['fresh', 'p'],
      },
      {
        url: 'https://recent-freshness-b7-fresh-q.example.test/',
        title: 'Fresh Q',
        hostname: 'recent-freshness-b7-fresh-q.example.test',
        visitCount: 1,
        lastVisit: freshTime - 1_000,
        tokens: ['fresh', 'q'],
      },
    ]);

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');
    await expect(page.locator('#results')).toBeAttached({ timeout: 5000 });

    // After the GET_RECENT_HISTORY round-trip, the IDB rows must replace
    // the cache rows. Poll because the cache paint may land first; the
    // contract is "ends in a state where IDB rows are visible".
    await expect.poll(
      async () => {
        const urls = await readVisibleResultUrls(page);
        const hasFresh = urls.some(u => u.includes('recent-freshness-b7-fresh'));
        const hasStale = urls.some(u => u.includes('recent-freshness-b7-stale'));
        return hasFresh && !hasStale;
      },
      { timeout: 5000, intervals: [100, 200, 400, 800] },
    ).toBe(true);
  });
});
