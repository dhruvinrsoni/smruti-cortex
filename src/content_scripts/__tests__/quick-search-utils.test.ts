import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeQuery,
  detectMode,
  clampWidth,
  clampHeight,
  formatTimeAgo,
  isOverlayKey,
  prevWordBoundary,
  nextWordBoundary,
  makeDispatchKey,
  shouldSuppressDispatch,
  markDispatched,
  clearInflight,
  createDispatchGuardState,
  DEFAULT_INFLIGHT_MAX_MS,
  RAPID_REPEAT_WINDOW_MS,
  type DetectModeSettings,
  type DispatchGuardState,
} from '../quick-search-utils';

const allModes: DetectModeSettings = {
  commandPaletteEnabled: true,
  commandPaletteModes: ['/', '>', '@', '#', '??'],
};

describe('sanitizeQuery', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeQuery('')).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeQuery('  hello  ')).toBe('hello');
  });

  it('strips control characters', () => {
    expect(sanitizeQuery('hello\x00world\x1F')).toBe('helloworld');
  });

  it('strips DEL character (127)', () => {
    expect(sanitizeQuery('test\x7Fvalue')).toBe('testvalue');
  });

  it('caps at 500 characters', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeQuery(long).length).toBe(500);
  });

  it('preserves normal printable characters', () => {
    expect(sanitizeQuery('Hello World! @#$')).toBe('Hello World! @#$');
  });

  it('handles null-ish values gracefully', () => {
    expect(sanitizeQuery(undefined as unknown as string)).toBe('');
  });
});

describe('detectMode', () => {
  it('returns history for empty string', () => {
    expect(detectMode('', allModes)).toEqual({ mode: 'history', query: '' });
  });

  it('returns history for plain text', () => {
    expect(detectMode('react docs', allModes)).toEqual({ mode: 'history', query: 'react docs' });
  });

  it('returns help for single ?', () => {
    expect(detectMode('?', allModes)).toEqual({ mode: 'help', query: '' });
  });

  it('returns websearch for ?? prefix', () => {
    expect(detectMode('?? cats', allModes)).toEqual({ mode: 'websearch', query: 'cats' });
  });

  it('returns commands for / prefix', () => {
    expect(detectMode('/sort', allModes)).toEqual({ mode: 'commands', query: 'sort' });
  });

  it('returns power for > prefix', () => {
    expect(detectMode('>reload', allModes)).toEqual({ mode: 'power', query: 'reload' });
  });

  it('returns tabs for @ prefix', () => {
    expect(detectMode('@github', allModes)).toEqual({ mode: 'tabs', query: 'github' });
  });

  it('returns bookmarks for # prefix', () => {
    expect(detectMode('#react', allModes)).toEqual({ mode: 'bookmarks', query: 'react' });
  });

  it('returns history when palette is disabled', () => {
    const disabled = { ...allModes, commandPaletteEnabled: false };
    expect(detectMode('/sort', disabled)).toEqual({ mode: 'history', query: '/sort' });
  });

  it('returns history when mode is not allowed', () => {
    const limited = { ...allModes, commandPaletteModes: ['/'] };
    expect(detectMode('>reload', limited)).toEqual({ mode: 'history', query: '>reload' });
  });

  it('trims query after prefix', () => {
    expect(detectMode('/  sort  ', allModes)).toEqual({ mode: 'commands', query: 'sort' });
  });
});

describe('clampWidth', () => {
  it('clamps below minimum', () => {
    expect(clampWidth(100, 400, 1920)).toBe(400);
  });

  it('clamps above viewport max', () => {
    expect(clampWidth(5000, 400, 1920)).toBe(1920 * 0.92);
  });

  it('passes through valid width', () => {
    expect(clampWidth(800, 400, 1920)).toBe(800);
  });
});

describe('clampHeight', () => {
  it('clamps below minimum', () => {
    expect(clampHeight(50, 200, 1080)).toBe(200);
  });

  it('clamps above viewport max', () => {
    expect(clampHeight(5000, 200, 1080)).toBe(1080 * 0.85);
  });

  it('passes through valid height', () => {
    expect(clampHeight(600, 200, 1080)).toBe(600);
  });
});

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-11T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for recent timestamps', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 30)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 300)).toBe('5 min ago');
  });

  it('returns hours ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 7200)).toBe('2h ago');
  });

  it('returns days ago', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 172800)).toBe('2d ago');
  });

  it('returns 0 min ago boundary', () => {
    const now = Date.now() / 1000;
    expect(formatTimeAgo(now - 60)).toBe('1 min ago');
  });
});

