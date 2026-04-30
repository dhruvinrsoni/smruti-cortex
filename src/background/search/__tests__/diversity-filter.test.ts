// Tests for diversity-filter.ts — normalizeUrl and applyDiversityFilter

import { describe, it, expect, vi } from 'vitest';
import { mockLogger, makeItem } from '../../../__test-utils__';

vi.mock('../../../core/logger', () => mockLogger());

import {
  normalizeUrl,
  applyDiversityFilter,
  applyTitleHostDedup,
  normalizeTitleForDedup,
  ScoredItem,
} from '../diversity-filter';

function makeScoredItem(url: string, score: number): ScoredItem {
  return {
    item: makeItem({ url, hostname: new URL(url).hostname }),
    finalScore: score,
  };
}

/**
 * Variant for the title+host dedup tests: lets us set both `url` and
 * `title` (and skips hostname auto-derivation when the URL is malformed,
 * exercising the empty-host fallthrough branch).
 */
function makeTitled(url: string, title: string, score = 1.0): ScoredItem {
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { /* malformed URL — leave host empty */ }
  return {
    item: makeItem({ url, title, hostname }),
    finalScore: score,
  };
}

describe('normalizeUrl', () => {
  it('strips query parameters', () => {
    expect(normalizeUrl('https://notion.so/page?pvs=12')).toBe('https://notion.so/page');
  });

  it('strips fragment/hash', () => {
    expect(normalizeUrl('https://example.com/path#section')).toBe('https://example.com/path');
  });

  it('strips both query and fragment', () => {
    expect(normalizeUrl('https://example.com/path/?utm_source=x#section'))
      .toBe('https://example.com/path');
  });

  it('strips trailing slash from path', () => {
    expect(normalizeUrl('https://site.com/page/')).toBe('https://site.com/page');
  });

  it('preserves root path trailing slash', () => {
    // Root path like https://example.com/ stays as-is (it's the root)
    const result = normalizeUrl('https://example.com/');
    expect(result).toBe('https://example.com/');
  });

  it('lowercases the result', () => {
    expect(normalizeUrl('https://EXAMPLE.COM/Path')).toBe('https://example.com/path');
  });

  it('returns lowercased URL for invalid URLs (fallback)', () => {
    const result = normalizeUrl('not-a-valid-url');
    expect(result).toBe('not-a-valid-url');
  });

  it('strips query params in fallback mode', () => {
    const result = normalizeUrl('not-valid?foo=bar');
    expect(result).not.toContain('?');
  });

  it('handles plain domain without path', () => {
    const result = normalizeUrl('https://example.com');
    expect(result).toBe('https://example.com/');
  });

  it('preserves path depth', () => {
    expect(normalizeUrl('https://github.com/user/repo?tab=readme')).toBe('https://github.com/user/repo');
  });
});

describe('applyDiversityFilter', () => {
  it('returns all results unchanged when disabled', () => {
    const items = [
      makeScoredItem('https://example.com/page?a=1', 1.0),
      makeScoredItem('https://example.com/page?a=2', 0.9),
    ];
    const result = applyDiversityFilter(items, false);
    expect(result).toHaveLength(2);
    expect(result).toEqual(items);
  });

  it('returns empty array unchanged', () => {
    expect(applyDiversityFilter([], true)).toHaveLength(0);
    expect(applyDiversityFilter([], false)).toHaveLength(0);
  });

  it('deduplicates items with same normalized URL', () => {
    const items = [
      makeScoredItem('https://example.com/page?a=1', 1.0),
      makeScoredItem('https://example.com/page?b=2', 0.8),
      makeScoredItem('https://example.com/page#section', 0.7),
    ];
    const result = applyDiversityFilter(items, true);
    expect(result).toHaveLength(1);
  });

  it('keeps the first (highest-scoring) item when duplicates exist', () => {
    const items = [
      makeScoredItem('https://example.com/page?a=1', 1.0),
      makeScoredItem('https://example.com/page?b=2', 0.5),
    ];
    const result = applyDiversityFilter(items, true);
    expect(result[0].finalScore).toBe(1.0);
  });

  it('keeps unique URLs all intact', () => {
    const items = [
      makeScoredItem('https://google.com/page', 1.0),
      makeScoredItem('https://github.com/repo', 0.9),
      makeScoredItem('https://notion.so/doc', 0.8),
    ];
    const result = applyDiversityFilter(items, true);
    expect(result).toHaveLength(3);
  });

  it('handles mixed unique and duplicate URLs', () => {
    const items = [
      makeScoredItem('https://google.com/search?q=1', 1.0),
      makeScoredItem('https://github.com/repo', 0.9),
      makeScoredItem('https://google.com/search?q=2', 0.8),
    ];
    const result = applyDiversityFilter(items, true);
    expect(result).toHaveLength(2);
    const urls = result.map(r => r.item.url);
    expect(urls).toContain('https://google.com/search?q=1');
    expect(urls).toContain('https://github.com/repo');
  });

  it('maintains original order of first occurrences', () => {
    const items = [
      makeScoredItem('https://a.com/page', 1.0),
      makeScoredItem('https://b.com/page', 0.9),
      makeScoredItem('https://a.com/page?dup=1', 0.8),
      makeScoredItem('https://c.com/page', 0.7),
    ];
    const result = applyDiversityFilter(items, true);
    expect(result).toHaveLength(3);
    expect(result[0].item.url).toBe('https://a.com/page');
    expect(result[1].item.url).toBe('https://b.com/page');
    expect(result[2].item.url).toBe('https://c.com/page');
  });
});

