import { describe, it, expect, beforeEach } from 'vitest';
import {
  tokenize,
  classifyMatch,
  classifyTokenMatches,
  graduatedMatchScore,
  matchPosition,
  countConsecutiveMatches,
  isExactKeywordMatch,
  countExactKeywordMatches,
  MATCH_WEIGHTS,
} from '../tokenizer';

// MatchType const enum values (inlined for test assertions)
const MATCH_NONE = 0;
const MATCH_SUBSTRING = 1;
const MATCH_PREFIX = 2;
const MATCH_EXACT = 3;

describe('tokenize', () => {
  it('should lowercase the input', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('should replace special characters with spaces', () => {
    expect(tokenize('foo!bar@baz')).toEqual(['foo', 'bar', 'baz']);
  });

  it('should preserve dots, dashes, and slashes', () => {
    const result = tokenize('example.com/foo-bar');
    expect(result).toContain('example.com/foo-bar');
  });

  it('should filter out empty tokens', () => {
    expect(tokenize('  hello   world  ')).toEqual(['hello', 'world']);
  });

  it('should return empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('should return empty array for whitespace-only string', () => {
    expect(tokenize('   ')).toEqual([]);
  });

  it('should handle alphanumeric with numbers', () => {
    expect(tokenize('node12 react18')).toEqual(['node12', 'react18']);
  });
});

describe('MATCH_WEIGHTS', () => {
  it('should be ordered NONE < SUBSTRING < PREFIX < EXACT', () => {
    expect(MATCH_WEIGHTS[MATCH_NONE]).toBeLessThan(MATCH_WEIGHTS[MATCH_SUBSTRING]);
    expect(MATCH_WEIGHTS[MATCH_SUBSTRING]).toBeLessThan(MATCH_WEIGHTS[MATCH_PREFIX]);
    expect(MATCH_WEIGHTS[MATCH_PREFIX]).toBeLessThan(MATCH_WEIGHTS[MATCH_EXACT]);
  });
});

describe('classifyMatch', () => {
  describe('EXACT matches', () => {
    it('should return EXACT when token matches at word boundary', () => {
      expect(classifyMatch('app', 'My App Hub')).toBe(MATCH_EXACT);
    });

    it('should return EXACT for standalone word', () => {
      expect(classifyMatch('react', 'react docs')).toBe(MATCH_EXACT);
    });

    it('should return EXACT when token is the entire text', () => {
      expect(classifyMatch('github', 'github')).toBe(MATCH_EXACT);
    });

    it('should be case-insensitive for EXACT', () => {
      expect(classifyMatch('react', 'React Documentation')).toBe(MATCH_EXACT);
    });

    it('should return EXACT when separated by hyphen', () => {
      expect(classifyMatch('app', 'App-My-Hub')).toBe(MATCH_EXACT);
    });
  });

  describe('PREFIX matches', () => {
    it('should return PREFIX when token is at start of a word', () => {
      expect(classifyMatch('iss', 'Issue Tracker')).toBe(MATCH_PREFIX);
    });

    it('should return PREFIX when token matches start of word after boundary', () => {
      expect(classifyMatch('doc', 'documentation page')).toBe(MATCH_PREFIX);
    });
  });

  describe('SUBSTRING matches', () => {
    it('should return SUBSTRING when token is in middle of a word', () => {
      expect(classifyMatch('aviga', 'Navigation')).toBe(MATCH_SUBSTRING);
    });

    it('should return SUBSTRING for interior match only', () => {
      expect(classifyMatch('ull', 'pull request')).toBe(MATCH_SUBSTRING);
    });
  });

  describe('NONE matches', () => {
    it('should return NONE when token is not in text', () => {
      expect(classifyMatch('xyz', 'hello world')).toBe(MATCH_NONE);
    });

    it('should handle empty token in non-empty text without crashing', () => {
      const result = classifyMatch('', 'hello world');
      expect(typeof result).toBe('number');
    });
  });
});

describe('classifyTokenMatches', () => {
  it('should return EXACT for each token that exactly matches', () => {
    const result = classifyTokenMatches(['foo', 'bar'], 'foo and bar');
    expect(result).toEqual([MATCH_EXACT, MATCH_EXACT]);
  });

  it('should return array with mixed match types', () => {
    const result = classifyTokenMatches(['react', 'xyz'], 'react native');
    expect(result[0]).toBe(MATCH_EXACT);
    expect(result[1]).toBe(MATCH_NONE);
  });

  it('should return empty array for empty tokens', () => {
    expect(classifyTokenMatches([], 'hello world')).toEqual([]);
  });
});

