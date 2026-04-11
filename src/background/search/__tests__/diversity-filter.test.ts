// Tests for diversity-filter.ts — normalizeUrl and applyDiversityFilter

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, makeItem } from '../../../__test-utils__';

vi.mock('../../../core/logger', () => mockLogger());

import { normalizeUrl, applyDiversityFilter, ScoredItem } from '../diversity-filter';

function makeScoredItem(url: string, score: number): ScoredItem {
  return {
    item: makeItem({ url, hostname: new URL(url).hostname }),
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
