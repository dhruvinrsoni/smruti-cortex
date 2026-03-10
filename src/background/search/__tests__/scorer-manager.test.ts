// Tests for scorer-manager.ts — crossDimensionalScorer, multiTokenMatchScorer, domainFamiliarityScorer, getAllScorers

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../core/logger', () => ({
  Logger: {
    info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
    forComponent: () => ({
      info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
}));

const mockGetSetting = vi.fn();
vi.mock('../../../core/settings', () => ({
  SettingsManager: { getSetting: (...args: unknown[]) => mockGetSetting(...args) },
}));

// Mock the embedding scorer dependency
vi.mock('../scorers/embedding-scorer', () => ({
  default: {
    name: 'embedding',
    weight: 0.4,
    score: vi.fn().mockReturnValue(0),
  },
}));

import { getAllScorers } from '../scorer-manager';
import type { IndexedItem } from '../../schema';
import type { ScorerContext } from '../../../core/scorer-types';

function makeItem(overrides?: Partial<IndexedItem>): IndexedItem {
  return {
    url: 'https://example.com/article',
    title: 'Test Article',
    hostname: 'example.com',
    visitCount: 1,
    lastVisit: Date.now(),
    tokens: ['test'],
    ...overrides,
  } as IndexedItem;
}

function makeContext(overrides?: Partial<ScorerContext>): ScorerContext {
  return {
    originalTokens: ['test'],
    expandedTokens: ['test'],
    domainVisitCounts: new Map(),
    ...overrides,
  };
}

describe('getAllScorers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSetting.mockReturnValue(false);
  });

  it('returns an array of scorers', () => {
    const scorers = getAllScorers();
    expect(Array.isArray(scorers)).toBe(true);
    expect(scorers.length).toBeGreaterThan(0);
  });

  it('returns 9 scorers', () => {
    const scorers = getAllScorers();
    expect(scorers).toHaveLength(9);
  });

  it('includes expected scorer names', () => {
    const scorers = getAllScorers();
    const names = scorers.map(s => s.name);
    expect(names).toContain('multiTokenMatch');
    expect(names).toContain('title');
    expect(names).toContain('url');
    expect(names).toContain('crossDimensional');
    expect(names).toContain('recency');
    expect(names).toContain('visitCount');
    expect(names).toContain('meta');
    expect(names).toContain('domainFamiliarity');
  });

  it('disables embedding scorer weight when embeddingsEnabled is false', () => {
    mockGetSetting.mockReturnValue(false);
    const scorers = getAllScorers();
    const embeddingScorer = scorers.find(s => s.name === 'embedding');
    expect(embeddingScorer).toBeDefined();
    expect(embeddingScorer?.weight).toBe(0.0);
  });

  it('enables embedding scorer weight when embeddingsEnabled is true', () => {
    mockGetSetting.mockReturnValue(true);
    const scorers = getAllScorers();
    const embeddingScorer = scorers.find(s => s.name === 'embedding');
    expect(embeddingScorer).toBeDefined();
    expect(embeddingScorer?.weight).toBe(0.4);
  });

  it('all scorers have name, weight, and score function', () => {
    const scorers = getAllScorers();
    for (const scorer of scorers) {
      expect(typeof scorer.name).toBe('string');
      expect(typeof scorer.weight).toBe('number');
      expect(typeof scorer.score).toBe('function');
    }
  });

  it('calls SettingsManager.getSetting with embeddingsEnabled', () => {
    getAllScorers();
    expect(mockGetSetting).toHaveBeenCalledWith('embeddingsEnabled');
  });
});

