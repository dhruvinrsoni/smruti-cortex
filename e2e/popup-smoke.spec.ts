import { test, expect } from './fixtures/extension';

test.describe('Popup > Layout', () => {
  test('shows brand, input, logo, subtitle', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('.title')).toHaveText('SmrutiCortex');
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('.logo-icon')).toBeVisible();
    await expect(page.locator('.subtitle')).toBeVisible();
  });

  test('shows footer hints', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#hints-container')).toBeVisible();
    await expect(page.locator('.footer-palette-modes')).toContainText('/ Commands');
    await expect(page.locator('.footer-palette-modes')).toContainText('> Power');
  });

  test('shows 4 sort options', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const options = page.locator('#sort-by option');
    await expect(options).toHaveCount(4);
    await expect(options.nth(0)).toHaveText('Best Match');
    await expect(options.nth(1)).toHaveText('Most Recent');
    await expect(options.nth(2)).toHaveText('Most Visited');
    await expect(options.nth(3)).toHaveText('Alphabetical');
  });

  test('shows tour button', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#tour-button')).toBeVisible();
    await expect(page.locator('#tour-button')).toHaveAttribute('title', 'Feature Tour & Help');
  });
});

test.describe('Popup > Search', () => {
  test('typing shows clear button', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const input = page.locator('#search-input');
    await input.fill('playwright test query');
    await expect(input).toHaveValue('playwright test query');
    await expect(page.locator('#clear-input')).toHaveClass(/visible/);
  });

  test('clear resets input', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const input = page.locator('#search-input');
    await input.fill('some query');
    await page.locator('#clear-input').click();
    await expect(input).toHaveValue('');
  });

  test('has autofocus', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(page.locator('#search-input')).toHaveAttribute('autofocus', '');
  });
});

test.describe('Popup > Settings', () => {
  test('opens on click', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    const modal = page.locator('#settings-modal');
    await expect(modal).toHaveClass(/hidden/);

    await page.locator('#settings-button').click();
    await expect(modal).not.toHaveClass(/hidden/);
    await expect(modal.locator('.settings-header h2')).toHaveText('Settings');
  });

  test('closes on X', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await page.locator('#settings-button').click();
    const modal = page.locator('#settings-modal');
    await expect(modal).not.toHaveClass(/hidden/);

    await page.locator('#settings-close').click();
    await expect(modal).toHaveClass(/hidden/);
  });

  test('renders 8 tabs', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();

    const tabs = page.locator('.settings-tab');
    await expect(tabs).toHaveCount(8);

    const tabNames = ['General', 'Search', 'AI', 'Privacy', 'Data', 'Toolbar', 'Command Palette', 'Advanced'];
    for (let i = 0; i < tabNames.length; i++) {
      await expect(tabs.nth(i)).toContainText(tabNames[i]);
    }
  });

  test('defaults to General tab', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();

    const generalTab = page.locator('.settings-tab[data-tab="general"]');
    await expect(generalTab).toHaveClass(/active/);
  });

  test('switches active tab', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();

    const aiTab = page.locator('.settings-tab[data-tab="ai"]');
    await aiTab.click();
    await expect(aiTab).toHaveClass(/active/);

    const generalTab = page.locator('.settings-tab[data-tab="general"]');
    await expect(generalTab).not.toHaveClass(/active/);
  });

  test('Advanced tab has diagnostics', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="advanced"]').click();

    await expect(page.locator('#show-performance-modal')).toBeVisible();
    await expect(page.locator('#export-diagnostics')).toBeVisible();
  });

  test('Data tab has rebuild/export/import', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="data"]').click();

    await expect(page.locator('#modal-rebuild')).toBeVisible();
    await expect(page.locator('#export-index-btn')).toBeVisible();
    await expect(page.locator('#import-index-btn')).toBeVisible();
  });

  test('Data tab shows storage and health status', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');
    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="data"]').click();

    await expect(page.locator('#storage-used')).toBeVisible();
    await expect(page.locator('#health-indicator')).toBeVisible();
    await expect(page.locator('#health-text')).toBeVisible();
  });
});

test.describe('Popup > Perf Modal', () => {
  test('opens, shows metrics, closes', async ({ extPage: page, extensionId }) => {
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

test.describe('Popup > Hash Routing', () => {
  test('#settings auto-opens settings modal', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html#settings`);
    await page.waitForLoadState('load');

    // Settings modal should be visible without clicking the settings button
    const modal = page.locator('#settings-modal');
    await expect(modal).not.toHaveClass(/hidden/, { timeout: 3000 });
    await expect(modal.locator('.settings-header h2')).toHaveText('Settings');
  });
});

test.describe('Popup > Data Actions', () => {
  test('Index Now shows feedback', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="data"]').click();

    const indexBtn = page.locator('#manual-index-btn');
    await expect(indexBtn).toBeVisible();

    await indexBtn.click();

    // Button text changes while indexing
    await expect(indexBtn).toContainText(/Indexing|Index Now/, { timeout: 10_000 });

    // Feedback element should show a result
    const feedback = page.locator('#manual-index-feedback');
    await expect(feedback).not.toBeEmpty({ timeout: 10_000 });
  });

  test('Rebuild Index triggers with confirm', async ({ extPage: page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    await page.locator('#settings-button').click();
    await page.locator('.settings-tab[data-tab="data"]').click();

    const rebuildBtn = page.locator('#modal-rebuild');
    await expect(rebuildBtn).toBeVisible();

    // Auto-accept the confirm dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await rebuildBtn.click();

    // Button text changes during rebuild
    await expect(rebuildBtn).toContainText(/Rebuilding|Rebuild Index/, { timeout: 15_000 });

    // After rebuild completes, button should revert to original text
    await expect(rebuildBtn).toContainText('Rebuild Index', { timeout: 15_000 });
  });
});
