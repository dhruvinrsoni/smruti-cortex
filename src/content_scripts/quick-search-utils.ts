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

/**
 * Pure resolver for "what URL+title should Ctrl+C / Ctrl+M / Open copy?"
 * given a snapshot of the focused row across palette modes.
 *
 * Why this exists: the overlay's copy + open actions historically read from
 * `currentResults[idx]`, which is only populated for the history mode.
 * In palette modes (`#` bookmarks, `@` tabs, `/` `>` `??` commands /
 * websearch), `currentResults` stays empty, so Ctrl+C silently failed
 * even though a row was visibly selected. This helper centralises the
 * "what does the user mean by 'copy this'?" decision so call sites can
 * just hand off DOM dataset attributes + a history fallback and get back
 * a normalised `{ url, title }` (or `null` for "nothing meaningful to copy",
 * e.g. a command-palette action without a URL).
 *
 * Resolution order is intentional:
 *   1. Explicit `url` dataset attribute (added by bookmark/tab renderers).
 *   2. `tabUrl` dataset (existing tab-row attribute, kept for backwards compat).
 *   3. `bookmarkUrl` dataset (kept for backwards compat).
 *   4. `historyResult.url` fallback when the mode is history and no row attrs.
 *
 * Title resolution:
 *   1. `title` dataset (added by bookmark renderer).
 *   2. `textTitle` (callers should pass the `.tab-title` / `.bookmark-title`
 *       text content so we don't depend on jsdom in tests).
 *   3. `historyResult.title` fallback for history mode.
 */
export interface PaletteRowAttrs {
  /** Generic URL attribute set by render-time on bookmark / future palette rows. */
  url?: string | null;
  /** Existing tab-row attribute (`li.dataset.tabUrl`). */
  tabUrl?: string | null;
  /** Reserved for future: bookmark renderer may use this if `url` is taken. */
  bookmarkUrl?: string | null;
  /** Generic title attribute set by render-time on bookmark / future palette rows. */
  title?: string | null;
  /** Visible row title text (e.g. `.tab-title` text content). */
  textTitle?: string | null;
}

export interface PaletteHistoryResult {
  url?: string;
  title?: string;
}

export interface ResolvedCopyTarget {
  url: string;
  title: string;
}

/**
 * @param mode - current palette mode driving the visible list
 * @param rowAttrs - attributes of the focused/selected row in the palette list,
 *                    or null when no row is selected (history mode then falls
 *                    back to `historyResult`).
 * @param historyResult - the `currentResults[idx]` entry for history mode.
 *                         Ignored in non-history modes (those never populate
 *                         `currentResults`).
 * @returns `{ url, title }` for the row to copy/open, or `null` when there's
 *           nothing meaningful to act on (caller should toast "Nothing to copy"
 *           or silently no-op).
 */
