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

    const sections = recentContainer.locator('.recent-searches-section');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(1);
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
