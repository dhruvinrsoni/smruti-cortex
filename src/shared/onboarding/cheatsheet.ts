// cheatsheet.ts — the ONE data builder for "here's everything you can do".
//
// Pure, dependency-light, framework-free. Feeds three surfaces from a single source:
//   • the welcome page (Phase 2)
//   • the in-extension `?` help panel in quick-search + popup (Phase 5)
//   • (potential) docs
// Web-search engine rows are derived from src/shared/web-search.ts so there is no
// hand-maintained duplicate of the prefix list.

import { getWebSearchPrefixHintLines } from '../web-search';

/** A single "do this → get that" row. */
export interface CheatsheetEntry {
  /** The literal keys/prefix the user types, e.g. "Ctrl+Shift+S", "/", "?? g". */
  keys: string;
  /** Plain-language description of what it does. */
  label: string;
  /** True for advanced/opt-in capabilities we surface but de-emphasise. */
  advanced?: boolean;
  /** Reflects whether a configurable palette mode is currently turned on. */
  enabled?: boolean;
}

export interface CheatsheetSection {
  id: string;
  title: string;
  entries: CheatsheetEntry[];
}

/** Palette prefixes. The five configurable modes + the always-on `?` help. */
export const PALETTE_MODES: CheatsheetEntry[] = [
  { keys: '/', label: 'Commands — flip settings and run quick actions' },
  { keys: '@', label: 'Tabs — jump straight to any open tab' },
  { keys: '#', label: 'Bookmarks — search your bookmarks' },
  { keys: '??', label: 'Web — search Google, YouTube, GitHub and more' },
  { keys: '?', label: 'Help — show this cheatsheet' },
  { keys: '>', label: 'Power — advanced browser commands (opt-in)', advanced: true },
];

/** The configurable palette modes (mirror SETTINGS_SCHEMA.commandPaletteModes). `?` is always on. */
const CONFIGURABLE_MODES = ['/', '>', '@', '#', '??'];

/** Keyboard shortcuts, in the order most useful to learn. */
export const KEYBOARD_SHORTCUTS: CheatsheetEntry[] = [
  { keys: 'Ctrl+Shift+S', label: 'Open search on any page' },
  { keys: 'Enter', label: 'Open the highlighted result' },
  { keys: 'Shift+Enter', label: 'Open in a background tab' },
  { keys: '↑ / ↓', label: 'Move between results' },
  { keys: 'Esc', label: 'Clear the box / close the overlay' },
  { keys: 'Ctrl+C', label: 'Copy the result as a link' },
  { keys: 'Ctrl+M', label: 'Copy the result as Markdown' },
];

/**
 * Build the full cheatsheet as ordered sections.
 *
 * @param opts.enabledModes - when provided, configurable palette modes are marked
 *   enabled/disabled to match the user's settings. `?` help is always enabled.
 */
export function buildCheatsheetSections(opts: { enabledModes?: string[] } = {}): CheatsheetSection[] {
  const { enabledModes } = opts;

  const paletteEntries: CheatsheetEntry[] = PALETTE_MODES.map((entry) => {
    const configurable = CONFIGURABLE_MODES.includes(entry.keys);
    const enabled = enabledModes && configurable ? enabledModes.includes(entry.keys) : true;
    return { ...entry, enabled };
  });

  const webEntries: CheatsheetEntry[] = getWebSearchPrefixHintLines().map((line) => ({
    keys: `?? ${line.prefix}`,
    label: line.engineLabel,
  }));

  return [
    { id: 'palette', title: 'Type a prefix to switch modes', entries: paletteEntries },
    { id: 'web', title: 'Search the web fast', entries: webEntries },
    { id: 'shortcuts', title: 'Keyboard shortcuts', entries: KEYBOARD_SHORTCUTS },
    {
      id: 'omnibox',
      title: 'From the address bar',
      entries: [{ keys: 'sc ', label: 'Type "sc" then Space in the address bar, then your search' }],
    },
  ];
}
