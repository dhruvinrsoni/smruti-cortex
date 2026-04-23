// Tests for ranking-report.ts — ranking bug report generation

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, chromeMock, makeSnapshot as buildSnapshot } from '../../__test-utils__';

vi.mock('../../core/logger', () => mockLogger());

vi.mock('../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn((key: string) => {
      if (key === 'developerGithubPat') {return '';}
      return '';
    }),
    getSettings: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('../diagnostics', () => {
  let snapshot: unknown = null;
  return {
    getLastSearchSnapshot: () => snapshot,
    recordSearchSnapshot: (s: unknown) => { snapshot = s; },
    recordSearchDebug: vi.fn(),
  };
});

vi.stubGlobal('chrome', chromeMock().withRuntime().build());

import { generateRankingReport, createGitHubIssue, buildGitHubIssueUrl } from '../ranking-report';
import { SettingsManager } from '../../core/settings';
import { recordSearchSnapshot } from '../diagnostics';
import type { SearchDebugSnapshot } from '../diagnostics';

function makeSnapshot(overrides?: Partial<SearchDebugSnapshot>): SearchDebugSnapshot {
  return buildSnapshot({
    timestamp: Date.now(),
    query: 'wiki leave',
    tokens: ['wiki', 'leave'],
    aiExpandedKeywords: [],
    duration: 115.3,
    sortBy: 'best-match',
    showNonMatchingResults: false,
    showDuplicateUrls: false,
    ollamaEnabled: false,
    embeddingsEnabled: false,
    resultCount: 3,
    totalIndexedItems: 5000,
    results: [
      {
        rank: 1,
        url: 'https://wiki.example.com/pages/Leave',
        title: 'Leave Calendar - Wiki',
        hostname: 'wiki.example.com',
        finalScore: 0.92,
        originalMatchCount: 2,
        intentPriority: 3,
        titleUrlCoverage: 1,
        titleUrlQuality: 0.95,
        splitFieldCoverage: 1,
        keywordMatch: true,
        aiMatch: false,
        scorerBreakdown: [
          { name: 'multiTokenMatch', score: 0.30, weight: 0.35 },
          { name: 'title', score: 0.28, weight: 0.35 },
          { name: 'url', score: 0.08, weight: 0.12 },
        ],
      },
      {
        rank: 2,
        url: 'https://wiki.example.com/pages/Dashboard',
        title: 'Dashboard - Wiki',
        hostname: 'wiki.example.com',
        finalScore: 0.55,
        originalMatchCount: 1,
        intentPriority: 0,
        titleUrlCoverage: 0.5,
        titleUrlQuality: 0.5,
        splitFieldCoverage: 0,
        keywordMatch: true,
        aiMatch: false,
        scorerBreakdown: [
          { name: 'multiTokenMatch', score: 0.0, weight: 0.35 },
          { name: 'title', score: 0.20, weight: 0.35 },
          { name: 'url', score: 0.06, weight: 0.12 },
        ],
      },
      {
        rank: 3,
        url: 'https://login.example.com',
        title: 'Login',
        hostname: 'login.example.com',
        finalScore: 0.12,
        originalMatchCount: 0,
        intentPriority: 0,
        titleUrlCoverage: 0,
        titleUrlQuality: 0,
        splitFieldCoverage: 0,
        keywordMatch: false,
        aiMatch: false,
        scorerBreakdown: [
          { name: 'multiTokenMatch', score: 0, weight: 0.35 },
          { name: 'title', score: 0, weight: 0.35 },
          { name: 'url', score: 0, weight: 0.12 },
        ],
      },
    ],
    ...overrides,
  });
}

describe('generateRankingReport', () => {
  beforeEach(() => {
    recordSearchSnapshot(makeSnapshot());
  });

  it('returns null when no snapshot exists', () => {
    recordSearchSnapshot(null as unknown as SearchDebugSnapshot);
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report).toBeNull();
  });

  it('generates a report with correct metadata', () => {
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report).not.toBeNull();
    expect(report!.version).toBe('8.1.0');
    expect(report!.query).toBe('wiki leave');
    expect(report!.title).toContain('wiki leave');
    expect(report!.title).toContain('v8.1.0');
  });

  it('includes results table in body', () => {
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('| # | Title | Domain |');
    expect(report!.body).toContain('Leave Calendar');
    expect(report!.body).toContain('0.920');
  });

  it('includes scorer breakdown table', () => {
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('Scorer Breakdown');
    expect(report!.body).toContain('multiTokenMatch');
  });

  it('includes settings snapshot', () => {
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('| sortBy | best-match |');
    expect(report!.body).toContain('| showNonMatchingResults | false |');
    expect(report!.body).toContain('| ollamaEnabled | false |');
  });

  it('includes user note when provided', () => {
    const report = generateRankingReport({ maskingLevel: 'none', userNote: 'Leave pages should be first' });
    expect(report!.body).toContain('Leave pages should be first');
    expect(report!.body).toContain('### User Note');
  });

  it('applies partial masking to titles', () => {
    const report = generateRankingReport({ maskingLevel: 'partial' });
    expect(report!.body).toContain('**Leave**');
    expect(report!.body).toContain('**Wiki**');
    expect(report!.body).toContain('•');
    expect(report!.body).not.toContain('[MASKED]');
  });

  it('applies full masking to titles', () => {
    const report = generateRankingReport({ maskingLevel: 'full' });
    expect(report!.body).not.toContain('Calendar');
    expect(report!.body).not.toContain('Dashboard');
  });
});

