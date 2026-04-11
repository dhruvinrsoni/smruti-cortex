// Tests for search-debug.ts — SearchDebugService

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

vi.mock('../../core/logger', () => mockLogger());

// Stub localStorage before module load
const localStorageStore: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { localStorageStore[key] = val; }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }),
});

import { searchDebugService, type SearchDebugEntry } from '../search-debug';

function makeEntry(overrides?: Partial<Omit<SearchDebugEntry, 'timestamp' | 'sessionId'>>): Omit<SearchDebugEntry, 'timestamp' | 'sessionId'> {
  return {
    query: 'test query',
    queryLength: 10,
    resultCount: 5,
    results: [],
    performance: {
      searchDuration: 10,
      scoringDuration: 5,
      filteringDuration: 2,
      totalDuration: 17,
    },
    settings: {
      strictMode: false,
      diverseResults: true,
      aiEnabled: false,
      semanticEnabled: false,
    },
    metadata: {
      totalHistoryItems: 100,
      cacheHits: 3,
      cacheMisses: 1,
    },
    ...overrides,
  };
}

describe('SearchDebugService', () => {
  beforeEach(() => {
    searchDebugService.clearHistory();
    searchDebugService.setEnabled(false);
    vi.clearAllMocks();
  });

  describe('setEnabled / isEnabled', () => {
    it('defaults to disabled', () => {
      expect(searchDebugService.isEnabled()).toBe(false);
    });

    it('enables when setEnabled(true)', () => {
      searchDebugService.setEnabled(true);
      expect(searchDebugService.isEnabled()).toBe(true);
    });

    it('disables when setEnabled(false)', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.setEnabled(false);
      expect(searchDebugService.isEnabled()).toBe(false);
    });
  });

  describe('logSearch', () => {
    it('does not record when disabled', () => {
      searchDebugService.setEnabled(false);
      searchDebugService.logSearch(makeEntry());
      expect(searchDebugService.getHistory()).toHaveLength(0);
    });

    it('records entry when enabled', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'hello world' }));
      expect(searchDebugService.getHistory()).toHaveLength(1);
    });

    it('records multiple entries', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'first' }));
      searchDebugService.logSearch(makeEntry({ query: 'second' }));
      expect(searchDebugService.getHistory()).toHaveLength(2);
    });

    it('adds timestamp and sessionId to logged entry', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'timed' }));
      const history = searchDebugService.getHistory();
      expect(history[0].timestamp).toBeGreaterThan(0);
      expect(typeof history[0].sessionId).toBe('string');
      expect(history[0].sessionId.startsWith('session_')).toBe(true);
    });
  });

  describe('getHistory', () => {
    it('returns empty array when no entries', () => {
      expect(searchDebugService.getHistory()).toEqual([]);
    });

    it('returns a copy (not the internal reference)', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry());
      const h1 = searchDebugService.getHistory();
      const h2 = searchDebugService.getHistory();
      expect(h1).not.toBe(h2);
    });
  });

  describe('getSessionHistory', () => {
    it('returns subset from same session', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'session search' }));
      const sessionHistory = searchDebugService.getSessionHistory();
      expect(sessionHistory).toHaveLength(1);
    });
  });

  describe('getAnalytics', () => {
    it('returns zeros for empty history', () => {
      const analytics = searchDebugService.getAnalytics();
      expect(analytics.totalSearches).toBe(0);
      expect(analytics.averageResultCount).toBe(0);
      expect(analytics.averageSearchDuration).toBe(0);
      expect(analytics.topQueries).toEqual([]);
      expect(analytics.queryLengthDistribution).toEqual({});
    });

    it('calculates analytics from logged entries', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'react', resultCount: 10, queryLength: 5,
        performance: { searchDuration: 20, scoringDuration: 10, filteringDuration: 5, totalDuration: 35 } }));
      searchDebugService.logSearch(makeEntry({ query: 'react', resultCount: 6, queryLength: 5,
        performance: { searchDuration: 15, scoringDuration: 8, filteringDuration: 3, totalDuration: 26 } }));
      const analytics = searchDebugService.getAnalytics();
      expect(analytics.totalSearches).toBe(2);
      expect(analytics.averageResultCount).toBe(8);
      expect(analytics.averageSearchDuration).toBe(30.5);
    });

    it('includes top queries by frequency', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'react' }));
      searchDebugService.logSearch(makeEntry({ query: 'react' }));
      searchDebugService.logSearch(makeEntry({ query: 'vue' }));
      const analytics = searchDebugService.getAnalytics();
      expect(analytics.topQueries[0].query).toBe('react');
      expect(analytics.topQueries[0].count).toBe(2);
    });

    it('includes queryLengthDistribution', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'hello', queryLength: 5 }));
      searchDebugService.logSearch(makeEntry({ query: 'world', queryLength: 5 }));
      searchDebugService.logSearch(makeEntry({ query: 'greetings', queryLength: 9 }));
      const analytics = searchDebugService.getAnalytics();
      expect(analytics.queryLengthDistribution[5]).toBe(2);
      expect(analytics.queryLengthDistribution[9]).toBe(1);
    });
  });

  describe('clearHistory', () => {
    it('resets history to empty', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry());
      searchDebugService.clearHistory();
      expect(searchDebugService.getHistory()).toHaveLength(0);
    });
  });

  describe('exportDebugData', () => {
    it('returns valid JSON', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'export test' }));
      const json = searchDebugService.exportDebugData();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('exported data contains history and analytics', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'export test' }));
      const data = JSON.parse(searchDebugService.exportDebugData());
      expect(data.history).toBeDefined();
      expect(data.analytics).toBeDefined();
      expect(data.sessionId).toBeDefined();
    });
  });

  describe('findByQuery', () => {
    it('returns empty array when no match', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'python' }));
      expect(searchDebugService.findByQuery('react')).toHaveLength(0);
    });

    it('returns matching entries', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'react hooks' }));
      searchDebugService.logSearch(makeEntry({ query: 'python guide' }));
      const found = searchDebugService.findByQuery('react');
      expect(found).toHaveLength(1);
      expect(found[0].query).toBe('react hooks');
    });

    it('is case-insensitive', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ query: 'React Tutorial' }));
      expect(searchDebugService.findByQuery('react')).toHaveLength(1);
    });
  });

  describe('findSlowSearches', () => {
    it('returns entries exceeding threshold', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({
        performance: { searchDuration: 50, scoringDuration: 30, filteringDuration: 20, totalDuration: 200 },
      }));
      searchDebugService.logSearch(makeEntry({
        performance: { searchDuration: 10, scoringDuration: 5, filteringDuration: 3, totalDuration: 18 },
      }));
      expect(searchDebugService.findSlowSearches(100)).toHaveLength(1);
    });

    it('defaults to 100ms threshold', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({
        performance: { searchDuration: 60, scoringDuration: 30, filteringDuration: 20, totalDuration: 150 },
      }));
      expect(searchDebugService.findSlowSearches()).toHaveLength(1);
    });
  });

  describe('findZeroResults', () => {
    it('returns entries with zero results', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ resultCount: 0 }));
      searchDebugService.logSearch(makeEntry({ resultCount: 5 }));
      expect(searchDebugService.findZeroResults()).toHaveLength(1);
    });

    it('returns empty when all have results', () => {
      searchDebugService.setEnabled(true);
      searchDebugService.logSearch(makeEntry({ resultCount: 3 }));
      expect(searchDebugService.findZeroResults()).toHaveLength(0);
    });
  });
});
