import { test, expect } from './fixtures/extension';

test.describe('Popup — page load', () => {
  test('renders brand, search input, and logo', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('.title')).toHaveText('SmrutiCortex');
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('.logo-icon')).toBeVisible();
    await expect(page.locator('.subtitle')).toBeVisible();
  });

  test('footer hints are visible', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#hints-container')).toBeVisible();
    await expect(page.locator('.footer-palette-modes')).toContainText('/ Commands');
    await expect(page.locator('.footer-palette-modes')).toContainText('> Power');
  });

  test('sort dropdown has all four options', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const options = page.locator('#sort-by option');
    await expect(options).toHaveCount(4);
    await expect(options.nth(0)).toHaveText('Best Match');
    await expect(options.nth(1)).toHaveText('Most Recent');
    await expect(options.nth(2)).toHaveText('Most Visited');
    await expect(options.nth(3)).toHaveText('Alphabetical');
  });

  test('tour help button is present', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#tour-button')).toBeVisible();
    await expect(page.locator('#tour-button')).toHaveAttribute('title', 'Feature Tour & Help');
  });
});

test.describe('Popup — search input', () => {
  test('accepts text and shows clear button', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const input = page.locator('#search-input');
    await input.fill('playwright test query');
    await expect(input).toHaveValue('playwright test query');
    await expect(page.locator('#clear-input')).toHaveClass(/visible/);
  });

  test('clear button resets the input', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const input = page.locator('#search-input');
    await input.fill('some query');
    await page.locator('#clear-input').click();
    await expect(input).toHaveValue('');
  });

  test('search input has autofocus', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#search-input')).toHaveAttribute('autofocus', '');
  });
});

test.describe('Popup — settings modal', () => {
  test('opens on settings button click', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const modal = page.locator('#settings-modal');
    await expect(modal).toHaveClass(/hidden/);

    await page.locator('#settings-button').click();
    await expect(modal).not.toHaveClass(/hidden/);
    await expect(modal.locator('.settings-header h2')).toHaveText('Settings');
  });

  test('closes via close button', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.locator('#settings-button').click();
    const modal = page.locator('#settings-modal');
    await expect(modal).not.toHaveClass(/hidden/);

    await page.locator('#settings-close').click();
    await expect(modal).toHaveClass(/hidden/);
  });

  test('has all 8 tab buttons', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();

    const tabs = page.locator('.settings-tab');
    await expect(tabs).toHaveCount(8);

    const tabNames = ['General', 'Search', 'AI', 'Privacy', 'Data', 'Toolbar', 'Command Palette', 'Advanced'];
    for (let i = 0; i < tabNames.length; i++) {
      await expect(tabs.nth(i)).toContainText(tabNames[i]);
    }
  });

  test('General tab is active by default', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();

    const generalTab = page.locator('.settings-tab[data-tab="general"]');
    await expect(generalTab).toHaveClass(/active/);
  });

  test('switching tabs updates active state', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();

    const aiTab = page.locator('.settings-tab[data-tab="ai"]');
    await aiTab.click();
    await expect(aiTab).toHaveClass(/active/);

    const generalTab = page.locator('.settings-tab[data-tab="general"]');
    await expect(generalTab).not.toHaveClass(/active/);
  });

  test('Advanced tab shows diagnostics buttons', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="advanced"]').click();

    await expect(page.locator('#show-performance-modal')).toBeVisible();
    await expect(page.locator('#export-diagnostics')).toBeVisible();
  });

  test('Data tab shows storage and management buttons', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="data"]').click();

    await expect(page.locator('#modal-rebuild')).toBeVisible();
    await expect(page.locator('#export-index-btn')).toBeVisible();
    await expect(page.locator('#import-index-btn')).toBeVisible();
  });
});

test.describe('Popup — performance modal', () => {
  test('opens from Advanced tab and shows metrics', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="advanced"]').click();
    await page.locator('#show-performance-modal').click();

    const perfModal = page.locator('#performance-modal');
    await expect(perfModal).not.toHaveClass(/hidden/);
    await expect(perfModal.locator('h2')).toContainText('Performance Monitor');
    await expect(page.locator('#perf-search-count')).toBeVisible();

    await page.locator('#performance-close').click();
    await expect(perfModal).toHaveClass(/hidden/);
  });
});