describe('buildGitHubIssueUrl', () => {
  it('builds a valid GitHub issue URL', () => {
    recordSearchSnapshot(makeSnapshot());
    const report = generateRankingReport({ maskingLevel: 'partial' })!;
    const url = buildGitHubIssueUrl(report);
    expect(url).toContain('github.com/dhruvinrsoni/smruti-cortex/issues/new');
    expect(url).toContain('title=');
    expect(url).toContain('labels=');
  });

  it('does not exceed URL length limits', () => {
    const bigSnapshot = makeSnapshot();
    bigSnapshot.results = Array.from({ length: 50 }, (_, i) => ({
      rank: i + 1,
      url: `https://example.com/very/long/path/that/makes/the/url/longer/${i}`,
      title: `Very Long Title That Contains Many Words To Inflate The Size ${i}`,
      hostname: 'example.com',
      finalScore: 0.5,
      originalMatchCount: 1,
      intentPriority: 0,
      titleUrlCoverage: 0.5,
      titleUrlQuality: 0.5,
      splitFieldCoverage: 0,
      keywordMatch: true,
      aiMatch: false,
      scorerBreakdown: Array.from({ length: 9 }, (_, j) => ({
        name: `scorer${j}`, score: 0.1, weight: 0.1,
      })),
    }));
    bigSnapshot.resultCount = 50;
    recordSearchSnapshot(bigSnapshot);

    const report = generateRankingReport({ maskingLevel: 'none' })!;
    const url = buildGitHubIssueUrl(report);
    expect(url.length).toBeLessThan(10000);
  });

  it('includes query, version, and timestamp in stub body', () => {
    recordSearchSnapshot(makeSnapshot());
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    const url = buildGitHubIssueUrl(report);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('body')).toContain('wiki leave');
    expect(params.get('body')).toContain('8.1.0');
    expect(params.get('labels')).toBe('ranking-bug,auto-report');
  });
});

describe('generateRankingReport — edge cases', () => {
  it('handles empty results array', () => {
    recordSearchSnapshot(makeSnapshot({ results: [], resultCount: 0 }));
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report).not.toBeNull();
    expect(report!.body).toContain('Top 0');
    expect(report!.body).toContain('_No results to analyze._');
  });

  it('includes AI expanded keywords row when present', () => {
    recordSearchSnapshot(makeSnapshot({
      aiExpandedKeywords: ['vacation', 'holiday', 'absence'],
    }));
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('AI Expanded Keywords');
    expect(report!.body).toContain('`vacation`');
    expect(report!.body).toContain('`holiday`');
  });

  it('omits AI expanded keywords row when array is empty', () => {
    recordSearchSnapshot(makeSnapshot({ aiExpandedKeywords: [] }));
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).not.toContain('AI Expanded Keywords');
  });

  it('labels AI-only results as AI source', () => {
    recordSearchSnapshot(makeSnapshot({
      results: [makeSnapshot().results[0]],
    }));
    const snap = makeSnapshot({
      results: [{
        ...makeSnapshot().results[0],
        keywordMatch: false,
        aiMatch: true,
      }],
    });
    recordSearchSnapshot(snap);
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('| AI |');
  });

  it('labels hybrid results as hybrid source', () => {
    const snap = makeSnapshot({
      results: [{
        ...makeSnapshot().results[0],
        keywordMatch: true,
        aiMatch: true,
      }],
    });
    recordSearchSnapshot(snap);
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('| hybrid |');
  });

  it('labels keyword-only results as keyword source', () => {
    recordSearchSnapshot(makeSnapshot());
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('| keyword |');
  });

  it('shows dash for field hits when no tokens match title+url', () => {
    const snap = makeSnapshot({
      tokens: ['nonexistent'],
      results: [{
        ...makeSnapshot().results[0],
        title: 'Unrelated',
        url: 'https://other.com',
      }],
    });
    recordSearchSnapshot(snap);
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('| - |');
  });
});