describe('isOverlayKey', () => {
  function makeKey(key: string, mods: Partial<KeyboardEvent> = {}): Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'> {
    return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods };
  }

  it('returns true for Escape', () => {
    expect(isOverlayKey(makeKey('Escape'))).toBe(true);
  });

  it('returns true for Tab', () => {
    expect(isOverlayKey(makeKey('Tab'))).toBe(true);
  });

  it('returns false for F5 (browser reload)', () => {
    expect(isOverlayKey(makeKey('F5'))).toBe(false);
  });

  it('returns false for F12 (devtools)', () => {
    expect(isOverlayKey(makeKey('F12'))).toBe(false);
  });

  it('returns false for Alt combos', () => {
    expect(isOverlayKey(makeKey('ArrowLeft', { altKey: true }))).toBe(false);
  });

  it('returns true for Ctrl+A (select all)', () => {
    expect(isOverlayKey(makeKey('a', { ctrlKey: true }))).toBe(true);
  });

  it('returns true for Ctrl+C (copy)', () => {
    expect(isOverlayKey(makeKey('c', { ctrlKey: true }))).toBe(true);
  });

  it('returns true for Ctrl+V (paste)', () => {
    expect(isOverlayKey(makeKey('v', { ctrlKey: true }))).toBe(true);
  });

  it('returns true for Ctrl+Shift+S (toggle overlay)', () => {
    expect(isOverlayKey(makeKey('s', { ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it('returns false for Ctrl+R (browser reload)', () => {
    expect(isOverlayKey(makeKey('r', { ctrlKey: true }))).toBe(false);
  });

  it('returns false for Ctrl+T (new tab)', () => {
    expect(isOverlayKey(makeKey('t', { ctrlKey: true }))).toBe(false);
  });

  it('returns true for Enter', () => {
    expect(isOverlayKey(makeKey('Enter'))).toBe(true);
  });

  it('returns true for ArrowUp', () => {
    expect(isOverlayKey(makeKey('ArrowUp'))).toBe(true);
  });

  it('returns true for Backspace', () => {
    expect(isOverlayKey(makeKey('Backspace'))).toBe(true);
  });

  it('returns true for printable character', () => {
    expect(isOverlayKey(makeKey('a'))).toBe(true);
  });

  it('returns false for Shift key alone', () => {
    expect(isOverlayKey(makeKey('Shift'))).toBe(false);
  });

  it('returns false for Control key alone', () => {
    expect(isOverlayKey(makeKey('Control'))).toBe(false);
  });

  it('returns true for Ctrl+Backspace (word delete)', () => {
    expect(isOverlayKey(makeKey('Backspace', { ctrlKey: true }))).toBe(true);
  });

  it('returns true for Ctrl+Shift+Z (redo)', () => {
    expect(isOverlayKey(makeKey('z', { ctrlKey: true, shiftKey: true }))).toBe(true);
  });
});

describe('prevWordBoundary', () => {
  it('returns 0 at start of string', () => {
    expect(prevWordBoundary('hello', 0)).toBe(0);
  });

  it('skips back over a word', () => {
    expect(prevWordBoundary('hello world', 11)).toBe(6);
  });

  it('skips back over whitespace and word', () => {
    expect(prevWordBoundary('hello  world', 12)).toBe(7);
  });

  it('handles cursor mid-word', () => {
    expect(prevWordBoundary('hello world', 8)).toBe(6);
  });

  it('handles single word', () => {
    expect(prevWordBoundary('hello', 5)).toBe(0);
  });

  it('handles multiple words', () => {
    expect(prevWordBoundary('one two three', 13)).toBe(8);
  });
});

describe('nextWordBoundary', () => {
  it('returns length at end of string', () => {
    expect(nextWordBoundary('hello', 5)).toBe(5);
  });

  it('skips forward over a word', () => {
    expect(nextWordBoundary('hello world', 0)).toBe(6);
  });

  it('skips forward over whitespace and word', () => {
    expect(nextWordBoundary('hello  world', 0)).toBe(7);
  });

  it('handles cursor mid-word', () => {
    expect(nextWordBoundary('hello world', 3)).toBe(6);
  });

  it('handles single word from start', () => {
    expect(nextWordBoundary('hello', 0)).toBe(5);
  });

  it('handles multiple words', () => {
    expect(nextWordBoundary('one two three', 0)).toBe(4);
  });
});

describe('dispatch guard', () => {
  let state: DispatchGuardState;

  beforeEach(() => {
    state = createDispatchGuardState();
  });

  it('makeDispatchKey distinguishes skipAI true vs false for same query', () => {
    expect(makeDispatchKey('foo', true)).not.toBe(makeDispatchKey('foo', false));
  });

  it('makeDispatchKey distinguishes different queries for same skipAI', () => {
    expect(makeDispatchKey('foo', true)).not.toBe(makeDispatchKey('bar', true));
  });

  it('allows first dispatch on a fresh guard', () => {
    const key = makeDispatchKey('hello', true);
    const decision = shouldSuppressDispatch(state, key, 1000);
    expect(decision.suppress).toBe(false);
    expect(decision.reason).toBeNull();
  });

  it('suppresses a duplicate (query, skipAI) while still in-flight', () => {
    const key = makeDispatchKey('hello', true);
    markDispatched(state, key, 1000);
    const decision = shouldSuppressDispatch(state, key, 1050);
    expect(decision.suppress).toBe(true);
    expect(decision.reason).toBe('duplicate-inflight');
  });

  it('allows Phase 1 (skipAI=true) and Phase 2 (skipAI=false) for the same query', () => {
    const phase1 = makeDispatchKey('hello', true);
    const phase2 = makeDispatchKey('hello', false);
    markDispatched(state, phase1, 1000);
    const decision = shouldSuppressDispatch(state, phase2, 1100);
    expect(decision.suppress).toBe(false);
    expect(decision.reason).toBeNull();
  });

  it('allows resubmit after inflightMaxMs has elapsed', () => {
    const key = makeDispatchKey('hello', true);
    markDispatched(state, key, 1000);
    const decision = shouldSuppressDispatch(
      state,
      key,
      1000 + DEFAULT_INFLIGHT_MAX_MS + 1,
    );
    expect(decision.suppress).toBe(false);
  });

  it('allows resubmit immediately after a different query intervened and cleared the inflight', () => {
    const keyA = makeDispatchKey('foo', true);
    const keyB = makeDispatchKey('bar', true);
    markDispatched(state, keyA, 1000);
    clearInflight(state, keyA);
    markDispatched(state, keyB, 1010);
    clearInflight(state, keyB);
    // After both finished, re-sending A is allowed (no inflight, no rapid repeat on same key).
    const decision = shouldSuppressDispatch(state, keyA, 1200);
    expect(decision.suppress).toBe(false);
  });

  it('rapid-repeat: suppresses same key dispatched within RAPID_REPEAT_WINDOW_MS even if inflight was cleared', () => {
    const key = makeDispatchKey('hello', true);
    markDispatched(state, key, 1000);
    clearInflight(state, key);
    const decision = shouldSuppressDispatch(
      state,
      key,
      1000 + RAPID_REPEAT_WINDOW_MS - 1,
    );
    expect(decision.suppress).toBe(true);
    expect(decision.reason).toBe('rapid-repeat');
  });

  it('rapid-repeat: allows same key after RAPID_REPEAT_WINDOW_MS has elapsed', () => {
    const key = makeDispatchKey('hello', true);
    markDispatched(state, key, 1000);
    clearInflight(state, key);
    const decision = shouldSuppressDispatch(
      state,
      key,
      1000 + RAPID_REPEAT_WINDOW_MS + 1,
    );
    expect(decision.suppress).toBe(false);
  });

  it('clearInflight with null clears unconditionally (terminal error path)', () => {
    const key = makeDispatchKey('hello', true);
    markDispatched(state, key, 1000);
    clearInflight(state, null);
    expect(state.inflightKey).toBeNull();
  });

  it('clearInflight is a no-op when the key does not match (stale response)', () => {
    const live = makeDispatchKey('live', true);
    const stale = makeDispatchKey('stale', true);
    markDispatched(state, live, 1000);
    clearInflight(state, stale);
    expect(state.inflightKey).toBe(live);
  });

  it('shouldSuppressDispatch accepts a custom inflightMaxMs override', () => {
    const key = makeDispatchKey('hello', true);
    markDispatched(state, key, 1000);
    expect(shouldSuppressDispatch(state, key, 1300, 200).suppress).toBe(false);
    expect(shouldSuppressDispatch(state, key, 1150, 200).suppress).toBe(true);
  });
});
