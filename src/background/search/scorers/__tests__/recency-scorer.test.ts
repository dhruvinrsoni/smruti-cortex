import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeItem } from '../../../../__test-utils__';
import recencyScorer from '../recency-scorer';

const NOW = 1_700_000_000_000; // fixed timestamp for determinism

describe('recencyScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('score calculation', () => {
    it('should return ~1.0 for an item visited right now', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const item = makeItem({ lastVisit: NOW });
      // diff = 0, days = 0, exp(0) = 1.0
      expect(recencyScorer.score(item, '', [])).toBeCloseTo(1.0, 5);
      vi.useRealTimers();
    });

    it('should return ~0.72 after 10 days (exp(-10/30))', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const tenDaysAgo = NOW - 10 * 24 * 60 * 60 * 1000;
      const item = makeItem({ lastVisit: tenDaysAgo });
      const expected = Math.exp(-10 / 30);
      expect(recencyScorer.score(item, '', [])).toBeCloseTo(expected, 4);
      vi.useRealTimers();
    });

    it('should return ~0.37 after 30 days (exp(-1) ≈ 0.368)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const thirtyDaysAgo = NOW - 30 * 24 * 60 * 60 * 1000;
      const item = makeItem({ lastVisit: thirtyDaysAgo });
      expect(recencyScorer.score(item, '', [])).toBeCloseTo(Math.exp(-1), 3);
      vi.useRealTimers();
    });

    it('should return a very small value after 180 days', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const farAgo = NOW - 180 * 24 * 60 * 60 * 1000;
      const item = makeItem({ lastVisit: farAgo });
      const score = recencyScorer.score(item, '', []);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(0.01);
      vi.useRealTimers();
    });

    it('should return score in [0, 1] range', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);

      const timestamps = [0, NOW - 60 * 60 * 1000, NOW - 30 * 24 * 60 * 60 * 1000, NOW];
      for (const lastVisit of timestamps) {
        const score = recencyScorer.score(makeItem({ lastVisit }), '', []);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
      vi.useRealTimers();
    });

    it('should return lower score for older visits', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);

      const recent = makeItem({ lastVisit: NOW - 1 * 24 * 60 * 60 * 1000 });
      const old = makeItem({ lastVisit: NOW - 30 * 24 * 60 * 60 * 1000 });

      expect(recencyScorer.score(recent, '', [])).toBeGreaterThan(recencyScorer.score(old, '', []));
      vi.useRealTimers();
    });
  });
});
