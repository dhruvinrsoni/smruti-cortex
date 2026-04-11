import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeItem as makeItemBase } from '../../../../__test-utils__';
import visitCountScorer from '../visitcount-scorer';

function makeItem(visitCount: number) {
  return makeItemBase({ visitCount });
}

describe('visitCountScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('score calculation', () => {
    it('should use count of 1 when visitCount is 0', () => {
      // count = item.visitCount || 1 → count=1
      const item = makeItem(0);
      // log(2)/log(20) ≈ 0.231
      expect(visitCountScorer.score(item, '', [])).toBeCloseTo(Math.log(2) / Math.log(20), 5);
    });

    it('should compute log(count+1)/log(20) for count=1', () => {
      const item = makeItem(1);
      const expected = Math.log(2) / Math.log(20);
      expect(visitCountScorer.score(item, '', [])).toBeCloseTo(expected, 5);
    });

    it('should return 1.0 for visitCount=19 (log(20)/log(20)=1)', () => {
      const item = makeItem(19);
      expect(visitCountScorer.score(item, '', [])).toBeCloseTo(1.0, 5);
    });

    it('should cap score at 1.0 for very high visitCount', () => {
      const item = makeItem(1000);
      expect(visitCountScorer.score(item, '', [])).toBe(1.0);
    });

    it('should return value in [0, 1] range', () => {
      const counts = [0, 1, 5, 10, 19, 50, 500];
      for (const visitCount of counts) {
        const score = visitCountScorer.score(makeItem(visitCount), '', []);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should produce increasing scores for higher visit counts', () => {
      const score1 = visitCountScorer.score(makeItem(1), '', []);
      const score5 = visitCountScorer.score(makeItem(5), '', []);
      const score10 = visitCountScorer.score(makeItem(10), '', []);
      expect(score1).toBeLessThan(score5);
      expect(score5).toBeLessThan(score10);
    });

    it('should correctly score visitCount=5: log(6)/log(20)', () => {
      const item = makeItem(5);
      const expected = Math.log(6) / Math.log(20);
      expect(visitCountScorer.score(item, '', [])).toBeCloseTo(expected, 5);
    });
  });
});
