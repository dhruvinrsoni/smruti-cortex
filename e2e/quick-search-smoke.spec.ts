import { test, expect } from './fixtures/extension';

/**
 * Wait for the content script to be ready by polling with OPEN_INLINE_SEARCH.
 * Replaces the crude `waitForTimeout(1500)` with a smart retry — typically
 * resolves in 200-400ms instead of a fixed 1500ms wait.
 */
async function waitForContentScript(
  extensionContext: any,
  tabUrl = 'https://example.com/*',
): Promise<void> {
  const background = extensionContext.serviceWorkers()[0];
  await background.evaluate(async (url: string) => {
    const tabs = await (globalThis as any).chrome.tabs.query({ url });
    if (tabs.length === 0) throw new Error('no matching tabs');

    for (let attempt = 0; attempt < 15; attempt++) {
      const response: any = await new Promise((resolve) => {
        (globalThis as any).chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'OPEN_INLINE_SEARCH' },
          (r: unknown) => {
            if ((globalThis as any).chrome.runtime.lastError) resolve(null);
            else resolve(r);
          },
        );
      });
      if (response?.success) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('content script did not respond after 3s');
  }, tabUrl);
}

/**
 * Trigger OPEN_INLINE_SEARCH via the service worker (after content script is ready).
 */
async function triggerOverlay(extensionContext: any, tabUrl = 'https://example.com/*') {
  const background = extensionContext.serviceWorkers()[0];
  await background.evaluate(async (url: string) => {
    const tabs = await (globalThis as any).chrome.tabs.query({ url });
    if (tabs.length > 0) {
      await (globalThis as any).chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'OPEN_INLINE_SEARCH' },
      );
    }
  }, tabUrl);
}

test.describe('Quick-search — content script', () => {
  test('content script is reachable via service worker messaging', async ({ extPage: page, extensionContext }) => {
    await page.goto('https://example.com', { waitUntil: 'load' });
    await waitForContentScript(extensionContext);

    // Content script is confirmed ready — verify the response shape
    const background = extensionContext.serviceWorkers()[0];
    const result = await background.evaluate(async (tabUrl: string) => {
      const tabs = await (globalThis as any).chrome.tabs.query({ url: tabUrl });
      if (tabs.length === 0) return { error: 'no tabs' };
      return new Promise((resolve) => {
        (globalThis as any).chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'OPEN_INLINE_SEARCH' },
          (response: unknown) => resolve(response ?? { error: 'no response' }),
        );
      });
    }, 'https://example.com/*');

    expect(result).toHaveProperty('success', true);
  });
});

test.describe('Quick-search — overlay lifecycle', () => {
  test('overlay opens when triggered via service worker', async ({ extPage: page, extensionContext }) => {
    await page.goto('https://example.com', { waitUntil: 'load' });
    await waitForContentScript(extensionContext);

    const overlayHost = page.locator('#smruti-cortex-overlay');
    await expect(overlayHost).toBeAttached({ timeout: 5000 });
  });
});

test.describe('Service worker — health check', () => {
  test('service worker responds to PING via popup page', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const result = await page.evaluate(async () => {
      return new Promise((resolve) => {
        (window as any).chrome.runtime.sendMessage(
          { type: 'PING' },
          (response: unknown) => resolve(response),
        );
      });
    });

    expect(result).toHaveProperty('status', 'ok');
  });
});
