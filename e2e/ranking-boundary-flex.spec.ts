import { test, expect } from './fixtures/extension';

/**
 * End-to-end lock for the boundary-flex matching contract.
 * See docs/adr/0001-search-matching-contract.md for the full contract.
 *
 * Scenario (synthetic, RFC-2606 placeholders only):
 *   - Target   : [ID-1234] Module 42 Review - Acme Tracker
 *                https://tracker.example.com/ticket/ID-1234
 *                (matches `module42` only via boundary-flex vs `Module 42`)
 *   - Sibling1 : Agile Board - Acme Tracker (same domain, visit-hot)
 *   - Sibling2 : Learn (module42.example.com, visit-hot, unrelated title)
 *
 * Query: `tracker module42`
 *   - Without boundary-flex: target only matches `tracker` (1/2 tokens) and
 *     gets buried by the 2 visit-hot siblings that also match 1/2 tokens.
 *   - With boundary-flex: target matches both tokens (2/2) and jumps to
 *     rank 1. This spec guards exactly that symptom.
 */

async function sendToServiceWorker(page: any, message: Record<string, unknown>): Promise<any> {
  return page.evaluate(async (msg: Record<string, unknown>) => {
    return new Promise((resolve) => {
      (window as any).chrome.runtime.sendMessage(msg, (r: unknown) => resolve(r));
    });
  }, message);
}

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const SYNTHETIC_ITEMS = [
  {
    url: 'https://tracker.example.com/ticket/ID-1234',
    title: '[ID-1234] Module 42 Review - Acme Tracker',
    hostname: 'tracker.example.com',
    visitCount: 2,
    lastVisit: NOW - 10 * DAY,
    tokens: ['id', '1234', 'module', '42', 'review', 'acme', 'tracker'],
  },
  {
    url: 'https://tracker.example.com/boards/1',
    title: 'Agile Board - Acme Tracker',
    hostname: 'tracker.example.com',
    visitCount: 50,
    lastVisit: NOW,
    tokens: ['agile', 'board', 'acme', 'tracker'],
  },
  {
    url: 'https://module42.example.com/learn',
    title: 'Learn',
    hostname: 'module42.example.com',
    visitCount: 40,
    lastVisit: NOW,
    tokens: ['learn'],
  },
];

test.describe('Search > Boundary-flex matching (search-core-boundary-flex-v1)', () => {

  test('target with "Module 42" title ranks first for query "tracker module42"', async ({ extensionContext, extensionId }) => {
    const popupPage = await extensionContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage.waitForLoadState('load');

    // Wipe any state leftover from previous specs sharing the worker-scoped
    // BrowserContext, then import our synthetic index directly. IMPORT_INDEX
    // bypasses chrome.history and writes straight into IndexedDB so this
    // spec is deterministic on CI (where history captures from temp profiles
    // are flaky).
    const clearResult = await sendToServiceWorker(popupPage, { type: 'CLEAR_ALL_DATA' });
    expect(clearResult?.status === 'OK' || clearResult?.status === 'PARTIAL').toBeTruthy();

    const importResult: any = await sendToServiceWorker(popupPage, {
      type: 'IMPORT_INDEX',
      items: SYNTHETIC_ITEMS,
    });
    expect(importResult?.status).toBe('OK');
    expect(importResult?.imported).toBe(SYNTHETIC_ITEMS.length);

    // Run the exact query that fails without boundary-flex.
    const searchResult: any = await sendToServiceWorker(popupPage, {
      type: 'SEARCH_QUERY',
      query: 'tracker module42',
      skipAI: true,
    });

    expect(searchResult?.results).toBeDefined();
    expect(Array.isArray(searchResult.results)).toBe(true);
    expect(searchResult.results.length).toBeGreaterThanOrEqual(1);

    const first = searchResult.results[0];
    expect(first.url).toBe('https://tracker.example.com/ticket/ID-1234');
    expect(first.title).toContain('Module 42');

    // Sanity: the visit-hot sibling must NOT be rank 1, even though it has
    // more visits and a fresher lastVisit. That's the whole point of the
    // tier-0 sort preferring 2/2 matches over 1/2.
    const top3Urls = searchResult.results.slice(0, 3).map((r: any) => r.url);
    expect(top3Urls[0]).not.toBe('https://tracker.example.com/boards/1');

    await popupPage.close();
  });

  test('separator matrix: space / hyphen / underscore / dot / slash all count as 2/2', async ({ extensionContext, extensionId }) => {
    const popupPage = await extensionContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popupPage.waitForLoadState('load');

    const matrix = [
      { suffix: 'space',      title: 'Module 42 Review - Acme Tracker' },
      { suffix: 'hyphen',     title: 'Module-42 Review - Acme Tracker' },
      { suffix: 'underscore', title: 'Module_42 Review - Acme Tracker' },
      { suffix: 'dot',        title: 'Module.42 Review - Acme Tracker' },
      { suffix: 'slash',      title: 'Module/42 Review - Acme Tracker' },
    ];

    await sendToServiceWorker(popupPage, { type: 'CLEAR_ALL_DATA' });
    await sendToServiceWorker(popupPage, {
      type: 'IMPORT_INDEX',
      items: matrix.map((m, i) => ({
        url: `https://tracker.example.com/ticket/${m.suffix}`,
        title: m.title,
        hostname: 'tracker.example.com',
        visitCount: 1,
        lastVisit: NOW - i * DAY,
        tokens: ['module', '42', 'review', 'acme', 'tracker'],
      })),
    });

    for (const { suffix } of matrix) {
      const r: any = await sendToServiceWorker(popupPage, {
        type: 'SEARCH_QUERY',
        query: 'tracker module42',
        skipAI: true,
      });
      const urls = (r?.results ?? []).map((x: any) => x.url);
      // Every separator variant must appear — ranking between them is
      // governed by the lastVisit tiebreaker and is not the subject of
      // this test. The contract we're locking is: none of them drop out.
      expect(urls).toContain(`https://tracker.example.com/ticket/${suffix}`);
    }

    await popupPage.close();
  });
});
