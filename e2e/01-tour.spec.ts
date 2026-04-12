import { test, expect } from './fixtures/extension';

test.describe('Tour', () => {
  test('completes all 6 steps via Next → Done', async ({
    extPage: page,
    extensionId,
    extensionContext,
  }) => {
    // Reset the tour flag so the popup thinks it's a fresh install
    const bg = extensionContext.serviceWorkers()[0];
    await bg.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.remove('tourCompleted');
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Tour auto-launches after 500ms — wait for the tooltip to appear
    const tooltip = page.locator('.tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    // Verify first step content (Search input)
    await expect(tooltip).toContainText('Search');
    await expect(tooltip).toContainText('1/6');

    // Step through all 6 tour steps: click Next for steps 1-5, then Done for step 6
    const nextBtn = page.locator('.tour-next');
    for (let step = 1; step <= 5; step++) {
      await expect(nextBtn).toBeVisible();
      await expect(nextBtn).toHaveText(step < 5 ? 'Next' : 'Next');
      await nextBtn.click();
      await expect(tooltip).toContainText(`${step + 1}/6`);
    }

    // Step 6 — final step, button says "Done"
    await expect(nextBtn).toHaveText('Done');
    await expect(tooltip).toContainText('Keyboard Shortcuts');
    await nextBtn.click();

    // Tour dismissed — tooltip, backdrop, and highlight should be gone
    await expect(tooltip).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.tour-backdrop')).not.toBeVisible();
    await expect(page.locator('.tour-highlight')).not.toBeVisible();

    // Verify tour was marked as completed in storage
    const completed = await bg.evaluate(async () => {
      const result = await (globalThis as any).chrome.storage.local.get('tourCompleted');
      return result.tourCompleted;
    });
    expect(completed).toBe(true);
  });

  test('skips via Skip button', async ({
    extPage: page,
    extensionId,
    extensionContext,
  }) => {
    const bg = extensionContext.serviceWorkers()[0];
    await bg.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.remove('tourCompleted');
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const tooltip = page.locator('.tour-tooltip');
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    // Click Skip
    await page.locator('.tour-skip').click();

    // Tour should be completely dismissed
    await expect(tooltip).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('.tour-backdrop')).not.toBeVisible();

    // Storage should still be marked as completed
    const completed = await bg.evaluate(async () => {
      const result = await (globalThis as any).chrome.storage.local.get('tourCompleted');
      return result.tourCompleted;
    });
    expect(completed).toBe(true);
  });

  test('does not relaunch when completed', async ({
    extPage: page,
    extensionId,
    extensionContext,
  }) => {
    // Ensure tour is marked as completed
    const bg = extensionContext.serviceWorkers()[0];
    await bg.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.set({ tourCompleted: true });
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Wait past the auto-launch delay (500ms) and verify tour never appears
    await page.waitForTimeout(1000);
    await expect(page.locator('.tour-tooltip')).not.toBeVisible();
    await expect(page.locator('.tour-backdrop')).not.toBeVisible();
  });
});
