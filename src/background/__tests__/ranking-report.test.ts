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

describe('title shape', () => {
  it('embeds resultCount + sort=<mode> + version', () => {
    recordSearchSnapshot(makeSnapshot({ sortBy: 'most-recent', resultCount: 100 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    expect(report.title).toBe('[Ranking] "wiki leave" — 100 results, sort=most-recent (v8.1.0)');
  });

  it('keeps sort=<mode> even when resultCount is zero', () => {
    recordSearchSnapshot(makeSnapshot({ sortBy: 'best-match', results: [], resultCount: 0 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    // Empty result set must still surface sort= so D4's dedupe key stays
    // intact (otherwise zero-result reports would all collide).
    expect(report.title).toContain('sort=best-match');
    expect(report.title).toContain('0 results');
  });

  it('survives full-masking (sort=<mode> is metadata, not user content)', () => {
    recordSearchSnapshot(makeSnapshot({ sortBy: 'most-visited' }));
    const report = generateRankingReport({ maskingLevel: 'full' })!;
    // The query in the title is masked, but sort= is internal metadata
    // and stays raw on every level.
    expect(report.title).toContain('sort=most-visited');
  });
});

describe('degeneracy hint', () => {
  // Helper: build N rows that share an identical tier signature.
  function makeDegenerateRow(rank: number): SearchDebugSnapshot['results'][number] {
    return {
      rank,
      url: `https://example.com/page-${rank}`,
      title: `Page ${rank}`,
      hostname: 'example.com',
      finalScore: 1 - rank * 0.001, // unique to break the tie elsewhere
      originalMatchCount: 1,
      intentPriority: 0,
      titleUrlCoverage: 1.0,
      splitFieldCoverage: 0,
      titleUrlQuality: 1.0,
      keywordMatch: true,
      aiMatch: false,
      scorerBreakdown: [
        { name: 'multiTokenMatch', score: 0, weight: 0.35 },
        { name: 'title', score: 0.2, weight: 0.35 },
      ],
    };
  }

  it('appears when every top-N row ties on every tier', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeDegenerateRow(i + 1));
    recordSearchSnapshot(makeSnapshot({ sortBy: 'most-recent', results: rows, resultCount: 10 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    expect(report.body).toContain('🧊 **Degenerate ranking detected.**');
    expect(report.body).toContain('top-10');
    expect(report.body).toContain('sortBy=`most-recent`');
  });

  it('does NOT appear when even one tier value differs', () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeDegenerateRow(i + 1));
    rows[2].titleUrlCoverage = 0.5; // breaks the signature
    recordSearchSnapshot(makeSnapshot({ results: rows, resultCount: 5 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    expect(report.body).not.toContain('Degenerate ranking detected');
  });

  it('does NOT appear for a single-row result set', () => {
    const rows = [makeDegenerateRow(1)];
    recordSearchSnapshot(makeSnapshot({ results: rows, resultCount: 1 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    // One row trivially "ties" with itself — but that's not a degenerate
    // ranking, that's just one result. Avoid the noisy hint.
    expect(report.body).not.toContain('Degenerate ranking detected');
  });

  it('does NOT appear when the result list is empty', () => {
    recordSearchSnapshot(makeSnapshot({ results: [], resultCount: 0 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    expect(report.body).not.toContain('Degenerate ranking detected');
  });

  it('treats only the top-25 window as the signal source', () => {
    // 25 identical rows + 1 outlier at the bottom (which the report
    // truncates anyway). The hint must still fire because the top-25
    // window — what the user actually sees — is degenerate.
    const rows = Array.from({ length: 25 }, (_, i) => makeDegenerateRow(i + 1));
    rows.push({ ...makeDegenerateRow(26), titleUrlCoverage: 0.0 });
    recordSearchSnapshot(makeSnapshot({ results: rows, resultCount: 26 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    expect(report.body).toContain('Degenerate ranking detected');
    expect(report.body).toContain('top-25');
  });

  it('rounds float tiers to 2dp before comparing (matches visible precision)', () => {
    // 0.501 vs 0.504 — both render as "0.50" in the report, so the user
    // sees them as tied. The hint should treat them as tied too.
    const rows = Array.from({ length: 4 }, (_, i) => makeDegenerateRow(i + 1));
    rows[0].titleUrlQuality = 0.501;
    rows[1].titleUrlQuality = 0.504;
    rows[2].titleUrlQuality = 0.499;
    rows[3].titleUrlQuality = 0.502;
    recordSearchSnapshot(makeSnapshot({ results: rows, resultCount: 4 }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    expect(report.body).toContain('Degenerate ranking detected');
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

  it('points the URL at the dedicated Issue Form template', () => {
    recordSearchSnapshot(makeSnapshot());
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    const url = buildGitHubIssueUrl(report);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('template')).toBe('ranking-report.yml');
    // body= must NOT be set when template= is — GitHub silently drops
    // it and sending one would put us back in the stub-body world the
    // template was supposed to replace.
    expect(params.get('body')).toBeNull();
    // Three labels: semantic (ranking-bug) + provenance (auto-report)
    // + silo (sink: ranking-reports). Maintainer triage filters keyed
    // off -label:"sink: ranking-reports" depend on the third one.
    expect(params.get('labels')).toBe('ranking-bug,auto-report,sink: ranking-reports');
  });

  it('pre-fills Issue Form fields (query, sort-mode, extension-version)', () => {
    recordSearchSnapshot(makeSnapshot());
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    const url = buildGitHubIssueUrl(report);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('query')).toBe('wiki leave');
    expect(params.get('extension-version')).toBe(report.version);
    // best-match (snapshot default) maps to the dropdown's "Best Match"
    // label. Other sortBy values map similarly — see sortByToTemplateLabel.
    expect(params.get('sort-mode')).toBe('Best Match');
  });

  it('maps every sortBy value onto a valid dropdown label', () => {
    const cases: Array<[string, string]> = [
      ['most-recent', 'Most Recent'],
      ['most-visited', 'Most Visited'],
      ['alphabetical', 'Alphabetical'],
      ['best-match', 'Best Match'],
    ];
    for (const [internal, label] of cases) {
      recordSearchSnapshot(makeSnapshot({ sortBy: internal }));
      const report = generateRankingReport({ maskingLevel: 'none' })!;
      const params = new URLSearchParams(buildGitHubIssueUrl(report).split('?')[1]);
      expect(params.get('sort-mode')).toBe(label);
    }
  });

  it('falls back to Best Match for unknown sortBy values', () => {
    recordSearchSnapshot(makeSnapshot({ sortBy: 'mystery-mode' }));
    const report = generateRankingReport({ maskingLevel: 'none' })!;
    const params = new URLSearchParams(buildGitHubIssueUrl(report).split('?')[1]);
    expect(params.get('sort-mode')).toBe('Best Match');
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
