/**
 * quick-search-utils.ts — Pure logic extracted from quick-search.ts for testability.
 *
 * All functions here are pure: they take inputs and return outputs
 * without touching DOM, Chrome APIs, or module-level state.
 */

export type PaletteMode = 'history' | 'commands' | 'power' | 'tabs' | 'bookmarks' | 'websearch' | 'help';

export interface DetectModeResult {
  mode: PaletteMode;
  query: string;
}

export interface DetectModeSettings {
  commandPaletteEnabled: boolean;
  commandPaletteModes: string[];
}

/**
 * Sanitize user input: trim whitespace, strip control characters, cap length.
 */
export function sanitizeQuery(query: string): string {
  if (!query) { return ''; }
  let sanitized = query.trim();
  sanitized = sanitized.split('').filter(ch => {
    const code = ch.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('');
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }
  return sanitized;
}

/**
 * Determine which palette mode the current input value maps to.
 */
export function detectMode(value: string, settings: DetectModeSettings): DetectModeResult {
  const { commandPaletteEnabled, commandPaletteModes } = settings;

  if (!commandPaletteEnabled || !value) {
    return { mode: 'history', query: value };
  }

  if (value === '?') {
    return { mode: 'help', query: '' };
  }

  if (value.startsWith('??') && commandPaletteModes.includes('??')) {
    return { mode: 'websearch', query: value.slice(2).trim() };
  }

  const prefixMap: Record<string, PaletteMode> = {
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

/** Clamp a width value between min and a viewport-relative max. */
export function clampWidth(w: number, min: number, viewportWidth: number): number {
  const maxW = viewportWidth * 0.92;
  return Math.max(min, Math.min(w, maxW));
}

/** Clamp a height value between min and a viewport-relative max. */
export function clampHeight(h: number, min: number, viewportHeight: number): number {
  const maxH = viewportHeight * 0.85;
  return Math.max(min, Math.min(h, maxH));
}

/** Format a Unix timestamp as a relative time string. */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) { return 'just now'; }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) { return `${minutes} min ago`; }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) { return `${hours}h ago`; }
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Determine if a keyboard event should be consumed by the overlay
 * (vs passed through to the browser).
 */
export function isOverlayKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  const key = e.key;
  const mod = e.ctrlKey || e.metaKey;

  if (key === 'Escape' || key === 'Tab') { return true; }

  if (/^F\d{1,2}$/.test(key)) { return false; }

  if (e.altKey) { return false; }

  if (mod) {
    const lk = key.toLowerCase();
    if (e.shiftKey && lk === 's') { return true; }
    if (e.shiftKey && lk === 'z') { return true; }
    if (['a', 'c', 'v', 'x', 'z', 'y', 'm'].includes(lk)) { return true; }
    if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) { return true; }
    return false;
  }

  if (['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
       'Backspace', 'Delete', 'Home', 'End'].includes(key)) { return true; }

  if (key.length === 1) { return true; }

  return false;
}

/** Find the start of the previous word from a cursor position. */
export function prevWordBoundary(text: string, pos: number): number {
  let i = pos;
  while (i > 0 && /\s/.test(text[i - 1])) { i--; }
  while (i > 0 && /\S/.test(text[i - 1])) { i--; }
  return i;
}

/** Find the end of the next word from a cursor position. */
export function nextWordBoundary(text: string, pos: number): number {
  let i = pos;
  while (i < text.length && /\S/.test(text[i])) { i++; }
  while (i < text.length && /\s/.test(text[i])) { i++; }
  return i;
}
