import { describe, it, expect } from 'vitest';
import { buildCheatsheetSections, PALETTE_MODES, KEYBOARD_SHORTCUTS } from '../cheatsheet';
import { SEARCH_ENGINE_PREFIXES } from '../../web-search';

describe('buildCheatsheetSections', () => {
  it('returns palette, web, shortcuts and omnibox sections in order', () => {
    const sections = buildCheatsheetSections();
    expect(sections.map((s) => s.id)).toEqual(['palette', 'web', 'shortcuts', 'omnibox']);
  });

  it('includes every web-search prefix from web-search.ts (single source, no duplicate)', () => {
    const web = buildCheatsheetSections().find((s) => s.id === 'web');
    expect(web).toBeDefined();
    const keys = web!.entries.map((e) => e.keys);
    for (const prefix of Object.keys(SEARCH_ENGINE_PREFIXES)) {
      expect(keys).toContain(`?? ${prefix}`);
    }
  });

  it('marks all modes enabled when no enabledModes given', () => {
    const palette = buildCheatsheetSections().find((s) => s.id === 'palette')!;
    expect(palette.entries.every((e) => e.enabled === true)).toBe(true);
  });

  it('reflects enabledModes for configurable modes; ? help stays always-on', () => {
    const palette = buildCheatsheetSections({ enabledModes: ['/', '@'] }).find((s) => s.id === 'palette')!;
    const byKeys = Object.fromEntries(palette.entries.map((e) => [e.keys, e.enabled]));
    expect(byKeys['/']).toBe(true);
    expect(byKeys['@']).toBe(true);
    expect(byKeys['#']).toBe(false);
    expect(byKeys['??']).toBe(false);
    expect(byKeys['>']).toBe(false);
    expect(byKeys['?']).toBe(true); // help is not a configurable mode — always available
  });

  it('flags the > power mode as advanced', () => {
    const palette = buildCheatsheetSections().find((s) => s.id === 'palette')!;
    const power = palette.entries.find((e) => e.keys === '>')!;
    expect(power.advanced).toBe(true);
  });

  it('leads keyboard shortcuts with Ctrl+Shift+S and exposes the / palette mode', () => {
    expect(KEYBOARD_SHORTCUTS[0]!.keys).toBe('Ctrl+Shift+S');
    expect(PALETTE_MODES.some((m) => m.keys === '/')).toBe(true);
  });
});
