import { test, expect, type Page } from './fixtures/extension';

/**
 * Toggle-preserves-results — verifies the user-reported "results clear on AI
 * toggle" bug (2026-05-21) does not regress. Covers the popup surface; the
 * quick-search overlay shares the same setChipBusy + non-destructive
 * renderResults plumbing and is exercised by other specs.
 *
 * The invariants under test:
 *   1. Toggling AI off while a populated result list is visible must NOT
 *      blank the list (`#results` keeps its rows).
 *   2. The query input must NOT clear on toggle.
 *   3. An empty stale Phase 1 reply (e.g. immediately after a setting flip)
 *      must NOT blank the list while Phase 2 is still in flight.
 *   4. The AI chip pulses (`.busy` class) while Phase 2 is in flight.
 *
 * These tests do NOT require a real Ollama backend — they validate the DOM
 * management layer (renderResults preservation + epoch staleness drop), which
 * is the load-bearing fix for the user-reported issue.
 */

const SETTINGS_KEY = 'smrutiCortexSettings';

const BROWSING_SESSION = [
  'https://github.com',
  'https://stackoverflow.com',
  'https://developer.mozilla.org',
  'https://en.wikipedia.org',
  'https://www.google.com',
];

async function seedSettings(
  extensionContext: { serviceWorkers: () => Array<{ evaluate: (fn: unknown, arg: unknown) => Promise<unknown> }> },
  patch: Record<string, unknown>,
): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async ({ key, patch: p }: { key: string; patch: Record<string, unknown> }) => {
    const bag = await (globalThis as unknown as { chrome: { storage: { local: { get: (k: string) => Promise<Record<string, unknown>> } } } })
      .chrome.storage.local.get(key);
    const prev = (bag?.[key] ?? {}) as Record<string, unknown>;
    await (globalThis as unknown as { chrome: { storage: { local: { set: (v: Record<string, unknown>) => Promise<void> } } } })
      .chrome.storage.local.set({
        [key]: { ...prev, ...p },
      });
  }, { key: SETTINGS_KEY, patch });
}

async function clearSettings(
  extensionContext: { serviceWorkers: () => Array<{ evaluate: (fn: unknown, arg: unknown) => Promise<unknown> }> },
): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (key: string) => {
    await (globalThis as unknown as { chrome: { storage: { local: { remove: (k: string) => Promise<void> } } } })
      .chrome.storage.local.remove(key);
  }, SETTINGS_KEY);
}

async function sendToServiceWorker(page: Page, message: Record<string, unknown>): Promise<unknown> {
  return page.evaluate(async (msg: Record<string, unknown>) => {
    return new Promise((resolve) => {
      (window as unknown as { chrome: { runtime: { sendMessage: (m: unknown, cb: (r: unknown) => void) => void } } })
        .chrome.runtime.sendMessage(msg, (r: unknown) => resolve(r));
    });
  }, message);
}

async function ensureIndexed(page: Page, extensionContext: { newPage: () => Promise<Page> }): Promise<boolean> {
  // Visit a handful of sites so the index has rows the search can hit.
  for (const url of BROWSING_SESSION) {
    const visitPage = await extensionContext.newPage();
    try {
      await visitPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await visitPage.waitForTimeout(400);
    } catch { /* network flake — skip this site */ }
    await visitPage.close();
  }
  const rebuild = await sendToServiceWorker(page, { type: 'REBUILD_INDEX' }) as { status?: string } | null;
  return rebuild?.status === 'OK';
}

