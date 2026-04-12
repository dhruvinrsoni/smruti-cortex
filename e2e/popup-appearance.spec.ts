import { test, expect } from './fixtures/extension';

/**
 * Click a radio input inside the settings modal via evaluate.
 * The popup has a fixed viewport and segmented-control radio buttons
 * may be outside the viewport — standard Playwright click fails.
 */
async function clickRadio(page: any, selector: string): Promise<void> {
  await page.evaluate((sel: string) => {
    const radio = document.querySelector(sel) as HTMLInputElement;
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, selector);
}

test.describe('Appearance > Theme', () => {
  test('switching to dark theme sets data-theme attribute', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    await page.locator('#settings-button').click();
    await clickRadio(page, 'input[name="modal-theme"][value="dark"]');

    const dataTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(dataTheme).toBe('dark');
  });

  test('switching to light then auto removes data-theme', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    await page.locator('#settings-button').click();

    await clickRadio(page, 'input[name="modal-theme"][value="dark"]');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');

    await clickRadio(page, 'input[name="modal-theme"][value="auto"]');
    const dataTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(dataTheme).toBeNull();
  });
});

test.describe('Appearance > Display Mode', () => {
  test('switching to cards mode changes results class', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const results = page.locator('#results');
    await expect(results).toHaveClass(/list/);

    await page.locator('#settings-button').click();
    await clickRadio(page, 'input[name="modal-displayMode"][value="cards"]');
    await page.locator('#settings-close').click();

    await expect(results).toHaveClass(/cards/);

    // Revert to list
    await page.locator('#settings-button').click();
    await clickRadio(page, 'input[name="modal-displayMode"][value="list"]');
    await page.locator('#settings-close').click();

    await expect(results).toHaveClass(/list/);
  });
});
