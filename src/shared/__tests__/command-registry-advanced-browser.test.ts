/**
 * Command registry — advanced browser commands availability and metadata
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_COMMANDS,
  getAvailableCommands,
  matchCommands,
} from '../command-registry';
import type { AppSettings } from '../../core/settings';
import { DisplayMode } from '../../core/settings';

const baseSettings: AppSettings = {
  displayMode: DisplayMode.LIST,
  logLevel: 2,
  highlightMatches: true,
};

function settingsWithAdvanced(on: boolean): AppSettings {
  return { ...baseSettings, advancedBrowserCommands: on };
}

const ADVANCED_IDS = new Set([
  'close-other-tabs',
  'close-tabs-right',
  'close-tabs-left',
  'discard-tab',
  'discard-other-tabs',
  'move-tab-new-window',
  'merge-windows',
  'close-duplicates',
  'sort-tabs',
  'scroll-to-top',
  'scroll-to-bottom',
  'unpin-tab',
  'unmute-tab',
  'close-all-tabs',
  'group-tab',
  'ungroup-tab',
  'collapse-groups',
  'expand-groups',
  'name-group',
  'color-group',
  'close-group',
  'ungroup-all',
  'clear-cache',
  'clear-cookies',
  'clear-local-storage',
  'clear-downloads-history',
  'clear-form-data',
  'clear-passwords',
  'clear-last-hour',
  'clear-last-day',
  'password-manager',
  'site-settings',
  'privacy-settings',
  'search-settings',
  'clear-browser-data',
  'about-chrome',
  'appearance-settings',
  'autofill-settings',
  'top-sites',
]);

describe('command-registry advanced browser commands', () => {
  it('excludes advanced commands when advancedBrowserCommands is false', () => {
    const s = settingsWithAdvanced(false);
    const everyday = getAvailableCommands('everyday', s);
    const power = getAvailableCommands('power', s);
    const ids = new Set([...everyday, ...power].map(c => c.id));
    for (const id of ADVANCED_IDS) {
      expect(ids.has(id)).toBe(false);
    }
  });

  it('includes all advanced commands when advancedBrowserCommands is true', () => {
    const s = settingsWithAdvanced(true);
    const everyday = getAvailableCommands('everyday', s);
    const power = getAvailableCommands('power', s);
    const ids = new Set([...everyday, ...power].map(c => c.id));
    for (const id of ADVANCED_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('color-group expands to nine sub-commands with COLOR_GROUP messageType', () => {
    const s = settingsWithAdvanced(true);
    const power = getAvailableCommands('power', s);
    const colorParent = power.find(c => c.id === 'color-group');
    expect(colorParent?.action).toBe('sub-command');
    expect(colorParent?.subCommands?.length).toBe(9);
    for (const sub of colorParent?.subCommands ?? []) {
      expect(sub.messageType).toBe('COLOR_GROUP');
      expect(sub.id.startsWith('color-group-')).toBe(true);
    }
  });

  it('matchCommands filters advanced entries when setting is off', () => {
    const off = settingsWithAdvanced(false);
    const matches = matchCommands('close other', ALL_COMMANDS, off);
    expect(matches.some(c => c.id === 'close-other-tabs')).toBe(false);
  });

  it('matchCommands can find close-other-tabs when setting is on', () => {
    const on = settingsWithAdvanced(true);
    const matches = matchCommands('close other', ALL_COMMANDS, on);
    expect(matches.some(c => c.id === 'close-other-tabs')).toBe(true);
  });

  it('dangerous browsing-data commands are marked dangerous', () => {
    const s = settingsWithAdvanced(true);
    const power = getAvailableCommands('power', s);
    const dangerousIds = ['clear-cookies', 'clear-last-hour', 'close-all-tabs', 'close-group'];
    for (const id of dangerousIds) {
      const cmd = power.find(c => c.id === id);
      expect(cmd?.dangerous).toBe(true);
    }
  });
});
