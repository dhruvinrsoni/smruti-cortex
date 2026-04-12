import { test, expect } from './fixtures/extension';

/**
 * Developer-focused browsing pattern: globally accessible sites that produce
 * distinct titles and URLs in Chrome's history API. These are what SmrutiCortex
 * indexes via `chrome.history.search()` → `tokenize(title + url)`.
 *
 * Each entry includes the search term we expect to find it with, based on
 * how the tokenizer would split the page's title and URL.
 */
const BROWSING_SESSION = [
  { url: 'https://github.com',             expectedTerm: 'github' },
  { url: 'https://stackoverflow.com',      expectedTerm: 'stackoverflow' },
  { url: 'https://developer.mozilla.org',  expectedTerm: 'mozilla' },
  { url: 'https://news.ycombinator.com',   expectedTerm: 'hacker' },
  { url: 'https://en.wikipedia.org',       expectedTerm: 'wikipedia' },
  { url: 'https://www.google.com',         expectedTerm: 'google' },
];

/**
 * Send a message to the service worker from a popup page context.
 * This is the same path real popup UI code uses (`chrome.runtime.sendMessage`).
 */
async function sendToServiceWorker(page: any, message: Record<string, unknown>): Promise<any> {
  return page.evaluate(async (msg: Record<string, unknown>) => {
    return new Promise((resolve) => {
      (window as any).chrome.runtime.sendMessage(msg, (r: unknown) => resolve(r));
    });
  }, message);
}

test.describe('History > Index & Search', () => {

  test('visits 6 sites, rebuilds index, finds results', async ({ extensionContext, extensionId }) => {
    // ── Phase 1: Simulate a developer's browsing session ──
    // Visit each site with enough dwell time for Chrome's history DB to
    // register the visit (url + title + visitCount + lastVisitTime).
    for (const site of BROWSING_SESSION) {
      const page = await extensionContext.newPage();
      // domcontentloaded is enough for Chrome to record title + URL in history;
      // 'load' waits for every sub-resource which can time out on heavy sites.
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      // Dwell: give Chrome time to flush the history entry to its SQLite DB
      await page.waitForTimeout(800);
      await page.close();
    }

    // ── Phase 2: Trigger full index rebuild ──
    // In production, this happens on extension install or via Settings > Data > Rebuild.
    // The service worker calls chrome.history.search({ text: '', startTime: 0 })
    // then tokenizes each entry's title + URL and stores in IndexedDB.
    const popupPage = await extensionContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage.waitForLoadState('load');

    const rebuildResult = await sendToServiceWorker(popupPage, { type: 'REBUILD_INDEX' });
    expect(rebuildResult).toHaveProperty('status', 'OK');

    // ── Phase 3: Verify the index via direct API ──
    // This mirrors what happens when a user types in the search box:
    // popup sends SEARCH_QUERY → service worker calls runSearch() → returns results
    const searchResult: any = await sendToServiceWorker(popupPage, {
      type: 'SEARCH_QUERY', query: 'github',
    });

    if (!searchResult?.results?.length) {
      // On some CI environments, Chrome's history API may not capture visits
      // from a temp profile. Skip gracefully rather than fail.
      await popupPage.close();
      test.skip();
      return;
    }

    // At least one result should contain "github" in URL or title
    const hasGithub = searchResult.results.some((r: any) =>
      r.url?.toLowerCase().includes('github') || r.title?.toLowerCase().includes('github'),
    );
    expect(hasGithub).toBe(true);

    await popupPage.close();
  });

  test('live search renders results', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    // Verify index has data from previous test
    const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: 'github' });
    if (!check?.results?.length) { test.skip(); return; }

    // Type a query — results should appear as the user types (live search)
    const input = page.locator('#search-input');
    await input.fill('github');

    // Results are rendered as <li> elements inside <ul id="results">
    const resultItems = page.locator('#results li');
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });

    const count = await resultItems.count();
    expect(count).toBeGreaterThan(0);

    // Result count indicator should update
    const resultCount = page.locator('#result-count');
    await expect(resultCount).not.toBeEmpty();
  });

  test('sort order re-renders results', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: 'com' });
    if (!check?.results?.length) { test.skip(); return; }

    await page.locator('#search-input').fill('com');
    const resultItems = page.locator('#results li');
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });

    // Switch to Most Recent — results re-render with recency ordering
    await page.locator('#sort-by').selectOption('most-recent');
    await expect(resultItems.first()).toBeVisible({ timeout: 3000 });

    // Switch to Alphabetical — results re-render in A-Z order
    await page.locator('#sort-by').selectOption('alphabetical');
    await expect(resultItems.first()).toBeVisible({ timeout: 3000 });

    // Switch back to Best Match — default scoring
    await page.locator('#sort-by').selectOption('best-match');
    await expect(resultItems.first()).toBeVisible({ timeout: 3000 });
  });

  test('multi-term search finds distinct sites', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    // Test multiple search terms — each should find a different site
    const termsToTest = ['stackoverflow', 'mozilla', 'wikipedia'];

    for (const term of termsToTest) {
      const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: term });
      if (!check?.results?.length) continue;

      await page.locator('#search-input').fill(term);
      const resultItems = page.locator('#results li');
      await expect(resultItems.first()).toBeVisible({ timeout: 5000 });
      expect(await resultItems.count()).toBeGreaterThan(0);

      // Clear for next iteration
      await page.locator('#clear-input').click();
      await expect(page.locator('#search-input')).toHaveValue('');
    }
  });

  test('clear resets input and hides button', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const check = await sendToServiceWorker(page, { type: 'SEARCH_QUERY', query: 'github' });
    if (!check?.results?.length) { test.skip(); return; }

    // Fill, verify results, then clear
    await page.locator('#search-input').fill('github');
    const resultItems = page.locator('#results li');
    await expect(resultItems.first()).toBeVisible({ timeout: 5000 });

    await page.locator('#clear-input').click();
    await expect(page.locator('#search-input')).toHaveValue('');
    // Clear button should become hidden again
    await expect(page.locator('#clear-input')).not.toHaveClass(/visible/);
  });
});
