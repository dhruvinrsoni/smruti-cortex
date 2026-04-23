// ─────────────────────────────────────────────────────────────────────────────
// Boundary-flex integration tests for search-engine.runSearch
// ─────────────────────────────────────────────────────────────────────────────
// Unlike search-engine.test.ts (which mocks the tokenizer to stay focused on
// pipeline mechanics), this file uses the REAL tokenizer so the full
// classifyMatch → haystack-gate → tier-0 sort chain is exercised end-to-end.
//
// These tests lock the contract expressed in
//   docs/adr/0001-search-matching-contract.md
// and guard the user-facing symptom that motivated the fix: a query like
// `tracker module42` must rank a `Module 42` title above a same-domain
// sibling that only matches one token.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, makeItem } from '../../../__test-utils__';
import type { IndexedItem } from '../../schema';
import type { SearchDebugSnapshot } from '../../diagnostics';

vi.mock('../../../core/logger', () => mockLogger());

const settingsMap: Record<string, unknown> = {
  ollamaEnabled: false,
  embeddingsEnabled: false,
  showNonMatchingResults: false,
  showDuplicateUrls: false,
  sortBy: 'best-match',
};
vi.mock('../../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn((key: string) => settingsMap[key]),
    init: vi.fn(),
  },
}));

const indexedItems: IndexedItem[] = [];
vi.mock('../../database', () => ({
  getAllIndexedItems: vi.fn(async () => indexedItems),
  loadEmbeddingsInto: vi.fn(async () => 0),
  saveIndexedItem: vi.fn(),
}));

// Neutral scorer that gives a tiny same-score baseline to every item. The
// point of these tests is the INCLUSION GATE + TIER-0 SORT, not the scoring
// weights — so we keep the scorer flat and let `originalMatchCount` drive
// the ranking exactly as it does in production.
vi.mock('../scorer-manager', () => ({
  getAllScorers: vi.fn(() => [
    {
      name: 'flat',
      weight: 1.0,
      score: vi.fn(() => 0.5),
    },
  ]),
}));

vi.mock('../../../core/helpers', () => ({
  browserAPI: {
    history: {
      search: vi.fn((_query: unknown, cb: (results: unknown[]) => void) => cb([])),
    },
  },
}));

vi.mock('../../ai-keyword-expander', () => ({
  expandQueryKeywords: vi.fn(async (query: string) =>
    query.split(/\s+/).filter((t: string) => t.length > 0)
  ),
  getLastExpansionSource: vi.fn(() => 'disabled'),
}));

vi.mock('../diversity-filter', () => ({
  applyDiversityFilter: vi.fn((items: unknown[]) => items),
}));

vi.mock('../../performance-monitor', () => ({
  performanceTracker: { recordSearch: vi.fn() },
}));

vi.mock('../query-expansion', () => ({
  getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
}));

const snapshots: SearchDebugSnapshot[] = [];
vi.mock('../../diagnostics', () => ({
  recordSearchDebug: vi.fn(),
  recordSearchSnapshot: vi.fn((snap: SearchDebugSnapshot) => {
    snapshots.push(snap);
  }),
}));

const mockCache = {
  get: vi.fn(() => null),
  set: vi.fn(),
};
vi.mock('../search-cache', () => ({
  getSearchCache: vi.fn(() => mockCache),
}));

vi.mock('../../embedding-processor', () => ({
  embeddingProcessor: {
    setSearchActive: vi.fn(),
  },
}));

vi.mock('../../embedding-text', () => ({
  buildEmbeddingText: vi.fn(() => 'test text'),
}));

vi.mock('../../ollama-service', () => ({
  isCircuitBreakerOpen: vi.fn(() => true),
  checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
  getOllamaConfigFromSettings: vi.fn(async () => ({})),
  getOllamaService: vi.fn(() => ({
    generateEmbedding: vi.fn(async () => ({ success: false, embedding: [], error: 'mocked' })),
  })),
  acquireOllamaSlot: vi.fn(() => true),
  releaseOllamaSlot: vi.fn(),
}));

vi.mock('../../../core/scorer-types', () => ({}));

