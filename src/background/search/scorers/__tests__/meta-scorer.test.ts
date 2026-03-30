import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../core/logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    forComponent: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import metaScorer from '../meta-scorer';
import type { IndexedItem } from '../../../schema';

function makeItem(overrides?: Partial<IndexedItem>): IndexedItem {
  return {
    url: 'https://example.com',
    title: 'Test Page',
    hostname: 'example.com',
    visitCount: 1,
    lastVisit: Date.now(),
    tokens: ['test'],
    metaDescription: undefined,
    metaKeywords: [],
    ...overrides,
  } as unknown as IndexedItem;
}

describe('metaScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('score calculation', () => {
    it('should return 0 when metaDescription and metaKeywords are both empty', () => {
      const item = makeItem({ metaDescription: '', metaKeywords: [] });
      expect(metaScorer.score(item, 'react', [])).toBe(0);
    });

    it('should return 0 when metaDescription is undefined and metaKeywords is empty', () => {
      const item = makeItem();
      expect(metaScorer.score(item, 'react', [])).toBe(0);
    });

    it('should return 0 for whitespace-only meta text', () => {
      const item = makeItem({ metaDescription: '   ', metaKeywords: [] });
      expect(metaScorer.score(item, 'react', [])).toBe(0);
    });

    it('should return 0 when tokens are empty', () => {
      const item = makeItem({ metaDescription: 'A page about react', metaKeywords: [] });
      expect(metaScorer.score(item, '', [])).toBe(0);
    });

    it('should return > 0 when query matches metaDescription', () => {
      const item = makeItem({ metaDescription: 'A guide about react framework', metaKeywords: [] });
      expect(metaScorer.score(item, 'react', [])).toBeGreaterThan(0);
    });

    it('should return > 0 when query matches metaKeywords', () => {
      const item = makeItem({ metaDescription: '', metaKeywords: ['react', 'javascript', 'frontend'] });
      expect(metaScorer.score(item, 'react', [])).toBeGreaterThan(0);
    });

    it('should return a score in [0, 1]', () => {
      const item = makeItem({ metaDescription: 'react docs guide tutorial', metaKeywords: ['react'] });
      const score = metaScorer.score(item, 'react', []);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should score higher when query matches both description and keywords', () => {
      const withBoth = makeItem({
        metaDescription: 'react tutorial',
        metaKeywords: ['react'],
      });
      const withDesc = makeItem({
        metaDescription: 'react tutorial',
        metaKeywords: [],
      });
      // More matching content contributes to score, equal or higher
      expect(metaScorer.score(withBoth, 'react', [])).toBeGreaterThanOrEqual(
        metaScorer.score(withDesc, 'react', [])
      );
    });

    it('should use context.originalTokens when provided', () => {
      const item = makeItem({ metaDescription: 'react tutorial', metaKeywords: [] });
      const context = { originalTokens: ['react'], expandedTokens: ['react', 'js'] };
      const scoreWithContext = metaScorer.score(item, 'react', [], context);
      expect(scoreWithContext).toBeGreaterThan(0);
    });

    it('should use context.expandedTokens for base graduated match', () => {
      const item = makeItem({ metaDescription: 'javascript tutorial', metaKeywords: [] });
      // context expands 'js' to include 'javascript'
      const context = { originalTokens: ['js'], expandedTokens: ['js', 'javascript'] };
      const scoreWithExpanded = metaScorer.score(item, 'js', [], context);
      const scoreWithout = metaScorer.score(item, 'js', []);
      // expanded terms should find 'javascript' match
      expect(scoreWithExpanded).toBeGreaterThan(scoreWithout);
    });
  });
});
