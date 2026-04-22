import { test, expect } from './fixtures/extension';

/**
 * Report button E2E — masking chooser + staged visual flow + clipboard round-trip.
 *
 * Exercises the full path landed in the "Report Button Masking Chooser"
 * series:
 *   - Click Report → chooser renders with the 3 options from
 *     MASKING_OPTIONS in `none → partial → full` order.
 *   - Pick "Strictest" → button walks Generating… → Copying… → Copied!.
 *   - Clipboard contains a ranking report whose Query header is hashed
 *     (never contains the literal search token).
 *
 * Seeding: uses the same IDB-direct-seed pattern as warm-cache.spec.ts
 * so we don't depend on the flaky chrome.history API.
 */

interface SeedItem {
  url: string;
  title: string;
  hostname: string;
  visitCount: number;
  lastVisit: number;
  tokens: string[];
}

const DB_NAME = 'smruti_cortex_db';
const DB_STORE = 'pages';
const DB_VERSION = 1;

const QUERY = 'sprint';

function makeItems(): SeedItem[] {
  const now = Date.now();
  return [
    {
      url: 'https://report-sentinel-one.example.test/sprint/plan',
      title: 'Sprint Planning Notes',
      hostname: 'report-sentinel-one.example.test',
      visitCount: 5,
      lastVisit: now - 1_000,
      tokens: ['sprint', 'planning', 'notes'],
    },
    {
      url: 'https://report-sentinel-two.example.test/retro',
      title: 'Sprint Retro Summary',
      hostname: 'report-sentinel-two.example.test',
      visitCount: 4,
      lastVisit: now - 2_000,
      tokens: ['sprint', 'retro', 'summary'],
    },
    {
      url: 'https://report-sentinel-three.example.test/backlog',
      title: 'Sprint Backlog Grooming',
      hostname: 'report-sentinel-three.example.test',
      visitCount: 3,
      lastVisit: now - 3_000,
      tokens: ['sprint', 'backlog', 'grooming'],
    },
  ];
}

async function seedIdb(extensionContext: any, items: SeedItem[]): Promise<void> {
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

async function clearIdbAndCache(extensionContext: any): Promise<void> {
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

test.describe('Report button > Popup', () => {
  test.afterEach(async ({ extensionContext }) => {
    await clearIdbAndCache(extensionContext);
  });

  test('chooser opens with three options, staged flow copies report to clipboard', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    // chrome-extension:// origins are "opaque" to Playwright, so we can't
    // use grantPermissions() for clipboard-read. Instead we shim
    // navigator.clipboard.writeText before the page loads and capture the
    // last-written text on window — that gives us the exact value the
    // popup sent to the clipboard without needing permissions.
    await page.addInitScript(() => {
      (window as any).__lastClipboardWrite = null;
      const orig = navigator.clipboard?.writeText?.bind(navigator.clipboard);
      if (navigator.clipboard) {
        Object.defineProperty(navigator.clipboard, 'writeText', {
          configurable: true,
          value: async (text: string) => {
            (window as any).__lastClipboardWrite = text;
            if (orig) { try { await orig(text); } catch { /* best effort */ } }
          },
        });
      }
    });

    await seedIdb(extensionContext, makeItems());

    const popupOrigin = `chrome-extension://${extensionId}`;
    await page.goto(`${popupOrigin}/popup/popup.html`);
    await page.waitForLoadState('load');

    // Run the search that populates the snapshot used by the report.
    const input = page.locator('#search-input');
    await input.fill(QUERY);

    // Wait for the Report button to appear (only rendered when results > 0).
    const reportBtn = page.locator('.report-ranking-btn');
    await expect(reportBtn).toBeVisible({ timeout: 8000 });
    await expect(reportBtn).toHaveText('Report');

    // Open the chooser.
    await reportBtn.click();

    const chooser = page.locator('.report-chooser-dialog');
    await expect(chooser).toBeVisible();

    const optionButtons = page.locator('.report-chooser-option');
    await expect(optionButtons).toHaveCount(3);

    // Options must appear in canonical order and label up front.
    const levels = await optionButtons.evaluateAll((btns) =>
      (btns as HTMLElement[]).map((b) => b.getAttribute('data-level')),
    );
    expect(levels).toEqual(['none', 'partial', 'full']);

    // Pick "full" (the Strictest row) and assert the staged flow.
    const strictest = page.locator('.report-chooser-option-full');
    await strictest.click();

    // The chooser should tear down on pick.
    await expect(chooser).toHaveCount(0, { timeout: 2000 });

    // Generating… appears next. We poll here rather than waiting for
    // the exact label because the pulse + min-duration timing means the
    // transition happens in a narrow window.
    await expect.poll(
      async () => (await reportBtn.textContent()) ?? '',
      { timeout: 2000, intervals: [50, 100, 200] },
    ).toMatch(/Generating|Copying|Copied|Filed/);

    // Eventually lands on the success state.
    await expect.poll(
      async () => (await reportBtn.textContent()) ?? '',
      { timeout: 5000, intervals: [100, 200, 400] },
    ).toMatch(/Copied|Filed/);

    // Clipboard contains the ranking report AND does not leak the raw query.
    const clipboard = await page.evaluate(() => (window as any).__lastClipboardWrite as string | null);
    expect(clipboard).not.toBeNull();
    expect(clipboard!).toContain('## Ranking Bug Report');
    expect(clipboard!).toContain('| maskingLevel | full |');
    // The query cell at full is `[hash] (N tokens)` — the literal "sprint"
    // must never appear in a Query header cell at this level.
    expect(clipboard!).not.toMatch(/\| Query \| `sprint(?:[^`]*)?` \|/);
    // The Tokens list must NOT leak the raw token either.
    expect(clipboard!).not.toMatch(/\| Tokens \| `sprint`/);
    // Token Hits column is collapsed to "-" at full.
    expect(clipboard!).not.toContain('`sprint`');
    // AI Expanded Keywords is only rendered when aiExpandedKeywords.length > 0;
    // in this test that row is omitted, which is fine — the `full` contract
    // guarantees that *when present* it collapses to "N keywords".
  });

  test('chooser cancels via Escape without sending a message', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    const popupOrigin = `chrome-extension://${extensionId}`;
    await seedIdb(extensionContext, makeItems());

    await page.goto(`${popupOrigin}/popup/popup.html`);
    await page.waitForLoadState('load');
    const input = page.locator('#search-input');
    await input.fill(QUERY);

    const reportBtn = page.locator('.report-ranking-btn');
    await expect(reportBtn).toBeVisible({ timeout: 8000 });
    await reportBtn.click();

    const chooser = page.locator('.report-chooser-dialog');
    await expect(chooser).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0, { timeout: 2000 });

    // Button never went into the staged flow.
    await expect(reportBtn).toHaveText('Report');
  });
});