// Deliberately NOT mocking '../tokenizer' — the whole point is that
// runSearch exercises the real classifyMatch including boundary-flex.

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function seedTrackerScenario(): { targetUrl: string } {
  const targetUrl = 'https://tracker.example.com/ticket/ID-1234';
  indexedItems.push(
    // Target: matches both query tokens via boundary-flex (`module42` vs "Module 42")
    makeItem({
      url: targetUrl,
      title: '[ID-1234] Module 42 Review - Acme Tracker',
      hostname: 'tracker.example.com',
      visitCount: 2,
      lastVisit: NOW - 10 * DAY_MS,
      tokens: ['id', '1234', 'module', '42', 'review', 'acme', 'tracker'],
    }),
    // Sibling 1: same domain, hot (frequently visited) — matches only `tracker`
    makeItem({
      url: 'https://tracker.example.com/boards/1',
      title: 'Agile Board - Acme Tracker',
      hostname: 'tracker.example.com',
      visitCount: 50,
      lastVisit: NOW,
      tokens: ['agile', 'board', 'acme', 'tracker'],
    }),
    // Sibling 2: different domain, hot — matches only via hostname contain of "module42"
    makeItem({
      url: 'https://module42.example.com/learn',
      title: 'Learn',
      hostname: 'module42.example.com',
      visitCount: 40,
      lastVisit: NOW,
      tokens: ['learn'],
    }),
  );
  return { targetUrl };
}

describe('search-engine: boundary-flex integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    indexedItems.length = 0;
    snapshots.length = 0;
    mockCache.get.mockReturnValue(null);
    settingsMap.ollamaEnabled = false;
    settingsMap.embeddingsEnabled = false;
    settingsMap.showNonMatchingResults = false;
    settingsMap.showDuplicateUrls = false;
  });

  it('ranks 2/2 boundary-flex match above 1/2 matches (tracker / module42 scenario)', async () => {
    const { targetUrl } = seedTrackerScenario();
    const { runSearch } = await import('../search-engine');

    const results = await runSearch('tracker module42', { skipAI: true });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].url).toBe(targetUrl);

    // Last snapshot carries originalMatchCount for every ranked item.
    const snap = snapshots.at(-1);
    expect(snap).toBeDefined();
    const targetEntry = snap!.results.find((r) => r.url === targetUrl);
    expect(targetEntry).toBeDefined();
    expect(targetEntry!.originalMatchCount).toBe(2);
    expect(targetEntry!.rank).toBe(1);
  });

  const SEPARATOR_MATRIX: Array<[string, string]> = [
    ['Module 42', 'https://tracker.example.com/ticket/space'],
    ['Module-42', 'https://tracker.example.com/ticket/hyphen'],
    ['Module_42', 'https://tracker.example.com/ticket/underscore'],
    ['Module.42', 'https://tracker.example.com/ticket/dot'],
    ['Module/42', 'https://tracker.example.com/ticket/slash'],
  ];

  it.each(SEPARATOR_MATRIX)(
    'counts 2/2 matches when separator between letters and digits is in "%s"',
    async (title, url) => {
      indexedItems.push(
        makeItem({
          url,
          title: `${title} Review - Acme Tracker`,
          hostname: 'tracker.example.com',
          visitCount: 1,
          lastVisit: NOW,
        }),
      );
      const { runSearch } = await import('../search-engine');
      const results = await runSearch('tracker module42', { skipAI: true });

      expect(results.length).toBe(1);
      expect(results[0].url).toBe(url);
      const snap = snapshots.at(-1);
      expect(snap!.results[0].originalMatchCount).toBe(2);
    },
  );

  it('does NOT false-match pure-letter token "foobar" against "foo bar" content', async () => {
    indexedItems.push(
      makeItem({
        url: 'https://example.com/foo-bar',
        title: 'Foo Bar Gazette',
        hostname: 'example.com',
        visitCount: 5,
        lastVisit: NOW,
        tokens: ['foo', 'bar', 'gazette'],
      }),
      makeItem({
        url: 'https://example.com/foobar',
        title: 'Foobar Central',
        hostname: 'example.com',
        visitCount: 1,
        lastVisit: NOW,
        tokens: ['foobar', 'central'],
      }),
    );

    const { runSearch } = await import('../search-engine');
    const results = await runSearch('foobar', { skipAI: true });

    // Only the clean "Foobar Central" item should be included; the "Foo Bar"
    // item must NOT be promoted by boundary-flex (pure-letter token).
    expect(results.length).toBe(1);
    expect(results[0].url).toBe('https://example.com/foobar');
  });

  it('does NOT accept multi-char separators ("module -- 42" stays unmatched)', async () => {
    indexedItems.push(
      makeItem({
        url: 'https://tracker.example.com/wide-gap',
        title: 'Module -- 42 Overview',
        hostname: 'tracker.example.com',
        visitCount: 1,
        lastVisit: NOW,
      }),
    );

    const { runSearch } = await import('../search-engine');
    const results = await runSearch('module42', { skipAI: true });

    // With a multi-char separator between the letter and digit runs,
    // boundary-flex must NOT engage; the haystack also has no literal
    // "module42" substring, so the item is filtered out.
    expect(results.length).toBe(0);
  });
});
