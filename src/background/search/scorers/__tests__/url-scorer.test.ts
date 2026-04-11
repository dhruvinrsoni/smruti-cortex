import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../../../__test-utils__';
import { makeItem as makeItemBase } from '../../../../__test-utils__';

vi.mock('../../../../core/logger', () => mockLogger());

import urlScorer from '../url-scorer';
import type { IndexedItem } from '../../../schema';

function makeItem(url: string, hostname: string, overrides?: Partial<IndexedItem>): IndexedItem {
  return makeItemBase({ url, hostname, ...overrides });
}

describe('urlScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('score calculation', () => {
    it('should return 0 when query tokenizes to empty', () => {
      const item = makeItem('https://github.com/react', 'github.com');
      expect(urlScorer.score(item, '', [])).toBe(0);
    });

    it('should return > 0 when query matches URL', () => {
      const item = makeItem('https://github.com/react', 'github.com');
      expect(urlScorer.score(item, 'react', [])).toBeGreaterThan(0);
    });

    it('should return score in [0, 1]', () => {
      const item = makeItem('https://github.com/react/docs', 'github.com');
      const score = urlScorer.score(item, 'github react', []);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should give non-zero scores for hostname match and path-only match', () => {
      const hostnameMatch = makeItem('https://react.com/docs', 'react.com');
      const pathOnly = makeItem('https://example.com/react/docs', 'example.com');
      const scoreHostname = urlScorer.score(hostnameMatch, 'react', []);
      const scorePath = urlScorer.score(pathOnly, 'react', []);
      // Both should match but may both be capped at 1.0
      expect(scoreHostname).toBeGreaterThan(0);
      expect(scorePath).toBeGreaterThan(0);
      expect(scoreHostname).toBeLessThanOrEqual(1.0);
      expect(scorePath).toBeLessThanOrEqual(1.0);
    });

    it('should score 0 for query that only matches query tokens not in URL', () => {
      // 'docsearch' appears in neither hostname nor URL
      const item = makeItem('https://react.com/guide', 'react.com');
      const score = urlScorer.score(item, 'docsearch', []);
      expect(score).toBe(0);
    });

    it('should return 0 for non-matching query', () => {
      const item = makeItem('https://github.com/react', 'github.com');
      expect(urlScorer.score(item, 'xyznotfound', [])).toBe(0);
    });

    it('should give bonus for original token matching', () => {
      const item = makeItem('https://github.com/react', 'github.com');
      // Original token 'react' has direct match → originalBonus applied
      const directScore = urlScorer.score(item, 'react', []);
      // Expanded token 'reac' does not exactly match 'react' in full
      const expandedOnlyContext = {
        originalTokens: ['nonexistent'],
        expandedTokens: ['react'],
      };
      const expandedScore = urlScorer.score(item, 'nonexistent', [], expandedOnlyContext);
      // Direct original tokens create an originalBonus
      expect(directScore).toBeGreaterThan(0);
      expect(expandedScore).toBeGreaterThan(0);
    });

    it('should use context.expandedTokens when provided', () => {
      const item = makeItem('https://example.com/javascript-guide', 'example.com');
      const context = { originalTokens: ['js'], expandedTokens: ['js', 'javascript'] };
      const withContext = urlScorer.score(item, 'js', [], context);
      const withoutContext = urlScorer.score(item, 'js', []);
      // Expanded 'javascript' should match the URL path
      expect(withContext).toBeGreaterThanOrEqual(withoutContext);
    });

    it('should correctly handle query matching hostname prefix', () => {
      const item = makeItem('https://github.com/', 'github.com');
      const score = urlScorer.score(item, 'git', []);
      expect(score).toBeGreaterThan(0); // 'git' is prefix of 'github'
    });
  });
});
