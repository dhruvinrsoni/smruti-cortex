/**
 * Command registry — core exports: tiers, matching, cycle helpers, recent commands, search URLs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ALL_COMMANDS,
  SEARCH_ENGINES,
  SEARCH_ENGINE_PREFIXES,
  getCommandsByTier,
  getAvailableCommands,
  matchCommands,
  getCycleValueFromCommand,
  getCurrentValueLabel,
  saveRecentCommand,
  getRecentCommands,
} from '../command-registry';
import type { AppSettings } from '../../core/settings';
import { DisplayMode } from '../../core/settings';

const base: AppSettings = {
  displayMode: DisplayMode.LIST,
  logLevel: 2,
  highlightMatches: true,
  advancedBrowserCommands: true,
  theme: 'auto',
  webSearchEngine: 'google',
};

describe('command-registry core', () => {
  it('SEARCH_ENGINES and SEARCH_ENGINE_PREFIXES stay aligned', () => {
    for (const [, engineKey] of Object.entries(SEARCH_ENGINE_PREFIXES)) {
      expect(SEARCH_ENGINES[engineKey]).toMatch(/^https?:\/\//);
    }
  });

  it('getCommandsByTier partitions ALL_COMMANDS', () => {
    const everyday = getCommandsByTier('everyday');
    const power = getCommandsByTier('power');
    expect(everyday.every(c => c.tier === 'everyday')).toBe(true);
    expect(power.every(c => c.tier === 'power')).toBe(true);
    expect(everyday.length + power.length).toBe(ALL_COMMANDS.length);
  });

  it('getAvailableCommands respects isAvailable', () => {
    const off: AppSettings = { ...base, advancedBrowserCommands: false };
    const on: AppSettings = { ...base, advancedBrowserCommands: true };
    const everydayOff = getAvailableCommands('everyday', off);
    const everydayOn = getAvailableCommands('everyday', on);
    expect(everydayOn.length).toBeGreaterThan(everydayOff.length);
    expect(everydayOff.some(c => c.id === 'close-other-tabs')).toBe(false);
    expect(everydayOn.some(c => c.id === 'close-other-tabs')).toBe(true);
  });

  it('matchCommands with empty query expands sub-commands', () => {
    const themeParent = ALL_COMMANDS.find(c => c.id === 'theme');
    expect(themeParent?.action).toBe('sub-command');
    if (!themeParent?.subCommands) { throw new Error('theme subCommands missing'); }
    const expanded = matchCommands('', [themeParent], base);
    expect(expanded.length).toBe(themeParent.subCommands.length);
    expect(expanded.every(c => c.id.startsWith('theme-'))).toBe(true);
  });

  it('matchCommands ranks alias match highly', () => {
    const matches = matchCommands('ai', ALL_COMMANDS, base);
    expect(matches[0]?.id).toBe('toggle-ai');
  });

  it('matchCommands matches multi-token query', () => {
    const matches = matchCommands('open settings', ALL_COMMANDS, base);
    expect(matches.some(c => c.id === 'settings')).toBe(true);
  });

  it('matchCommands without settings still scores', () => {
    const matches = matchCommands('bookmark', ALL_COMMANDS);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('getCycleValueFromCommand resolves theme-dark', () => {
    const sub = ALL_COMMANDS.flatMap(c => c.subCommands ?? []).find(s => s.id === 'theme-dark');
    expect(sub).toBeDefined();
    if (!sub) { throw new Error('theme-dark missing'); }
    expect(getCycleValueFromCommand(sub)).toBe('dark');
  });

  it('getCycleValueFromCommand returns undefined for non-sub-command', () => {
    const top = ALL_COMMANDS.find(c => c.id === 'settings');
    expect(top).toBeDefined();
    if (!top) { throw new Error('settings missing'); }
    expect(getCycleValueFromCommand(top)).toBeUndefined();
  });

  it('getCurrentValueLabel returns label for current theme setting', () => {
    const themeCmd = ALL_COMMANDS.find(c => c.id === 'theme');
    expect(themeCmd).toBeDefined();
    if (!themeCmd) { throw new Error('theme missing'); }
    expect(getCurrentValueLabel(themeCmd, { ...base, theme: 'dark' })).toBe('Dark');
    expect(getCurrentValueLabel(themeCmd, { ...base, theme: 'light' })).toBe('Light');
  });

  it('getCurrentValueLabel returns undefined without cycleValues', () => {
    const cmd = ALL_COMMANDS.find(c => c.id === 'settings');
    expect(cmd).toBeDefined();
    if (!cmd) { throw new Error('settings missing'); }
    expect(getCurrentValueLabel(cmd, base)).toBeUndefined();
  });
});

describe('command-registry recent commands (localStorage)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saveRecentCommand prepends and dedupes', () => {
    saveRecentCommand('a');
    saveRecentCommand('b');
    saveRecentCommand('a');
    expect(getRecentCommands()).toEqual(['a', 'b']);
  });

  it('getRecentCommands returns empty on bad JSON', () => {
    store['smruti_recent_commands'] = 'not-json';
    expect(getRecentCommands()).toEqual([]);
  });

  it('saveRecentCommand ignores localStorage errors', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    expect(() => saveRecentCommand('x')).not.toThrow();
  });
});
