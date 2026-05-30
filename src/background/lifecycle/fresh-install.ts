// fresh-install.ts — applies FRESH_INSTALL_PROFILE exactly once, on a brand-new install.
//
// Kept tiny and dependency-injected so it is trivially unit-testable without the
// service-worker boot chain. See core/fresh-install-profile.ts for the policy.

import type { AppSettings } from '../../core/settings';
import { SettingsManager } from '../../core/settings';
import { FRESH_INSTALL_PROFILE } from '../../core/fresh-install-profile';
import { Logger, errorMeta } from '../../core/logger';

const log = Logger.forComponent('FreshInstall');

/** Minimal port: re-sync from storage, then persist a settings overlay. */
export interface SettingsWriter {
  reloadFromStorage(): Promise<void>;
  updateSettings(updates: Partial<AppSettings>): Promise<void>;
}

/**
 * Apply the opinionated fresh-install profile — but ONLY on a true first install.
 * Upgrades (reason 'update' / 'chrome_update' / 'shared_module_update') are left
 * untouched so existing users keep their chosen settings.
 *
 * @returns true if the profile was applied, false if skipped (not a fresh install).
 */
export async function applyFreshInstallProfile(
  reason: chrome.runtime.OnInstalledReason,
  writer: SettingsWriter = SettingsManager,
): Promise<boolean> {
  if (reason !== 'install') {
    return false; // upgrades & module updates: never touch existing settings
  }
  try {
    // Re-sync from storage first so the profile merges OVER the latest persisted
    // settings. This prevents the whole-object save in updateSettings from
    // clobbering a value another context wrote during startup (the profile only
    // overrides schema defaults — it never reverts a concurrently-persisted setting
    // that isn't part of the profile).
    await writer.reloadFromStorage();
    await writer.updateSettings(FRESH_INSTALL_PROFILE);
    log.info('applyFreshInstallProfile', '🎁 Fresh-install profile applied', {
      keys: Object.keys(FRESH_INSTALL_PROFILE).length,
    });
    return true;
  } catch (err) {
    // Non-fatal: a brand-new user simply falls back to the schema baseline defaults.
    log.warn('applyFreshInstallProfile', 'Failed to apply fresh-install profile', errorMeta(err));
    return false;
  }
}
