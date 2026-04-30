import { test, expect } from './fixtures/extension';

/**
 * E2E coverage for the all-eight-pass A1+A2 wiring fix:
 *
 * Pre-fix, Ctrl+C / Ctrl+M / Enter on a focused row in command-palette
 * modes (`#`, `@`, `??`, `/`) silently no-op'd (or — worse — copied a
 * stale history row at the same index) because the copy/open handlers
 * read from `currentResults` / `resultsLocal` which palette modes never
 * populate.
 *
 * The fix has two halves:
 *
 *   1. Each palette row now stamps `data-url` / `data-title` (and where
 *      relevant `data-tabUrl`, `data-bookmarkUrl`) onto its `<li>`.
 *   2. A new pure resolver (`resolvePopupCopyTarget` /
 *      `resolvePaletteCopyTarget`) reads those attributes off the
 *      focused DOM row and tells the keyboard handler what to copy.
 *
 * Half (2) — the resolver — is exhaustively unit-tested:
 *   - src/popup/__tests__/popup-utils.test.ts
 *   - src/content_scripts/__tests__/quick-search-utils.test.ts
 *
 * What that unit coverage cannot prove is half (1): that the live popup
 * actually stamps the attributes the resolver expects. If the wiring
 * regresses (e.g. someone removes `li.dataset.url = ...` in a renderer)
 * unit tests stay green and Ctrl+C silently breaks again. This spec
 * locks the contract end-to-end.
 *
 * Quick-search overlay (closed Shadow DOM) is intentionally excluded:
 * piercing a closed shadow root from Playwright is brittle, and the
 * resolver's behaviour is identical to the popup's. The unit tests on
 * the quick-search resolver carry that surface.
 *
 * Clipboard round-trips are also out of scope here:
 *   - chrome-extension:// origins are reported as "opaque" by the
 *     CDP Browser.grantPermissions call, so we can't reliably grant
 *     clipboard-read in Playwright.
 *   - copyHtmlLinkToClipboard is unit-tested directly in
 *     src/shared/__tests__/search-ui-base.test.ts.
 */

const POPUP_URL = (extensionId: string): string =>
  `chrome-extension://${extensionId}/popup/popup.html`;

/**
 * commandPaletteInPopup defaults to FALSE (it's a power-user opt-in).
 * Without it, typing `??`, `#`, `@`, `/` in the popup input falls
 * through to plain history search and no palette rows render.
 *
 * The popup itself also handles a `?? ` prefix path for the websearch
 * mode but the prefix detection still gates on the same flag, so we
 * flip it on directly via the SW's chrome.storage.local once per
 * worker — and then send a SETTINGS_CHANGED message so the in-memory
 * SettingsManager cache picks it up immediately.
 */
const SETTINGS_STORAGE_KEY = 'smrutiCortexSettings';
let palettePopupEnabled = false;

async function ensurePalettePopupEnabled(extensionContext: any): Promise<void> {
  if (palettePopupEnabled) {return;}
  const sw = extensionContext.serviceWorkers()[0];
  if (!sw) {throw new Error('service worker not ready — cannot toggle palette setting');}

  await sw.evaluate(async (key: string) => {
    const current = await new Promise<Record<string, unknown>>((resolve) => {
      (globalThis as any).chrome.storage.local.get([key], (r: Record<string, unknown>) => resolve(r));
    });
    const merged = {
      ...((current[key] as Record<string, unknown>) ?? {}),
      commandPaletteEnabled: true,
      commandPaletteInPopup: true,
      commandPaletteModes: ['/', '>', '@', '#', '??'],
    };
    await new Promise<void>((resolve) => {
      (globalThis as any).chrome.storage.local.set({ [key]: merged }, () => resolve());
    });
    // Notify SW + any open pages so the in-memory cache refreshes.
    await new Promise<void>((resolve) => {
      (globalThis as any).chrome.runtime.sendMessage(
        { type: 'SETTINGS_CHANGED', settings: merged },
        () => resolve(),
      );
      setTimeout(resolve, 300);
    });
  }, SETTINGS_STORAGE_KEY);

  palettePopupEnabled = true;
}

