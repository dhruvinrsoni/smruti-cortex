import { test, expect } from './fixtures/extension';

async function sendToServiceWorker(page: any, message: Record<string, unknown>): Promise<any> {
  return page.evaluate(async (msg: Record<string, unknown>) => {
    return new Promise((resolve) => {
      (window as any).chrome.runtime.sendMessage(msg, (r: unknown) => resolve(r));
    });
  }, message);
}

/**
 * Seed history by visiting real sites so the index has data for keyboard tests.
 * Only runs once per worker (extensionContext is worker-scoped).
 */
async function ensureIndexHasData(
  extensionContext: any,
  extensionId: string,
): Promise<boolean> {
  const sites = ['https://github.com', 'https://en.wikipedia.org', 'https://www.google.com'];
  for (const url of sites) {
    const p = await extensionContext.newPage();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await p.waitForTimeout(600);
    await p.close();
  }

  const popup = await extensionContext.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForLoadState('load');
  await sendToServiceWorker(popup, { type: 'REBUILD_INDEX' });

  const check = await sendToServiceWorker(popup, { type: 'SEARCH_QUERY', query: 'google' });
  await popup.close();
  return (check?.results?.length ?? 0) > 0;
}

let indexReady: boolean | null = null;

test.describe('Keyboard > Input', () => {
  test('Esc clears input text', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const input = page.locator('#search-input');
    await input.fill('test query');
    await expect(input).toHaveValue('test query');

    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('');
  });

  test('Esc on empty input does not crash', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const input = page.locator('#search-input');
    await expect(input).toHaveValue('');

    await page.keyboard.press('Escape');
    // Input should remain empty and page should still be functional
    await expect(input).toHaveValue('');
    await expect(input).toBeVisible();
  });
});

test.describe('Keyboard > Results Navigation', () => {
  test('ArrowDown moves focus to first result', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    if (indexReady === null) indexReady = await ensureIndexHasData(extensionContext, extensionId);
    if (!indexReady) { test.skip(); return; }

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    await input.fill('google');

    const results = page.locator('#results li');
    await expect(results.first()).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('ArrowDown');

    // First result should get the .active class
    await expect(results.first()).toHaveClass(/active/, { timeout: 2000 });
  });

  test('ArrowUp from first result returns focus to input', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    if (indexReady === null) indexReady = await ensureIndexHasData(extensionContext, extensionId);
    if (!indexReady) { test.skip(); return; }

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    await input.fill('google');

    const results = page.locator('#results li');
    await expect(results.first()).toBeVisible({ timeout: 5000 });

    // Move down to first result, then back up
    await page.keyboard.press('ArrowDown');
    await expect(results.first()).toHaveClass(/active/, { timeout: 2000 });

    await page.keyboard.press('ArrowUp');

    // Input should regain focus
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('search-input');
  });

  test('Esc from results clears input and returns focus', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    if (indexReady === null) indexReady = await ensureIndexHasData(extensionContext, extensionId);
    if (!indexReady) { test.skip(); return; }

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    await input.fill('google');

    const results = page.locator('#results li');
    await expect(results.first()).toBeVisible({ timeout: 5000 });

    // Navigate to a result
    await page.keyboard.press('ArrowDown');
    await expect(results.first()).toHaveClass(/active/, { timeout: 2000 });

    // Escape should clear the query and return focus to input
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('');

    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('search-input');
  });
});