describe('graduatedMatchScore', () => {
  it('should return 0 for empty tokens', () => {
    expect(graduatedMatchScore([], 'anything')).toBe(0);
  });

  it('should return 1.0 for all exact matches', () => {
    // single token exact match: weight 1.0 / 1 = 1.0
    expect(graduatedMatchScore(['foo'], 'foo bar')).toBe(1.0);
  });

  it('should return 0 for no matches', () => {
    expect(graduatedMatchScore(['xyz'], 'hello world')).toBe(0);
  });

  it('should compute average weight for mixed matches', () => {
    // token1 exact (1.0) + token2 none (0.0) → avg = 0.5
    const score = graduatedMatchScore(['react', 'zzz'], 'react docs');
    expect(score).toBeCloseTo(0.5);
  });

  it('should return value in [0, 1]', () => {
    const score = graduatedMatchScore(['react', 'docs'], 'react documentation');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should weight: 2 EXACT + 1 PREFIX out of 3 = (1+1+0.75)/3 ≈ 0.917', () => {
    // 'react' → EXACT in 'react is great', 'is' → EXACT, 'doc' → PREFIX (start of... hmm let me pick better)
    // Actually: 'react' exact, 'great' exact, 'doc' prefix in 'documentation'
    const score = graduatedMatchScore(['react', 'great', 'doc'], 'react is great documentation');
    expect(score).toBeCloseTo((1.0 + 1.0 + 0.75) / 3, 2);
  });
});

describe('matchPosition', () => {
  it('should return 0 when token is at start of text', () => {
    expect(matchPosition('hello', 'hello world')).toBe(0);
  });

  it('should return 1.0 when token is not found', () => {
    expect(matchPosition('xyz', 'hello world')).toBe(1.0);
  });

  it('should return a value between 0 and 1 for mid-string match', () => {
    const pos = matchPosition('world', 'hello world');
    expect(pos).toBeGreaterThan(0);
    expect(pos).toBeLessThan(1);
  });

  it('should be case-insensitive', () => {
    const pos1 = matchPosition('HELLO', 'hello world');
    const pos2 = matchPosition('hello', 'hello world');
    expect(pos1).toBe(pos2);
  });

  it('should return 1.0 for empty text', () => {
    expect(matchPosition('hello', '')).toBe(1.0);
  });
});

describe('countConsecutiveMatches', () => {
  it('should return 0 for fewer than 2 tokens', () => {
    expect(countConsecutiveMatches(['only'], 'only word here')).toBe(0);
  });

  it('should return 0 for empty tokens', () => {
    expect(countConsecutiveMatches([], 'anything')).toBe(0);
  });

  it('should count consecutive pair in adjacent words', () => {
    // "hello world" → "hello" then "world" adjacent → 1 consecutive pair
    expect(countConsecutiveMatches(['hello', 'world'], 'hello world')).toBe(1);
  });

  it('should count consecutive pairs in hyphenated text', () => {
    // "app-my-hub" → app then my are adjacent → 1 pair; my then hub → 1 pair
    expect(countConsecutiveMatches(['app', 'my', 'hub'], 'App-My-Hub')).toBe(2);
  });

  it('should return 0 when tokens are not consecutive', () => {
    const count = countConsecutiveMatches(['alpha', 'omega'], 'alpha beta gamma omega');
    expect(count).toBe(0);
  });
});

describe('isExactKeywordMatch (deprecated)', () => {
  it('should return true for exact word boundary match', () => {
    expect(isExactKeywordMatch('react', 'react docs')).toBe(true);
  });

  it('should return false when no match', () => {
    expect(isExactKeywordMatch('xyz', 'react docs')).toBe(false);
  });

  it('should return false for substring-only match', () => {
    expect(isExactKeywordMatch('aviga', 'navigation')).toBe(false);
  });
});

describe('countExactKeywordMatches (deprecated)', () => {
  it('should count how many tokens have exact matches', () => {
    expect(countExactKeywordMatches(['react', 'docs', 'xyz'], 'react docs page')).toBe(2);
  });

  it('should return 0 when no tokens match', () => {
    expect(countExactKeywordMatches(['alpha', 'beta'], 'gamma delta')).toBe(0);
  });

  it('should return 0 for empty tokens', () => {
    expect(countExactKeywordMatches([], 'hello world')).toBe(0);
  });
});