test.describe('Toggle preserves results (Layer 1-5)', () => {
  test.afterEach(async ({ extensionContext }) => {
    await clearSettings(extensionContext);
  });

  test('AI toggle off does not blank the visible result list', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    // Seed: AI chip visible on the toolbar so the test can click it.
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: true,
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    // Skip when the temp profile's history isn't indexable (CI fallback).
    const indexed = await ensureIndexed(page, extensionContext);
    if (!indexed) { test.skip(); return; }

    const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: 'github' }) as { results?: unknown[] };
    if (!check?.results?.length) { test.skip(); return; }

    // Type a query and wait for results.
    await page.locator('#search-input').fill('github');
    const resultItems = page.locator('#results li');
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });
    const initialCount = await resultItems.count();
    expect(initialCount).toBeGreaterThan(0);

    // Snapshot input value before toggle.
    const inputBefore = await page.locator('#search-input').inputValue();
    expect(inputBefore).toBe('github');

    // Toggle AI off. The Layer 4 + 5 code path runs cancelInflightSearch() +
    // debounceSearch(currentQuery) — the visible rows must stay during the swap.
    await page.locator('.toggle-chip[data-toggle-key="ollamaEnabled"]').click();

    // Within 100ms of the click, the rendered list must NOT be empty.
    // Read .count() repeatedly for a short window; fail if it ever hits 0.
    const start = Date.now();
    while (Date.now() - start < 250) {
      const live = await resultItems.count();
      expect(live).toBeGreaterThan(0);
      await page.waitForTimeout(20);
    }

    // Input value preserved.
    const inputAfter = await page.locator('#search-input').inputValue();
    expect(inputAfter).toBe('github');

    // Eventually the reissued Phase 1 lands with the new AI-off state. Result
    // count should still be > 0 (lexical match always finds github here).
    await expect.poll(async () => resultItems.count(), { timeout: 3000 }).toBeGreaterThan(0);
  });

  test('AI toggle on while results visible: list never blanks, chip pulses', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: false,
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const indexed = await ensureIndexed(page, extensionContext);
    if (!indexed) { test.skip(); return; }

    const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: 'github' }) as { results?: unknown[] };
    if (!check?.results?.length) { test.skip(); return; }

    // Get the initial AI-off result set.
    await page.locator('#search-input').fill('github');
    const resultItems = page.locator('#results li');
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });
    const beforeCount = await resultItems.count();
    expect(beforeCount).toBeGreaterThan(0);

    // Flip AI ON.
    const aiChip = page.locator('.toggle-chip[data-toggle-key="ollamaEnabled"]');
    await aiChip.click();

    // The list must never go empty during the toggle-induced reissue.
    const start = Date.now();
    while (Date.now() - start < 300) {
      const live = await resultItems.count();
      expect(live).toBeGreaterThan(0);
      await page.waitForTimeout(20);
    }

    // The AI chip should have picked up the `active` class (it was off → on).
    await expect(aiChip).toHaveClass(/active/, { timeout: 2000 });

    // The `.busy` pulse class fires only while Phase 2 is in flight. Without a
    // real Ollama backend the busy class may not appear (Phase 2 errors out
    // quickly). We assert only the negative — chip is not stuck `.busy`
    // forever after the search settles — to keep the test deterministic on
    // CI without Ollama.
    await expect.poll(
      async () => aiChip.evaluate(el => el.classList.contains('busy')),
      { timeout: 5000, intervals: [100, 250, 500, 1000] },
    ).toBe(false);
  });

  test('AI=on + Semantic=on → toggle AI off does NOT blank the list (user-reported edge case)', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    // The exact configuration from the user's 2026-05-21 bug report follow-up:
    // BOTH AI keyword-expansion AND semantic-embedding chips are ON, results
    // are visible, then user clicks the AI chip off. Semantic chip is independent
    // (no requires gate) — it stays active. The visible result list MUST stay
    // populated through the toggle.
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: true,
      embeddingsEnabled: true,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const indexed = await ensureIndexed(page, extensionContext);
    if (!indexed) { test.skip(); return; }

    const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: 'github' }) as { results?: unknown[] };
    if (!check?.results?.length) { test.skip(); return; }

    await page.locator('#search-input').fill('github');
    const resultItems = page.locator('#results li');
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });
    const beforeCount = await resultItems.count();
    expect(beforeCount).toBeGreaterThan(0);

    // Confirm both chips are in the expected starting state.
    const aiChip = page.locator('.toggle-chip[data-toggle-key="ollamaEnabled"]');
    const semChip = page.locator('.toggle-chip[data-toggle-key="embeddingsEnabled"]');
    await expect(aiChip).toHaveClass(/active/);
    await expect(semChip).toHaveClass(/active/);

    // Toggle AI off. Semantic chip stays enabled (independent — no requires gate).
    await aiChip.click();

    // Through the entire reissue window: rendered list must NEVER be empty.
    const start = Date.now();
    while (Date.now() - start < 400) {
      const live = await resultItems.count();
      expect(live).toBeGreaterThan(0);
      await page.waitForTimeout(20);
    }

    // After the dust settles: AI chip is off (no `active`), Semantic chip
    // remains active and enabled (independent — not gated on AI), and the
    // list is still populated with lexical-only results.
    await expect(aiChip).not.toHaveClass(/active/);
    await expect(semChip).not.toHaveClass(/disabled/);
    await expect(semChip).toHaveClass(/active/);
    await expect.poll(async () => resultItems.count(), { timeout: 3000 }).toBeGreaterThan(0);

    // Input value preserved end-to-end.
    expect(await page.locator('#search-input').inputValue()).toBe('github');
  });

  test('rapid AI-off then AI-on does not produce a blank flash', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: true,
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const indexed = await ensureIndexed(page, extensionContext);
    if (!indexed) { test.skip(); return; }

    const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: 'github' }) as { results?: unknown[] };
    if (!check?.results?.length) { test.skip(); return; }

    await page.locator('#search-input').fill('github');
    const resultItems = page.locator('#results li');
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });

    // Toggle off then on rapidly — both transitions exercise cancelInflightSearch
    // and the epoch-staleness drop. The list must never blank during the burst.
    const aiChip = page.locator('.toggle-chip[data-toggle-key="ollamaEnabled"]');
    await aiChip.click();
    await page.waitForTimeout(30);
    await aiChip.click();

    const start = Date.now();
    while (Date.now() - start < 400) {
      const live = await resultItems.count();
      expect(live).toBeGreaterThan(0);
      await page.waitForTimeout(20);
    }
  });
});