export function resolvePaletteCopyTarget(
  mode: PaletteMode,
  rowAttrs: PaletteRowAttrs | null,
  historyResult: PaletteHistoryResult | null,
): ResolvedCopyTarget | null {
  // History mode: prefer the selected row's data attrs if rendered with them;
  // otherwise fall back to the historyResult passed in (the legacy path).
  if (mode === 'history') {
    if (rowAttrs) {
      const url = (rowAttrs.url || rowAttrs.tabUrl || rowAttrs.bookmarkUrl || '').trim();
      if (url) {
        const title = (rowAttrs.title || rowAttrs.textTitle || '').trim();
        return { url, title };
      }
    }
    if (historyResult?.url) {
      return { url: historyResult.url, title: historyResult.title || '' };
    }
    return null;
  }

  // All non-history palette modes resolve from the visible row only.
  if (!rowAttrs) { return null; }
  const url = (rowAttrs.url || rowAttrs.tabUrl || rowAttrs.bookmarkUrl || '').trim();
  if (!url) { return null; } // command/websearch rows without a URL: caller no-ops
  const title = (rowAttrs.title || rowAttrs.textTitle || '').trim();
  return { url, title };
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

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch guard — client-side idempotency for SEARCH_QUERY port messages.
//
// Without this, any upstream dispatch loop (duplicate listeners, password
// managers replaying input, IME composition bursts) can push 30+ SEARCH_QUERY
// messages per second onto a single port, which the service-worker rate
// limiter then drops as `{ error: 'Rate limited' }` — leaving stale results
// on screen. The guard collapses same-intent dispatches so only unique
// `(query, skipAI)` tuples travel down the port.
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatchGuardState {
  /** Last key that was actually dispatched (cleared never; used for rapid-repeat window). */
  lastKey: string | null;
  /** Key of a dispatch that has not yet received a response; null when nothing in flight. */
  inflightKey: string | null;
  /** Monotonic timestamp (ms, Date.now basis) when the inflight dispatch started. */
  inflightSince: number;
}

export function createDispatchGuardState(): DispatchGuardState {
  return { lastKey: null, inflightKey: null, inflightSince: 0 };
}

/** Stable key for a SEARCH_QUERY dispatch. */
export function makeDispatchKey(query: string, skipAI: boolean): string {
  return `${skipAI ? '1' : '0'}|${query}`;
}

export type DispatchSuppressReason = 'duplicate-inflight' | 'rapid-repeat';

export interface DispatchDecision {
  suppress: boolean;
  reason: DispatchSuppressReason | null;
}

/** Default max time a dispatch is considered "in flight" before we allow a resubmit. */
export const DEFAULT_INFLIGHT_MAX_MS = 2000;
/** Minimum gap before the SAME key can be sent again after a recent dispatch. */
export const RAPID_REPEAT_WINDOW_MS = 100;

/**
 * Decide whether a prospective dispatch should be suppressed.
 * Pure function: callers pass `now` for deterministic tests.
 */
export function shouldSuppressDispatch(
  state: DispatchGuardState,
  key: string,
  now: number,
  inflightMaxMs: number = DEFAULT_INFLIGHT_MAX_MS,
): DispatchDecision {
  if (
    state.inflightKey !== null &&
    state.inflightKey === key &&
    now - state.inflightSince < inflightMaxMs
  ) {
    return { suppress: true, reason: 'duplicate-inflight' };
  }
  if (
    state.lastKey !== null &&
    state.lastKey === key &&
    now - state.inflightSince < RAPID_REPEAT_WINDOW_MS
  ) {
    return { suppress: true, reason: 'rapid-repeat' };
  }
  return { suppress: false, reason: null };
}

/** Mark a dispatch as sent; call immediately before postMessage. */
export function markDispatched(state: DispatchGuardState, key: string, now: number): void {
  state.lastKey = key;
  state.inflightKey = key;
  state.inflightSince = now;
}

/**
 * Clear the in-flight marker when a response (or terminal error) arrives for it.
 * Called on normal results, rate-limit responses, and SW-not-ready responses so
 * a subsequent retry/typing can dispatch again.
 */
export function clearInflight(state: DispatchGuardState, key: string | null): void {
  if (key === null || state.inflightKey === key) {
    state.inflightKey = null;
  }
}

// ===== bfcache lifecycle decision =====

/**
 * What the page transition handler should do in response to a pagehide /
 * pageshow event. Pulled out as a pure function so the decision is unit-tested
 * independently of the DOM/port machinery in quick-search.ts.
 *
 * - `full-cleanup`        → real navigation: tear down shadow DOM, listeners, port.
 * - `port-only-cleanup`   → entering bfcache: close the port now (so any
 *                            in-flight postMessage doesn't surface as
 *                            "Unchecked runtime.lastError"), keep page state
 *                            so we can come back fast.
 * - `reconnect-immediate` → restored from bfcache: old port is dead, force an
 *                            immediate reconnect (otherwise the heartbeat
 *                            backup path can take up to 18s to detect this).
 * - `noop`                → first paint of pageshow: no action needed.
 */
export type BfcacheAction = 'full-cleanup' | 'port-only-cleanup' | 'reconnect-immediate' | 'noop';

export function decideBfcacheAction(
  eventName: 'pagehide' | 'pageshow',
  persisted: boolean,
): BfcacheAction {
  if (eventName === 'pagehide') {
    return persisted ? 'port-only-cleanup' : 'full-cleanup';
  }
  return persisted ? 'reconnect-immediate' : 'noop';
}
