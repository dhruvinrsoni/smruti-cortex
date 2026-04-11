import { describe, it, expect, vi } from 'vitest';
import { mockLogger } from '../../../__test-utils__';

vi.mock('../../../core/logger', () => mockLogger());

import {
  expandTerm,
  expandQuery,
  getExpandedTerms,
  matchesExpandedQuery,
} from '../query-expansion';

describe('expandTerm', () => {
  it('should always include the original term', () => {
    expect(expandTerm('javascript')).toContain('javascript');
  });

  it('should expand javascript to include js and ecmascript', () => {
    const result = expandTerm('javascript');
    expect(result).toContain('js');
    expect(result).toContain('ecmascript');
  });

  it('should NOT reverse-expand js to javascript (forward-only lookup)', () => {
    const result = expandTerm('js');
    expect(result).not.toContain('javascript');
    expect(result).toContain('js');
  });

  it('should return array with at least the term itself for unknown words', () => {
    const result = expandTerm('xyzunknownterm');
    expect(result).toContain('xyzunknownterm');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should be case-insensitive', () => {
    const lower = expandTerm('javascript');
    const upper = expandTerm('JavaScript');
    expect(lower).toEqual(upper);
  });

  it('should return unique values only', () => {
    const result = expandTerm('javascript');
    const set = new Set(result);
    expect(result.length).toBe(set.size);
  });
});

describe('expandQuery', () => {
  it('should return one result per word', () => {
    const result = expandQuery('react docs');
    expect(result).toHaveLength(2);
  });

  it('should set original to the raw word', () => {
    const result = expandQuery('react');
    expect(result[0].original).toBe('react');
  });

  it('should lowercase the original word', () => {
    const result = expandQuery('JavaScript');
    expect(result[0].original).toBe('javascript');
  });

  it('should expand each word via expandTerm (forward-only)', () => {
    const result = expandQuery('javascript');
    expect(result[0].expanded).toContain('js');
    expect(result[0].expanded).toContain('ecmascript');
  });

  it('should return empty array for empty query', () => {
    expect(expandQuery('')).toEqual([]);
  });

  it('should ignore extra whitespace between words', () => {
    const result = expandQuery('  react  docs  ');
    expect(result).toHaveLength(2);
  });
});

describe('getExpandedTerms', () => {
  it('should return flat array of unique strings', () => {
    const terms = getExpandedTerms('javascript');
    expect(Array.isArray(terms)).toBe(true);
    expect(terms.every(t => typeof t === 'string')).toBe(true);
  });

  it('should include original term', () => {
    const terms = getExpandedTerms('react');
    expect(terms).toContain('react');
  });

  it('should include expansion of javascript', () => {
    const terms = getExpandedTerms('javascript');
    expect(terms).toContain('js');
  });

  it('should return unique values only', () => {
    const terms = getExpandedTerms('js javascript');
    const set = new Set(terms);
    expect(terms.length).toBe(set.size);
  });

  it('should return empty array for empty query', () => {
    expect(getExpandedTerms('')).toEqual([]);
  });

  it('should expand multi-word query and return all terms flat', () => {
    const terms = getExpandedTerms('react docs');
    expect(terms.length).toBeGreaterThanOrEqual(2);
  });
});

describe('matchesExpandedQuery', () => {
  it('should return true when text contains an expanded term', () => {
    expect(matchesExpandedQuery('JavaScript tutorial', ['javascript'])).toBe(true);
  });

  it('should return false when text contains nothing from terms', () => {
    expect(matchesExpandedQuery('hello world', ['xyz'])).toBe(false);
  });

  it('should return false for empty terms array', () => {
    expect(matchesExpandedQuery('hello world', [])).toBe(false);
  });

  it('should be case-insensitive for the text', () => {
    expect(matchesExpandedQuery('REACT DOCS', ['react'])).toBe(true);
  });

  it('should match substring in text', () => {
    expect(matchesExpandedQuery('reactdocs', ['react'])).toBe(true);
  });

  it('returns false when no term matches', () => {
    expect(matchesExpandedQuery('python guide', ['javascript', 'node'])).toBe(false);
  });
});

import { addCustomSynonym } from '../query-expansion';

describe('addCustomSynonym', () => {
  it('adds a new synonym mapping', () => {
    addCustomSynonym('mycustomword', ['mcsw', 'mcw2']);
    const expanded = expandTerm('mycustomword');
    expect(expanded).toContain('mcsw');
    expect(expanded).toContain('mcw2');
  });

  it('does NOT add reverse mapping (forward-only by design)', () => {
    addCustomSynonym('uniqueterm123', ['ut123']);
    const expanded = expandTerm('ut123');
    expect(expanded).not.toContain('uniqueterm123');
    expect(expanded).toContain('ut123');
  });

  it('does not add duplicate synonyms', () => {
    addCustomSynonym('dedupterm', ['syn1']);
    addCustomSynonym('dedupterm', ['syn1']); // duplicate
    const expanded = expandTerm('dedupterm');
    const count = expanded.filter(s => s === 'syn1').length;
    expect(count).toBe(1);
  });
});
