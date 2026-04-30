/**
 * popup-utils.ts — Pure logic extracted from popup.ts for testability.
 *
 * All functions here are pure or near-pure: they take inputs and return outputs
 * without touching DOM, Chrome APIs, or module-level state.
 */

export type PopupPaletteMode = 'history' | 'commands' | 'power' | 'tabs' | 'bookmarks' | 'websearch' | 'help';

export interface DetectModeResult {
  mode: PopupPaletteMode;
  query: string;
}

export interface DetectModeSettings {
  commandPaletteEnabled: boolean;
  commandPaletteInPopup: boolean;
  commandPaletteModes: string[];
}

/**
 * Determine which palette mode the current input value maps to.
 * Pure function — no side effects.
 */
export function detectPopupMode(value: string, settings: DetectModeSettings): DetectModeResult {
  const { commandPaletteEnabled, commandPaletteInPopup, commandPaletteModes } = settings;

  if (!commandPaletteEnabled || !commandPaletteInPopup || !value) {
    return { mode: 'history', query: value };
  }
  if (value === '?') {
    return { mode: 'help', query: '' };
  }
  if (value.startsWith('??') && commandPaletteModes.includes('??')) {
    return { mode: 'websearch', query: value.slice(2).trim() };
  }

  const prefixMap: Record<string, PopupPaletteMode> = {
    '/': 'commands',
    '>': 'power',
    '@': 'tabs',
    '#': 'bookmarks',
  };
  const first = value[0];
  if (prefixMap[first] && commandPaletteModes.includes(first)) {
    return { mode: prefixMap[first], query: value.slice(1).trim() };
  }

  return { mode: 'history', query: value };
}

/** Format a byte count into a human-readable string (B / KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) { return `${(bytes / 1_048_576).toFixed(1)} MB`; }
  if (bytes >= 1_024) { return `${Math.round(bytes / 1_024)} KB`; }
  return `${bytes} B`;
}

/** Format a model size (in bytes) for display (KB / MB / GB). */
export function formatModelSize(bytes: number): string {
  if (bytes >= 1e9) {return `${(bytes / 1e9).toFixed(1)} GB`;}
  if (bytes >= 1e6) {return `${(bytes / 1e6).toFixed(0)} MB`;}
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

/** Build a lookup map from model defaults to their hint strings. */
export function buildHintMap(defaults: Array<{ value: string; hint?: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of defaults) {
    if (!d.hint) {continue;}
    map.set(d.value, d.hint);
    map.set(d.value.split(':')[0], d.hint);
  }
  return map;
}

/** Shape of a MANUAL_INDEX response from the service worker. */
export interface ManualIndexResponse {
  status?: 'OK' | 'ERROR' | string;
  added?: number;
  updated?: number;
  total?: number;
  duration?: number;
  message?: string;
}

/**
 * Decide whether the popup should re-fetch its "Recent" list after a
 * MANUAL_INDEX round-trip. Pure policy function — no DOM, no Chrome APIs.
 *
 * Refresh only when the indexer reported success AND actually changed
 * something. A no-op index (`status === 'OK'` with `total === 0` and
 * `added === 0`) leaves IDB untouched, so re-running loadRecentHistory()
 * would just repaint the same rows the popup already shows.
 *
 * Bug history: before this helper, the click handler in popup.ts updated
 * feedback / quota / toast on success but never asked the popup to re-fetch
 * the Recent list. Operators clicked "Index Now", saw the success toast,
 * and wondered why the visible row order didn't budge. That was the
 * primary symptom behind the v9.2.x "Recent looks stale" reports.
 */
export function shouldRefreshRecentAfterManualIndex(resp: ManualIndexResponse | null | undefined): boolean {
  if (!resp || resp.status !== 'OK') {return false;}
  const added = typeof resp.added === 'number' ? resp.added : 0;
  const updated = typeof resp.updated === 'number' ? resp.updated : 0;
  const total = typeof resp.total === 'number' ? resp.total : 0;
  return added > 0 || updated > 0 || total > 0;
}
