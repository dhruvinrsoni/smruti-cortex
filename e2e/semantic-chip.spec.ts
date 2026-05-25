import { test, expect } from './fixtures/extension';

/**
 * Semantic toolbar chip — independent chip behaviour.
 *
 * The Semantic chip (`embeddingsEnabled`) and the AI chip (`ollamaEnabled`)
 * are fully independent. Each reflects and toggles only its own setting.
 * Semantic must never be disabled or blocked by AI chip state.
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

  test('renders as enabled regardless of Ollama state', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: false,      // AI off
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const chip = page.locator('.toggle-chip[data-toggle-key="embeddingsEnabled"]');
    await expect(chip).toBeAttached({ timeout: 5000 });

    // Semantic is independent — must NOT be disabled when AI is off
    await expect(chip).not.toHaveClass(/disabled/, { timeout: 5000 });

    const iconText = await chip.locator('.chip-icon').textContent();
    expect(iconText).toContain('🧠');

    // aria-disabled must be false (fully interactive)
    const aria = await chip.getAttribute('aria-disabled');
    expect(aria).toBe('false');
  });

  test('click toggles embeddingsEnabled even when Ollama is off', async ({
    extPage: page, extensionContext, extensionId,
  }) => {
    await seedSettings(extensionContext, {
      toolbarToggles: ['ollamaEnabled', 'embeddingsEnabled'],
      ollamaEnabled: false,      // AI off — must not block Semantic
      embeddingsEnabled: false,
    });

    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('load');

    const chip = page.locator('.toggle-chip[data-toggle-key="embeddingsEnabled"]');
    await expect(chip).not.toHaveClass(/disabled/, { timeout: 5000 });

    // Click must go through and flip the setting
    await chip.click();
    await expect(chip).toHaveClass(/active/, { timeout: 5000 });

    const persisted = await readSetting<boolean>(extensionContext, 'embeddingsEnabled');
    expect(persisted).toBe(true);
  });

  test('chip state tracks embeddingsEnabled independently of ollamaEnabled', async ({
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
    const aiChip  = page.locator('.toggle-chip[data-toggle-key="ollamaEnabled"]');
    await expect(semChip).toBeAttached({ timeout: 5000 });

    // Both chips start inactive and enabled (not disabled)
    await expect(semChip).not.toHaveClass(/disabled/, { timeout: 3000 });
    await expect(semChip).not.toHaveClass(/active/);

    // Toggle Semantic ON — AI stays off
    await semChip.click();
    await expect(semChip).toHaveClass(/active/, { timeout: 3000 });
    await expect(aiChip).not.toHaveClass(/active/);

    // Toggle AI ON — Semantic must remain active (independent)
    await aiChip.click();
    await expect(aiChip).toHaveClass(/active/, { timeout: 3000 });
    await expect(semChip).toHaveClass(/active/);

    // Toggle Semantic OFF — AI must remain active (independent)
    await semChip.click();
    await expect(semChip).not.toHaveClass(/active/, { timeout: 3000 });
    await expect(aiChip).toHaveClass(/active/);

    // Final persisted state: semantic OFF, AI ON
    await expect.poll(
      async () => readSetting<boolean>(extensionContext, 'embeddingsEnabled'),
      { timeout: 3000, intervals: [100, 200, 400] },
    ).toBe(false);
    await expect.poll(
      async () => readSetting<boolean>(extensionContext, 'ollamaEnabled'),
      { timeout: 3000, intervals: [100, 200, 400] },
    ).toBe(true);
  });
});
