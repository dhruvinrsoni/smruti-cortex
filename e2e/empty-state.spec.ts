import { test, expect } from './fixtures/extension';

test.describe('Empty State', () => {
  test('shows recent sections when interactions exist', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    // Seed a recent interaction via the service worker so the popup
    // has something to display in the "Recently Visited" section
    const bg = extensionContext.serviceWorkers()[0];
    await bg.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.set({
        recentInteractions: [
          { url: 'https://example.com', title: 'Example', timestamp: Date.now(), action: 'click' },
        ],
      });
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    // Wait for recent sections container to render
    const recentContainer = page.locator('#recent-sections-container');
    await expect(recentContainer).toBeAttached({ timeout: 5000 });

    // Wait until at least one section has rendered, then assert it is exactly
    // one — two concurrent loadRecentHistory() calls used to produce 2x.
    const sections = recentContainer.locator('.recent-searches-section');
    await expect(sections).toHaveCount(1, { timeout: 5000 });
  });

  test('does not duplicate recent sections on popup open', async ({
    extPage: page, extensionId, extensionContext,
  }) => {
    // Seed BOTH stores so every caller of loadRecentHistory() must append
    // one Recent Searches section AND one Recently Visited section.
    // A startup race between the module-init call and the window.load
    // retry used to produce two of each.
    const bg = extensionContext.serviceWorkers()[0];
    await bg.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.set({
        recentInteractions: [
          { url: 'https://a.com', title: 'A', timestamp: Date.now(), action: 'click' },
        ],
        recentSearches: [
          { query: 'hello', timestamp: Date.now() },
        ],
      });
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const container = page.locator('#recent-sections-container');
    await expect(container).toBeAttached({ timeout: 5000 });

    // Exactly two sections total (one of each kind) — not four.
    await expect(container.locator('.recent-searches-section')).toHaveCount(2, { timeout: 5000 });

    const titles = await container.locator('.recent-searches-title').allTextContents();
    expect(titles.filter(t => t.includes('Recent Searches'))).toHaveLength(1);
    expect(titles.filter(t => t.includes('Recently Visited'))).toHaveLength(1);
  });

  test('search input is empty and focused on open', async ({
    extPage: page, extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const input = page.locator('#search-input');
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('autofocus', '');
  });
});
