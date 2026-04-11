import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, makeItem } from '../../../../__test-utils__';

vi.mock('../../../../core/logger', () => mockLogger());

import titleScorer from '../title-scorer';

describe('titleScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('score calculation', () => {
    it('should return 0 when query tokenizes to empty', () => {
      const item = makeItem({ title: 'React Documentation' });
      expect(titleScorer.score(item, '', [])).toBe(0);
    });

    it('should return 0 when title is empty and no match', () => {
      const item = makeItem({ title: '' });
      const score = titleScorer.score(item, 'react', []);
      expect(score).toBe(0);
    });

    it('should return positive score for matching title', () => {
      const item = makeItem({ title: 'React Documentation' });
      expect(titleScorer.score(item, 'react', [])).toBeGreaterThan(0);
    });

    it('should return score in [0, 1]', () => {
      const item = makeItem({ title: 'React - JavaScript Library' });
      const score = titleScorer.score(item, 'react javascript', []);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return higher score for exact match than partial match', () => {
      // Use many non-matching tokens so scores stay well below 1.0 cap,
      // making the difference between exact (weight=1.0) and prefix (weight=0.75) visible.
      const item = makeItem({ title: 'react basic tutorial' });

      // 'react' exact match (weight 1.0), rest not found → diluted average stays low
      const exactScore = titleScorer.score(item, 'react nope zzz qq mm', []);
      // 'reac' prefix match (weight 0.75), rest not found → same dilution but lower weight
      const prefixScore = titleScorer.score(item, 'reac nope zzz qq mm', []);
      expect(exactScore).toBeGreaterThan(prefixScore);
    });

    it('should score higher when all query tokens match', () => {
      const item = makeItem({ title: 'react javascript tutorial guide' });
      const allMatch = titleScorer.score(item, 'react javascript', []);
      const oneMatch = titleScorer.score(item, 'react xyz', []);
      expect(allMatch).toBeGreaterThan(oneMatch);
    });

    it('should use bookmarkTitle over title when available', () => {
      const item = makeItem({ title: 'Wrong Page', bookmarkTitle: 'React Documentation' });
      const score = titleScorer.score(item, 'react', []);
      expect(score).toBeGreaterThan(0);
    });

    it('should give a high score when title starts with query token', () => {
      const item = makeItem({ title: 'react guide for beginners' });
      // 'react' starts this title → startsWithBonus of 0.08
      const score = titleScorer.score(item, 'react', []);
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should use context.expandedTokens when provided', () => {
      const item = makeItem({ title: 'javascript tutorial' });
      const context = { originalTokens: ['js'], expandedTokens: ['js', 'javascript'] };
      const scoreWithContext = titleScorer.score(item, 'js', [], context);
      const scoreWithout = titleScorer.score(item, 'js', []);
      // expanded terms include 'javascript', which matches title
      expect(scoreWithContext).toBeGreaterThan(scoreWithout);
    });

    it('should give bonus for consecutive token matches', () => {
      // "react docs" as two adjacent tokens in title
      const item = makeItem({ title: 'react docs tutorial' });
      const consecutiveScore = titleScorer.score(item, 'react docs', []);
      // non-consecutive: 'docs' is in title but 'react' is separate
      const nonConsecutiveItem = makeItem({ title: 'react tutorial docs' });
      const nonConsecutiveScore = titleScorer.score(nonConsecutiveItem, 'react docs', []);
      // consecutive version should score at least as high
      expect(consecutiveScore).toBeGreaterThanOrEqual(nonConsecutiveScore);
    });

    it('should return 1.0 for all-exact multi-token match (or cap at 1.0)', () => {
      const item = makeItem({ title: 'React Documentation' });
      // Both tokens exact match → composition bonus 0.25 + base etc → likely capped at 1.0
      const score = titleScorer.score(item, 'react documentation', []);
      expect(score).toBeLessThanOrEqual(1.0);
      expect(score).toBeGreaterThan(0.9);
    });
  });
});