test.describe('Palette row data attribute contract > Popup', () => {
  test('?? websearch mode: rendered row carries data-url + data-title', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    await ensurePalettePopupEnabled(extensionContext);
    await page.goto(POPUP_URL(extensionId));
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    // ?? <space> <terms> renders a single resolved-search row.
    await input.fill('?? smruticortex test');

    const row = page.locator('#results .palette-selectable-row').first();
    await expect(row).toBeVisible({ timeout: 5000 });

    // A2 contract: websearch row must carry data-url and data-title
    // so resolvePopupCopyTarget can copy it.
    const dataUrl = await row.getAttribute('data-url');
    expect(dataUrl).toBeTruthy();
    expect(dataUrl).toContain('smruticortex');

    const dataTitle = await row.getAttribute('data-title');
    expect(dataTitle).toBeTruthy();
    expect(dataTitle!).toContain('smruticortex');
  });

  test('# bookmarks mode: rendered rows carry data-url + data-bookmarkUrl', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    await ensurePalettePopupEnabled(extensionContext);
    // Seed a bookmark via the SW so this test never depends on the
    // persistent profile's pre-existing state. Idempotent — if the
    // bookmark already exists from a previous run we just reuse it.
    const sw = extensionContext.serviceWorkers()[0];
    if (!sw) {throw new Error('service worker not ready');}
    await sw.evaluate(async () => {
      const ch = (globalThis as any).chrome;
      const existing = await new Promise<any[]>((resolve) => {
        ch.bookmarks.search({ url: 'https://example.com/e2e-palette-fixture' }, (r: any[]) => resolve(r ?? []));
      });
      if (existing.length === 0) {
        await new Promise<void>((resolve) => {
          ch.bookmarks.create(
            { title: 'E2E Palette Fixture', url: 'https://example.com/e2e-palette-fixture' },
            () => resolve(),
          );
        });
      }
    });

    await page.goto(POPUP_URL(extensionId));
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    // Use a search term so the bookmark lookup is deterministic.
    await input.fill('# E2E Palette');
    await page.waitForTimeout(700);

    const rows = page.locator('#results .palette-selectable-row');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });

    // Find the row matching our seeded fixture so the assertion is
    // stable even when the profile has unrelated bookmarks.
    const wired = await rows.evaluateAll((els: Element[]) => {
      const found = els
        .map(el => (el as HTMLElement).dataset)
        .find(d => d.url === 'https://example.com/e2e-palette-fixture');
      return found
        ? { url: found.url ?? null, title: found.title ?? null, bookmarkUrl: found.bookmarkUrl ?? null }
        : null;
    });

    expect(wired, 'expected the seeded bookmark row to be rendered').toBeTruthy();
    expect(wired!.url).toBe('https://example.com/e2e-palette-fixture');
    expect(wired!.bookmarkUrl).toBe(wired!.url);
    expect(wired!.title).toBe('E2E Palette Fixture');
  });

  test('@ tabs mode: rendered rows carry data-url + data-tabUrl + data-title', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    await ensurePalettePopupEnabled(extensionContext);
    // Open one extra non-extension tab so @-mode definitely has rows
    // even on a fresh persistent context.
    const helper = await extensionContext.newPage();
    await helper.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15_000 })
      .catch(() => { /* fine — tab still exists */ });
    await helper.waitForTimeout(300);

    await page.goto(POPUP_URL(extensionId));
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    await input.fill('@');
    // Tabs are fetched from the SW asynchronously; allow time to settle.
    await page.waitForTimeout(800);

    const rows = page.locator('#results .palette-selectable-row');
    const rowCount = await rows.count();
    expect(rowCount, 'expected at least one tab row after typing @').toBeGreaterThan(0);

    const allUrls = await rows.evaluateAll((els: Element[]) =>
      els.map(el => {
        const html = el as HTMLElement;
        return {
          url: html.dataset.url || null,
          tabUrl: html.dataset.tabUrl || null,
          title: html.dataset.title || null,
        };
      }),
    );

    // Contract: at least one tab row must carry url + tabUrl + title.
    // (Some chrome:// internal tabs may have empty URLs, but the
    // helper-opened example.com tab guarantees we have at least one
    // fully-wired row.)
    const wired = allUrls.find(r => r.url && r.tabUrl && r.title);
    expect(
      wired,
      `expected at least one tab row with url+tabUrl+title; got ${JSON.stringify(allUrls)}`,
    ).toBeTruthy();
    // data-url should mirror data-tabUrl on tab rows.
    expect(wired!.url).toBe(wired!.tabUrl);

    await helper.close();
  });

  test('/ command mode: rendered rows do NOT carry data-url (action-only)', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    await ensurePalettePopupEnabled(extensionContext);
    // The most subtle bug in the pre-A2 code: a focused /command row
    // (which has no URL) silently fell through to resultsLocal[index]
    // and copied a stale history row. The resolver now detects palette
    // rows without data-url and returns null. The other half of that
    // contract is structural: command rows must NOT stamp data-url.
    await page.goto(POPUP_URL(extensionId));
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    await input.fill('/');
    await page.waitForTimeout(400);

    const rows = page.locator('#results .palette-selectable-row');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });

    // Sample several rows so we don't accidentally pass on a single
    // outlier. NONE of them should advertise data-url — they're all
    // action-only commands.
    const urlAttrs = await rows.evaluateAll((els: Element[]) =>
      els.slice(0, 10).map(el => (el as HTMLElement).dataset.url ?? null),
    );
    for (const u of urlAttrs) {
      expect(u, `command row unexpectedly stamped data-url=${u}`).toBeNull();
    }
  });
});
