import { describe, it, expect } from 'vitest';
import { getWelcomePageModel } from '../welcome-content';
import { SEARCH_ENGINE_PREFIXES } from '../../shared/web-search';

describe('welcome-content', () => {
  it('produces every top-level section', () => {
    const m = getWelcomePageModel();
    expect(m.hero.title).toMatch(/SmrutiCortex/);
    expect(m.openWays.ways.length).toBeGreaterThanOrEqual(3);
    expect(m.privacy.lines.length).toBeGreaterThan(0);
    expect(m.cheatsheet.length).toBeGreaterThan(0);
    expect(m.footer.onlineGuideUrl).toMatch(/^https:\/\//);
  });

  it('teaches the core Ctrl+Shift+S loop in the big tip', () => {
    const m = getWelcomePageModel();
    expect(m.bigTip.keys.replace(/\s/g, '')).toBe('Ctrl+Shift+S');
  });

  it('derives the web-search section from web-search.ts (no hand-maintained list)', () => {
    const web = getWelcomePageModel().cheatsheet.find((s) => s.id === 'web');
    expect(web).toBeDefined();
    const keys = web!.entries.map((e) => e.keys);
    for (const prefix of Object.keys(SEARCH_ENGINE_PREFIXES)) {
      expect(keys).toContain(`?? ${prefix}`);
    }
  });

  it('reflects disabled palette modes when enabledModes is provided', () => {
    const palette = getWelcomePageModel(['/', '#']).cheatsheet.find((s) => s.id === 'palette')!;
    const byKeys = Object.fromEntries(palette.entries.map((e) => [e.keys, e.enabled]));
    expect(byKeys['/']).toBe(true);
    expect(byKeys['#']).toBe(true);
    expect(byKeys['@']).toBe(false);
    expect(byKeys['?']).toBe(true); // help always on
  });

  it('includes the omnibox sc shortcut and the keyboard-shortcut section', () => {
    const m = getWelcomePageModel();
    expect(m.cheatsheet.find((s) => s.id === 'omnibox')).toBeDefined();
    const shortcuts = m.cheatsheet.find((s) => s.id === 'shortcuts')!;
    expect(shortcuts.entries.some((e) => e.keys === 'Ctrl+Shift+S')).toBe(true);
  });
});