describe('normalizeTitleForDedup', () => {
  it('lowercases and trims whitespace', () => {
    expect(normalizeTitleForDedup('  Sign In  ')).toBe('sign in');
  });

  it('collapses runs of internal whitespace to a single space', () => {
    expect(normalizeTitleForDedup('Sign\tIn   to   Account')).toBe('sign in to account');
  });

  it('returns empty string for empty / nullish input', () => {
    expect(normalizeTitleForDedup('')).toBe('');
    expect(normalizeTitleForDedup(undefined as unknown as string)).toBe('');
    expect(normalizeTitleForDedup(null as unknown as string)).toBe('');
  });

  it('preserves punctuation and non-ASCII characters', () => {
    // Different titles with different punctuation must NOT collapse —
    // we only normalise case + whitespace.
    expect(normalizeTitleForDedup('Sign in - work')).not.toBe(normalizeTitleForDedup('Sign in (work)'));
    expect(normalizeTitleForDedup('Café')).toBe('café');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// A4: applyTitleHostDedup — second-pass dedup keyed on (host + normTitle).
// Reproduces the user-reported "4× Sign in - Google Accounts" case from
// the v9.2.0 'service-now' bug, plus the cross-domain / empty-title /
// malformed-URL edge cases.
// ──────────────────────────────────────────────────────────────────────────
describe('applyTitleHostDedup', () => {
  it('collapses multiple Sign-in rows on the same host (the user-reported case)', () => {
    const items = [
      makeTitled('https://accounts.google.com/signin/v2/identifier', 'Sign in - Google Accounts', 1.5),
      makeTitled('https://accounts.google.com/signin/v2/sl/pwd', 'Sign in - Google Accounts', 1.4),
      makeTitled('https://accounts.google.com/signin/v2/challenge/pwd', 'Sign in - Google Accounts', 1.3),
      makeTitled('https://accounts.google.com/signin/identifier?continue=…', 'Sign in - Google Accounts', 1.2),
    ];
    const out = applyTitleHostDedup(items);
    expect(out).toHaveLength(1);
    expect(out[0].item.url).toBe('https://accounts.google.com/signin/v2/identifier');
  });

  it('preserves cross-domain rows with the same title (variety across hosts is signal)', () => {
    const items = [
      makeTitled('https://a.example.com/login', 'Sign in', 1.0),
      makeTitled('https://b.example.com/login', 'Sign in', 0.9),
      makeTitled('https://c.example.com/login', 'Sign in', 0.8),
    ];
    const out = applyTitleHostDedup(items);
    expect(out).toHaveLength(3);
  });

  it('treats whitespace + casing variants as the same title (collapses)', () => {
    const items = [
      makeTitled('https://x.example.com/a', '  SIGN  IN  -  Google Accounts  ', 1.0),
      makeTitled('https://x.example.com/b', 'Sign in - Google Accounts', 0.9),
    ];
    const out = applyTitleHostDedup(items);
    expect(out).toHaveLength(1);
    expect(out[0].item.url).toBe('https://x.example.com/a');
  });

  it('does NOT collapse rows with empty titles (no false |host shared key)', () => {
    // If we keyed on `${host}|` for empty titles, every titleless row on
    // the same host would collapse to one — destroying distinct results
    // for sites that index path-only rows. Empty-title rows fall through.
    const items = [
      makeTitled('https://x.example.com/a', '', 1.0),
      makeTitled('https://x.example.com/b', '', 0.9),
      makeTitled('https://x.example.com/c', '', 0.8),
    ];
    const out = applyTitleHostDedup(items);
    expect(out).toHaveLength(3);
  });

  it('does NOT drop rows with malformed URLs (URL parser throws -> empty host -> fallthrough)', () => {
    const items = [
      makeTitled('not a url at all !!', 'Some title', 1.0),
      makeTitled('://still-bad', 'Some title', 0.9),
    ];
    const out = applyTitleHostDedup(items);
    expect(out).toHaveLength(2);
  });

  it('preserves first-wins ordering when collapse occurs (later duplicates dropped)', () => {
    const items = [
      makeTitled('https://x.example.com/a', 'Same', 1.0),
      makeTitled('https://y.example.com/a', 'Other', 0.9),
      makeTitled('https://x.example.com/b', 'Same', 0.8),
      makeTitled('https://z.example.com/a', 'Third', 0.7),
    ];
    const out = applyTitleHostDedup(items);
    expect(out.map(r => r.item.url)).toEqual([
      'https://x.example.com/a',
      'https://y.example.com/a',
      'https://z.example.com/a',
    ]);
  });

  it('returns empty array unchanged', () => {
    expect(applyTitleHostDedup([])).toHaveLength(0);
  });

  it('passes through unique (host, title) pairs untouched', () => {
    const items = [
      makeTitled('https://a.com/x', 'Title A', 1.0),
      makeTitled('https://b.com/y', 'Title B', 0.9),
      makeTitled('https://a.com/x2', 'Title C', 0.8),
    ];
    const out = applyTitleHostDedup(items);
    expect(out).toHaveLength(3);
  });
});
