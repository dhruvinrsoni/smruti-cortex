// Tests for ranking-report.ts — ranking bug report generation

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, chromeMock, makeSnapshot as buildSnapshot } from '../../__test-utils__';

vi.mock('../../core/logger', () => mockLogger());

vi.mock('../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn((key: string) => {
      if (key === 'developerGithubPat') return '';
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
    query: 'confluence pto',
    tokens: ['confluence', 'pto'],
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
        url: 'https://confluence.zebra.com/pages/PTO',
        title: 'PTO Calendar - Confluence',
        hostname: 'confluence.zebra.com',
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
        url: 'https://confluence.zebra.com/pages/Dashboard',
        title: 'Dashboard - Confluence',
        hostname: 'confluence.zebra.com',
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
    expect(report!.query).toBe('confluence pto');
    expect(report!.title).toContain('confluence pto');
    expect(report!.title).toContain('v8.1.0');
  });

  it('includes results table in body', () => {
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('| # | Title | Domain |');
    expect(report!.body).toContain('PTO Calendar');
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
    const report = generateRankingReport({ maskingLevel: 'none', userNote: 'PTO pages should be first' });
    expect(report!.body).toContain('PTO pages should be first');
    expect(report!.body).toContain('### User Note');
  });

  it('applies partial masking to titles', () => {
    const report = generateRankingReport({ maskingLevel: 'partial' });
    expect(report!.body).toContain('**PTO**');
    expect(report!.body).toContain('**Confluence**');
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
    expect(params.get('body')).toContain('confluence pto');
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
      aiExpandedKeywords: ['leave', 'vacation', 'time-off'],
    }));
    const report = generateRankingReport({ maskingLevel: 'none' });
    expect(report!.body).toContain('AI Expanded Keywords');
    expect(report!.body).toContain('`leave`');
    expect(report!.body).toContain('`vacation`');
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

  it('shows dash for token hits when no tokens match title+url', () => {
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