describe('multiTokenMatchScorer (via getAllScorers)', () => {
  beforeEach(() => {
    mockGetSetting.mockReturnValue(false);
  });

  function getMultiTokenScorer() {
    return getAllScorers().find(s => s.name === 'multiTokenMatch')!;
  }

  it('returns 0 for single token', () => {
    const scorer = getMultiTokenScorer();
    const item = makeItem({ title: 'javascript', url: 'https://example.com/js' });
    const ctx = makeContext({ originalTokens: ['javascript'], expandedTokens: ['javascript'] });
    expect(scorer.score(item, 'javascript', [], ctx)).toBe(0);
  });

  it('returns positive score when multiple tokens match', () => {
    const scorer = getMultiTokenScorer();
    const item = makeItem({ title: 'javascript tutorial', url: 'https://example.com' });
    const ctx = makeContext({ originalTokens: ['javascript', 'tutorial'], expandedTokens: ['javascript', 'tutorial'] });
    expect(scorer.score(item, 'javascript tutorial', [], ctx)).toBeGreaterThan(0);
  });

  it('returns 0 when tokens do not match item', () => {
    const scorer = getMultiTokenScorer();
    const item = makeItem({ title: 'python guide', url: 'https://example.com/python' });
    const ctx = makeContext({ originalTokens: ['javascript', 'tutorial'], expandedTokens: ['javascript', 'tutorial'] });
    expect(scorer.score(item, 'javascript tutorial', [], ctx)).toBe(0);
  });

  it('score is capped at 1.0', () => {
    const scorer = getMultiTokenScorer();
    const item = makeItem({
      title: 'javascript javascript javascript tutorial tutorial',
      url: 'https://example.com/javascript-tutorial',
    });
    const ctx = makeContext({ originalTokens: ['javascript', 'tutorial'], expandedTokens: ['javascript', 'tutorial'] });
    const score = scorer.score(item, 'javascript tutorial', [], ctx);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('handles item without context (uses query tokenization)', () => {
    const scorer = getMultiTokenScorer();
    const item = makeItem({ title: 'react hooks tutorial', url: 'https://example.com' });
    const score = scorer.score(item, 'react tutorial', []);
    // No context provided — should still compute based on query
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('crossDimensionalScorer (via getAllScorers)', () => {
  beforeEach(() => {
    mockGetSetting.mockReturnValue(false);
  });

  function getCrossScorer() {
    return getAllScorers().find(s => s.name === 'crossDimensional')!;
  }

  it('returns 0 when fewer than 2 search tokens', () => {
    const scorer = getCrossScorer();
    const item = makeItem({ title: 'react hooks', url: 'https://example.com/react' });
    const ctx = makeContext({ originalTokens: ['react'], expandedTokens: ['react'] });
    expect(scorer.score(item, 'react', [], ctx)).toBe(0);
  });

  it('returns positive score when tokens match across dimensions', () => {
    const scorer = getCrossScorer();
    // "react" in title, "github" in URL
    const item = makeItem({
      title: 'react components',
      url: 'https://github.com/user/repo',
      hostname: 'github.com',
    });
    const ctx = makeContext({
      originalTokens: ['react', 'github'],
      expandedTokens: ['react', 'github'],
    });
    expect(scorer.score(item, 'react github', [], ctx)).toBeGreaterThan(0);
  });

  it('returns 0 when tokens do not match item at all', () => {
    const scorer = getCrossScorer();
    const item = makeItem({ title: 'python guide', url: 'https://docs.python.org', hostname: 'docs.python.org' });
    const ctx = makeContext({ originalTokens: ['javascript', 'react'], expandedTokens: ['javascript', 'react'] });
    expect(scorer.score(item, 'javascript react', [], ctx)).toBe(0);
  });

  it('score is capped at 1.0', () => {
    const scorer = getCrossScorer();
    const item = makeItem({
      title: 'javascript react',
      url: 'https://javascript.react.com/javascript-react',
      hostname: 'javascript.react.com',
    });
    const ctx = makeContext({ originalTokens: ['javascript', 'react'], expandedTokens: ['javascript', 'react'] });
    const score = scorer.score(item, 'javascript react', [], ctx);
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('domainFamiliarityScorer (via getAllScorers)', () => {
  beforeEach(() => {
    mockGetSetting.mockReturnValue(false);
  });

  function getDomainScorer() {
    return getAllScorers().find(s => s.name === 'domainFamiliarity')!;
  }

  it('returns 0 when no hostname on item', () => {
    const scorer = getDomainScorer();
    const item = makeItem({ hostname: '' });
    const ctx = makeContext({ domainVisitCounts: new Map() });
    expect(scorer.score(item, 'test', [], ctx)).toBe(0);
  });

  it('returns 0 when domain has no visits', () => {
    const scorer = getDomainScorer();
    const item = makeItem({ hostname: 'example.com' });
    const ctx = makeContext({ domainVisitCounts: new Map() });
    expect(scorer.score(item, 'test', [], ctx)).toBe(0);
  });

  it('returns positive score for familiar domain', () => {
    const scorer = getDomainScorer();
    const item = makeItem({ hostname: 'github.com' });
    const counts = new Map<string, number>([['github.com', 50]]);
    const ctx = makeContext({ domainVisitCounts: counts });
    expect(scorer.score(item, 'test', [], ctx)).toBeGreaterThan(0);
  });

  it('score is capped at 0.2', () => {
    const scorer = getDomainScorer();
    const item = makeItem({ hostname: 'github.com' });
    const counts = new Map<string, number>([['github.com', 99999]]);
    const ctx = makeContext({ domainVisitCounts: counts });
    expect(scorer.score(item, 'test', [], ctx)).toBeLessThanOrEqual(0.2);
  });

  it('uses logarithmic scale (higher visits = higher score but diminishing returns)', () => {
    const scorer = getDomainScorer();
    const item1 = makeItem({ hostname: 'low.com' });
    const item2 = makeItem({ hostname: 'high.com' });
    // Use 1 visit (score ~0.177) vs 2 visits (score ~0.281 capped at 0.2)
    // This shows score grows with visits until cap (0.2)
    const counts = new Map<string, number>([['low.com', 1], ['high.com', 2]]);
    const ctx1 = makeContext({ domainVisitCounts: counts });
    expect(scorer.score(item2, 'test', [], ctx1)).toBeGreaterThan(scorer.score(item1, 'test', [], ctx1));
  });

  it('returns 0 when no context provided', () => {
    const scorer = getDomainScorer();
    const item = makeItem({ hostname: 'github.com' });
    expect(scorer.score(item, 'test', [])).toBe(0);
  });
});