describe('generateRankingReport — field-hit map (boundary-flex-aware)', () => {
  it('renders compact per-field hit encoding `token[t,u,h]` at level=none', () => {
    recordSearchSnapshot(makeSnapshot());
    const report = generateRankingReport({ maskingLevel: 'none' });
    // Row 1: wiki matches title ("Wiki"), URL (hostname portion is in URL
    // string), and hostname. Leave matches title ("Leave") and URL path.
    expect(report!.body).toContain('wiki[t,u,h]');
    expect(report!.body).toMatch(/leave\[t(,u)?\]/);
  });

  it('surfaces boundary-flex hits (module42 → "Module 42") in the field-hit map', () => {
    const snap = makeSnapshot({
      query: 'tracker module42',
      tokens: ['tracker', 'module42'],
      results: [{
        rank: 1,
        url: 'https://tracker.example.com/ticket/ID-1234',
        title: '[ID-1234] Module 42 Review - Acme Tracker',
        hostname: 'tracker.example.com',
        finalScore: 0.88,
        originalMatchCount: 2,
        intentPriority: 3,
        titleUrlCoverage: 1,
        titleUrlQuality: 0.9,
        splitFieldCoverage: 1,
        keywordMatch: true,
        aiMatch: false,
        scorerBreakdown: [
          { name: 'multiTokenMatch', score: 0.3, weight: 0.35 },
        ],
      }],
      resultCount: 1,
    });
    recordSearchSnapshot(snap);
    const report = generateRankingReport({ maskingLevel: 'none' });
    // `module42` has no literal substring in any field. It only shows up
    // via classifyMatch's boundary-flex branch matching "Module 42".
    // If the field-hit map ever silently drops flex hits, this test fails.
    expect(report!.body).toMatch(/module42\[t\]/);
    expect(report!.body).toMatch(/tracker\[t(,u)?(,h)?\]/);
  });

  it('renames the header from "Token Hits" to "Field Hits"', () => {
    recordSearchSnapshot(makeSnapshot());
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('Field Hits');
    expect(report!.body).not.toContain('Token Hits');
  });
});

describe('generateRankingReport — partial-match banner', () => {
  it('adds banner when no result covers all query tokens', () => {
    const snap = makeSnapshot({
      tokens: ['alpha', 'beta', 'gamma'],
      results: [{
        ...makeSnapshot().results[0],
        originalMatchCount: 1,
      }, {
        ...makeSnapshot().results[1],
        originalMatchCount: 2,
      }],
    });
    recordSearchSnapshot(snap);
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toMatch(/Partial matches only/);
    expect(report!.body).toMatch(/best: 2\/3/);
  });

  it('omits banner when at least one result covers every token', () => {
    recordSearchSnapshot(makeSnapshot()); // top result has originalMatchCount=2, tokens=['wiki','leave']
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).not.toContain('Partial matches only');
  });

  it('omits banner on empty result set', () => {
    recordSearchSnapshot(makeSnapshot({ results: [], resultCount: 0 }));
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).not.toContain('Partial matches only');
  });
});

