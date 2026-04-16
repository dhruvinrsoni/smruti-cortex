/**
 * Tests for ai-scorer-placeholder.ts
 * Validates the placeholder scorer exports correct structure with weight=0
 */

import { describe, it, expect } from 'vitest';
import aiScorer from '../ai-scorer-placeholder';

describe('ai-scorer-placeholder', () => {
  it('should always return score 0', () => {
     
    expect(aiScorer.score('test', {} as any, {} as any)).toBe(0);
  });
});
