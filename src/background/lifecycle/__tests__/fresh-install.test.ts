import { describe, it, expect, vi } from 'vitest';
import { applyFreshInstallProfile, type SettingsWriter } from '../fresh-install';
import { FRESH_INSTALL_PROFILE } from '../../../core/fresh-install-profile';

function makeWriter(): SettingsWriter & {
  updateSettings: ReturnType<typeof vi.fn>;
  reloadFromStorage: ReturnType<typeof vi.fn>;
} {
  return {
    reloadFromStorage: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue(undefined),
  };
}

describe('applyFreshInstallProfile', () => {
  it('applies the profile exactly once on a fresh install', async () => {
    const writer = makeWriter();
    const applied = await applyFreshInstallProfile('install', writer);

    expect(applied).toBe(true);
    expect(writer.updateSettings).toHaveBeenCalledTimes(1);
    expect(writer.updateSettings).toHaveBeenCalledWith(FRESH_INSTALL_PROFILE);
  });

  it('reloads from storage BEFORE writing (so the profile never clobbers a concurrent write)', async () => {
    const order: string[] = [];
    const writer: SettingsWriter = {
      reloadFromStorage: vi.fn(async () => { order.push('reload'); }),
      updateSettings: vi.fn(async () => { order.push('write'); }),
    };

    await applyFreshInstallProfile('install', writer);

    expect(order).toEqual(['reload', 'write']);
  });

  it.each(['update', 'chrome_update', 'shared_module_update'] as const)(
    'does NOT touch settings on reason "%s" (existing users preserved)',
    async (reason) => {
      const writer = makeWriter();
      const applied = await applyFreshInstallProfile(reason, writer);

      expect(applied).toBe(false);
      expect(writer.updateSettings).not.toHaveBeenCalled();
    },
  );

  it('is non-fatal: returns false when the writer throws', async () => {
    const writer: SettingsWriter = {
      reloadFromStorage: vi.fn().mockResolvedValue(undefined),
      updateSettings: vi.fn().mockRejectedValue(new Error('storage down')),
    };
    const applied = await applyFreshInstallProfile('install', writer);

    expect(applied).toBe(false);
    expect(writer.updateSettings).toHaveBeenCalledTimes(1);
  });
});