describe('generateRankingReport — masking gradient', () => {
  // These tests lock the three-level gradient contract defined in
  // data-masker.ts. They must fail if future edits silently drift the
  // relative strength of partial vs full.

  it('level=none exposes query, first title, and first hostname raw', () => {
    recordSearchSnapshot(makeSnapshot({
      aiExpandedKeywords: ['vacation', 'holiday'],
    }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    expect(report.title).toContain('wiki leave');
    expect(report.query).toBe('wiki leave');
    expect(report.body).toContain('| Query | `wiki leave` |');
    expect(report.body).toContain('`wiki`');
    expect(report.body).toContain('`leave`');
    expect(report.body).toContain('Leave Calendar');
    expect(report.body).toContain('wiki.example.com');
    expect(report.body).toContain('`vacation`');
    expect(report.body).toContain('`holiday`');
  });

  it('level=partial keeps query readable but redacts titles and AI keywords', () => {
    recordSearchSnapshot(makeSnapshot({
      aiExpandedKeywords: ['vacation', 'holiday'],
    }));
    const report = generateRankingReport({ maskingLevel: 'partial' })!;
    // Query and tokens are the repro hook and stay raw at partial
    expect(report.body).toContain('| Query | `wiki leave` |');
    expect(report.body).toContain('`wiki`');
    expect(report.body).toContain('`leave`');
    // Titles are partially redacted (non-matching words masked)
    expect(report.body).not.toContain('Calendar');
    expect(report.body).not.toContain('Dashboard');
    // Matched tokens are bolded
    expect(report.body).toContain('**Leave**');
    expect(report.body).toContain('**Wiki**');
    // Domain middles redacted: wiki.example.com should not appear verbatim.
    // Note: 'wiki' by itself can still appear as a matched token in titles
    // ("**Wiki**"); that is separate from the full hostname string.
    expect(report.body).not.toContain('wiki.example.com');
    // AI keywords redacted per-word (not raw, not a count)
    expect(report.body).not.toContain('`vacation`');
    expect(report.body).not.toContain('`holiday`');
    expect(report.body).not.toMatch(/\d+ keywords/);
    expect(report.body).toMatch(/AI Expanded Keywords \| `[^`]*•[^`]*`/);
  });

  it('level=full hashes query, removes raw titles/hostnames, and collapses AI keywords to a count', () => {
    recordSearchSnapshot(makeSnapshot({
      aiExpandedKeywords: ['vacation', 'holiday', 'absence'],
    }));
    const report = generateRankingReport({ maskingLevel: 'full' })!;
    // Issue title no longer leaks the raw query
    expect(report.title).not.toContain('wiki leave');
    expect(report.title).toMatch(/\[Ranking\] "\[[a-z0-9]+\] \(2 tokens\)"/);
    // report.query is hashed so the URL-stub path cannot leak it either
    expect(report.query).not.toContain('wiki leave');
    expect(report.query).toMatch(/^\[[a-z0-9]+\] \(2 tokens\)$/);
    // Body header
    expect(report.body).not.toContain('| Query | `wiki leave` |');
    expect(report.body).toMatch(/\| Query \| `\[[a-z0-9]+\] \(2 tokens\)` \|/);
    // Tokens list uses the first-char + dots + length shape
    // 'wiki' (len 4) → w•••(4)   'leave' (len 5) → l•••(5)
    expect(report.body).not.toMatch(/\| Tokens \| `wiki`/);
    expect(report.body).toMatch(/\| Tokens \| `w•••\(4\)`, `l•••\(5\)` \|/);
    // AI keywords collapsed to a count
    expect(report.body).toContain('| AI Expanded Keywords | 3 keywords |');
    expect(report.body).not.toContain('`vacation`');
    expect(report.body).not.toContain('`holiday`');
    expect(report.body).not.toContain('`absence`');
    // Row titles and hostnames are hashed
    expect(report.body).not.toContain('Calendar');
    expect(report.body).not.toContain('Dashboard');
    expect(report.body).not.toContain('wiki.example.com');
    // Token Hits column is collapsed ("-") at full to avoid duplicating Matches
    const dashHitsCount = (report.body.match(/\| - \|$/gm) ?? []).length;
    expect(dashHitsCount).toBeGreaterThanOrEqual(3);
    // Numeric/structural columns remain visible (the gradient keeps debugging useful)
    expect(report.body).toContain('0.920');
    expect(report.body).toContain('| sortBy | best-match |');
    expect(report.body).toContain('Scorer Breakdown');
  });
});

describe('createGitHubIssue', () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  const sampleReport = {
    title: '[Ranking] "test" — 5 results (v8.1.0)',
    body: '## Ranking Bug Report',
    version: '8.1.0',
    timestamp: '2026-04-11T00:00:00.000Z',
    query: 'test',
  };

  it('throws when no PAT is configured', async () => {
    await expect(createGitHubIssue(sampleReport)).rejects.toThrow('No GitHub PAT configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates issue successfully with valid PAT', async () => {
    vi.mocked(SettingsManager.getSetting).mockReturnValue('ghp_testtoken123');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/dhruvinrsoni/smruti-cortex/issues/42' }),
    });

    const url = await createGitHubIssue(sampleReport);
    expect(url).toBe('https://github.com/dhruvinrsoni/smruti-cortex/issues/42');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('github.com/repos/dhruvinrsoni/smruti-cortex/issues'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer ghp_testtoken123',
        }),
      }),
    );
  });

  it('throws with status on API error', async () => {
    vi.mocked(SettingsManager.getSetting).mockReturnValue('ghp_testtoken123');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Validation Failed',
    });

    await expect(createGitHubIssue(sampleReport)).rejects.toThrow('GitHub API 422: Validation Failed');
  });

  it('handles text() failure on error response', async () => {
    vi.mocked(SettingsManager.getSetting).mockReturnValue('ghp_testtoken123');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => { throw new Error('stream error'); },
    });

    await expect(createGitHubIssue(sampleReport)).rejects.toThrow('GitHub API 500: unknown');
  });
});
