import { test, expect } from './fixtures/extension';

/**
 * Semantic toolbar chip — prerequisite-gated chip behaviour.
 *
 * The Semantic chip (`embeddingsEnabled`) is opt-in and declares
 * `requires: 'ollamaEnabled'`, because semantic scoring is backed by Ollama
 * embeddings. When Ollama is OFF the chip must render disabled, and clicking
 * it must be a no-op that surfaces a toast — never a silent setting flip
 * that would persist an unreachable configuration.
 *
 * These tests exercise the full wiring end-to-end:
 *   1. Seed `toolbarToggles` to include both `ollamaEnabled` and
 *      `embeddingsEnabled` (the Semantic chip is opt-in, so we have to add
 *      it explicitly — mirrors what the user would do via Settings).
 *   2. Open the popup and check the rendered chip markup + classes.
 *   3. Click-and-assert-no-op, then flip `ollamaEnabled` and assert the
 *      click now toggles `embeddingsEnabled`.
 */

const SETTINGS_KEY = 'smrutiCortexSettings';

interface SeededSettings {
  toolbarToggles: string[];
  ollamaEnabled: boolean;
  embeddingsEnabled: boolean;
}

async function seedSettings(extensionContext: any, patch: SeededSettings): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async ({ key, patch: p }: { key: string; patch: SeededSettings }) => {
    const bag = await (globalThis as any).chrome.storage.local.get(key);
    const prev = bag?.[key] ?? {};
    await (globalThis as any).chrome.storage.local.set({
      [key]: { ...prev, ...p },
    });
  }, { key: SETTINGS_KEY, patch });
}

async function readSetting<T = unknown>(
  extensionContext: any,
  field: keyof SeededSettings,
): Promise<T | undefined> {
  const bg = extensionContext.serviceWorkers()[0];
  return bg.evaluate(async ({ key, field: f }: { key: string; field: string }) => {
    const bag = await (globalThis as any).chrome.storage.local.get(key);
    return bag?.[key]?.[f];
  }, { key: SETTINGS_KEY, field: field as string });
}

async function clearSettings(extensionContext: any): Promise<void> {
  const bg = extensionContext.serviceWorkers()[0];
  await bg.evaluate(async (key: string) => {
    await (globalThis as any).chrome.storage.local.remove(key);
  }, SETTINGS_KEY);
}

test.describe('Semantic toolbar chip', () => {
  test.afterEach(async ({ extensionContext }) => {
    await clearSettings(extensionContext);
  });

  test('renders in disabled state when Ollama is off', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: false,
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const chip = page.locator('.toggle-chip[data-toggle-key="embeddingsEnabled"]');
    await expect(chip).toBeAttached({ timeout: 5000 });

    // Wait for syncToggleBar() to run (it fires from SettingsManager.init()).
    await expect(chip).toHaveClass(/disabled/, { timeout: 5000 });
    // The chip should not also report as active when disabled.
    await expect(chip).not.toHaveClass(/\bactive\b/);

    const iconText = await chip.locator('.chip-icon').textContent();
    expect(iconText).toContain('🧠');

    const title = await chip.getAttribute('title');
    expect(title ?? '').toMatch(/ollama|AI/i);

    const aria = await chip.getAttribute('aria-disabled');
    expect(aria).toBe('true');
  });

  test('click while disabled is a no-op and surfaces a toast', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: false,
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const chip = page.locator('.toggle-chip[data-toggle-key="embeddingsEnabled"]');
    await expect(chip).toHaveClass(/disabled/, { timeout: 5000 });

    // Force the click — Playwright would otherwise refuse to click a
    // visually disabled element if we used { trial: true }. The chip is
    // a <button> with CSS `cursor: not-allowed`, not the HTML disabled
    // attribute, so a real user click must still reach our handler.
    await chip.click({ force: true });

    // Toast is a plain <div> appended to document.body with the disabled
    // copy. It lingers for ~5s so this poll has plenty of runway.
    const toast = page.locator('body > div', {
      hasText: /enable ai first/i,
    });
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Setting must not have flipped.
    const persisted = await readSetting<boolean>(extensionContext, 'embeddingsEnabled');
    expect(persisted ?? false).toBe(false);
  });

  test('enabling Ollama enables the chip and click toggles embeddings', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: false,
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const semChip = page.locator('.toggle-chip[data-toggle-key="embeddingsEnabled"]');
    await expect(semChip).toHaveClass(/disabled/, { timeout: 5000 });

    // Flip Ollama on via the AI chip — exercises the same SettingsManager
    // path as any other UI toggle, and proves applyPopupSettingSideEffects
    // syncs the Semantic chip's disabled state.
    const aiChip = page.locator('.toggle-chip[data-toggle-key="ollamaEnabled"]');
    await expect(aiChip).toBeAttached({ timeout: 5000 });
    await aiChip.click();

    // The Semantic chip loses its `disabled` class once Ollama is on.
    await expect(semChip).not.toHaveClass(/disabled/, { timeout: 5000 });
    const aria = await semChip.getAttribute('aria-disabled');
    expect(aria).toBe('false');

    // Click now actually toggles `embeddingsEnabled`.
    await semChip.click();
    await expect(semChip).toHaveClass(/active/, { timeout: 5000 });

    await expect.poll(
      async () => readSetting<boolean>(extensionContext, 'embeddingsEnabled'),
      { timeout: 3000, intervals: [100, 200, 400] },
    ).toBe(true);
  });
});
