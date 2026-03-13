/**
 * Tests for ai-scorer-placeholder.ts
 * Validates the placeholder scorer exports correct structure with weight=0
 */

import { describe, it, expect } from 'vitest';
import aiScorer from '../ai-scorer-placeholder';

describe('ai-scorer-placeholder', () => {
  it('should have name "ai_scorer"', () => {
    expect(aiScorer.name).toBe('ai_scorer');
  });

  it('should have weight 0 (disabled)', () => {
    expect(aiScorer.weight).toBe(0);
  });

  it('should always return score 0', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(aiScorer.score('test', {} as any, {} as any)).toBe(0);
  });

  it('should conform to Scorer interface', () => {
    expect(typeof aiScorer.name).toBe('string');
    expect(typeof aiScorer.weight).toBe('number');
    expect(typeof aiScorer.score).toBe('function');
  });
});
