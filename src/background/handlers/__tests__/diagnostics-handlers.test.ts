/**
 * diagnostics-handlers — branch-coverage unit tests.
 *
 * Targets the many untested branches in RUN_TROUBLESHOOTER, GENERATE_RANKING_REPORT,
 * and the error paths of the smaller pre-init handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandlerRegistry } from '../registry';
import {
  registerDiagnosticsPreInitHandlers,
  registerDiagnosticsPostInitHandlers,
} from '../diagnostics-handlers';
import { chromeMock } from '../../../__test-utils__/chrome-mock';

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  errorMeta: (err: unknown) => ({ error: String(err) }),
}));

vi.mock('../../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn(),
  },
}));

vi.mock('../../performance-monitor', () => ({
  getPerformanceMetrics: vi.fn(),
  formatMetricsForDisplay: vi.fn(),
  performanceTracker: {
    reset: vi.fn(),
  },
}));

vi.mock('../../database', () => ({
  getStorageQuotaInfo: vi.fn(),
  openDatabase: vi.fn(),
  getAllIndexedItems: vi.fn(),
}));

vi.mock('../../diagnostics', () => ({
  exportDiagnosticsAsJson: vi.fn(),
  getSearchAnalytics: vi.fn(),
  getSearchHistory: vi.fn(),
  isSearchDebugEnabled: vi.fn(),
  setSearchDebugEnabled: vi.fn(),
}));

vi.mock('../../search-debug', () => ({
  searchDebugService: {
    clearHistory: vi.fn(),
  },
}));

vi.mock('../../ranking-report', () => ({
  generateRankingReport: vi.fn(),
  createGitHubIssue: vi.fn(),
  buildGitHubIssueUrl: vi.fn(() => 'https://github.com/owner/repo/issues/new?title=x'),
}));

vi.mock('../../resilience', () => ({
  recoverFromCorruption: vi.fn(),
  selfHeal: vi.fn(),
}));

vi.mock('../../favicon-cache', () => ({
  getFaviconCacheStats: vi.fn(),
  clearExpiredFavicons: vi.fn(),
}));

vi.mock('../../search/search-cache', () => ({
  clearSearchCache: vi.fn(),
}));

vi.mock('../../embedding-processor', () => ({
  embeddingProcessor: {
    start: vi.fn(),
    getProgress: vi.fn(),
  },
}));

vi.mock('../../ollama-service', () => ({
  isCircuitBreakerOpen: vi.fn(),
}));

function dispatch(
  registry: MessageHandlerRegistry,
  msg: { type: string; [k: string]: unknown },
) {
  return new Promise<Record<string, unknown>>((resolve) => {
    void registry.dispatch(
      msg,
      {} as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as Record<string, unknown>),
    );
  });
}

describe('diagnostics-handlers (pre-init)', () => {
  let registry: MessageHandlerRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', chromeMock().withRuntime().withStorage().build());
    registry = new MessageHandlerRegistry();
    registerDiagnosticsPreInitHandlers(registry);
  });

  it('registers every expected pre-init message type', () => {
    expect(registry.registeredTypes).toEqual(expect.arrayContaining([
      'GET_PERFORMANCE_METRICS',
      'RESET_PERFORMANCE_METRICS',
      'EXPORT_DIAGNOSTICS',
      'GET_SEARCH_ANALYTICS',
      'EXPORT_SEARCH_DEBUG',
      'GET_SEARCH_DEBUG_ENABLED',
      'SET_SEARCH_DEBUG_ENABLED',
      'CLEAR_SEARCH_DEBUG',
      'CLEAR_RECENT_SEARCHES',
      'GENERATE_RANKING_REPORT',
    ]));
  });

  describe('GET_PERFORMANCE_METRICS', () => {
    it('includes storage summary when getStorageQuotaInfo succeeds', async () => {
      const { getPerformanceMetrics, formatMetricsForDisplay } = await import('../../performance-monitor');
      const { getStorageQuotaInfo } = await import('../../database');
      (getPerformanceMetrics as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ p50: 1 });
      (getStorageQuotaInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        usedFormatted: '1 MB',
        totalFormatted: '10 MB',
      });
      (formatMetricsForDisplay as ReturnType<typeof vi.fn>).mockReturnValueOnce('metrics-text');

      const res = await dispatch(registry, { type: 'GET_PERFORMANCE_METRICS' });

      expect(formatMetricsForDisplay).toHaveBeenCalledWith(
        { p50: 1 },
        { usedFormatted: '1 MB', totalFormatted: '10 MB' },
      );
      expect(res).toEqual({ status: 'OK', metrics: { p50: 1 }, formatted: 'metrics-text' });
    });

    it('omits storage summary when getStorageQuotaInfo rejects (.catch branch)', async () => {
      const { getPerformanceMetrics, formatMetricsForDisplay } = await import('../../performance-monitor');
      const { getStorageQuotaInfo } = await import('../../database');
      (getPerformanceMetrics as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ p50: 2 });
      (getStorageQuotaInfo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('quota fail'));
      (formatMetricsForDisplay as ReturnType<typeof vi.fn>).mockReturnValueOnce('fallback-text');

      const res = await dispatch(registry, { type: 'GET_PERFORMANCE_METRICS' });

      expect(formatMetricsForDisplay).toHaveBeenCalledWith({ p50: 2 }, undefined);
      expect(res).toEqual({ status: 'OK', metrics: { p50: 2 }, formatted: 'fallback-text' });
    });

    it('returns ERROR when getPerformanceMetrics rejects', async () => {
      const { getPerformanceMetrics } = await import('../../performance-monitor');
      const { getStorageQuotaInfo } = await import('../../database');
      (getPerformanceMetrics as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('metrics fail'));
      (getStorageQuotaInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await dispatch(registry, { type: 'GET_PERFORMANCE_METRICS' });

      expect(res).toEqual({ status: 'ERROR', message: 'metrics fail' });
    });
  });

  describe('RESET_PERFORMANCE_METRICS', () => {
    it('returns OK when tracker.reset succeeds', async () => {
      const { performanceTracker } = await import('../../performance-monitor');
      (performanceTracker.reset as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(registry, { type: 'RESET_PERFORMANCE_METRICS' });

      expect(res).toEqual({ status: 'OK' });
    });

    it('returns ERROR when tracker.reset rejects', async () => {
      const { performanceTracker } = await import('../../performance-monitor');
      (performanceTracker.reset as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('reset fail'));

      const res = await dispatch(registry, { type: 'RESET_PERFORMANCE_METRICS' });

      expect(res).toEqual({ status: 'ERROR', message: 'reset fail' });
    });
  });

  describe('EXPORT_DIAGNOSTICS', () => {
    it('returns OK with exported JSON', async () => {
      const { exportDiagnosticsAsJson } = await import('../../diagnostics');
      (exportDiagnosticsAsJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce('{"a":1}');

      const res = await dispatch(registry, { type: 'EXPORT_DIAGNOSTICS' });

      expect(res).toEqual({ status: 'OK', data: '{"a":1}' });
    });

    it('returns ERROR when export fails', async () => {
      const { exportDiagnosticsAsJson } = await import('../../diagnostics');
      (exportDiagnosticsAsJson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('export fail'));

      const res = await dispatch(registry, { type: 'EXPORT_DIAGNOSTICS' });

      expect(res).toEqual({ status: 'ERROR', message: 'export fail' });
    });
  });

  describe('small pre-init handler error branches', () => {
    it('GET_SEARCH_ANALYTICS returns ERROR when getter throws', async () => {
      const { getSearchAnalytics } = await import('../../diagnostics');
      (getSearchAnalytics as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('analytics fail');
      });

      const res = await dispatch(registry, { type: 'GET_SEARCH_ANALYTICS' });

      expect(res).toEqual({ status: 'ERROR', message: 'analytics fail' });
    });

    it('EXPORT_SEARCH_DEBUG returns OK with serialized history', async () => {
      const { getSearchHistory } = await import('../../diagnostics');
      (getSearchHistory as ReturnType<typeof vi.fn>).mockReturnValueOnce([{ q: 'a' }]);

      const res = await dispatch(registry, { type: 'EXPORT_SEARCH_DEBUG' });

      expect(res.status).toBe('OK');
      expect(typeof res.data).toBe('string');
      expect(String(res.data)).toContain('"history"');
      expect(String(res.data)).toContain('"exportTimestamp"');
    });

    it('EXPORT_SEARCH_DEBUG returns ERROR when getter throws', async () => {
      const { getSearchHistory } = await import('../../diagnostics');
      (getSearchHistory as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('history fail');
      });

      const res = await dispatch(registry, { type: 'EXPORT_SEARCH_DEBUG' });

      expect(res).toEqual({ status: 'ERROR', message: 'history fail' });
    });

    it('GET_SEARCH_DEBUG_ENABLED returns ERROR when getter throws', async () => {
      const { isSearchDebugEnabled } = await import('../../diagnostics');
      (isSearchDebugEnabled as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('enabled fail');
      });

      const res = await dispatch(registry, { type: 'GET_SEARCH_DEBUG_ENABLED' });

      expect(res).toEqual({ status: 'ERROR', message: 'enabled fail' });
    });

    it('SET_SEARCH_DEBUG_ENABLED falls back to false when msg.enabled is undefined', async () => {
      const { setSearchDebugEnabled } = await import('../../diagnostics');
      (setSearchDebugEnabled as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(registry, { type: 'SET_SEARCH_DEBUG_ENABLED' });

      expect(setSearchDebugEnabled).toHaveBeenCalledWith(false);
      expect(res).toEqual({ status: 'OK' });
    });

    it('SET_SEARCH_DEBUG_ENABLED passes explicit true value through', async () => {
      const { setSearchDebugEnabled } = await import('../../diagnostics');
      (setSearchDebugEnabled as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      await dispatch(registry, { type: 'SET_SEARCH_DEBUG_ENABLED', enabled: true });

      expect(setSearchDebugEnabled).toHaveBeenCalledWith(true);
    });

    it('SET_SEARCH_DEBUG_ENABLED returns ERROR when setter throws', async () => {
      const { setSearchDebugEnabled } = await import('../../diagnostics');
      (setSearchDebugEnabled as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('toggle fail'));

      const res = await dispatch(registry, { type: 'SET_SEARCH_DEBUG_ENABLED', enabled: true });

      expect(res).toEqual({ status: 'ERROR', message: 'toggle fail' });
    });

    it('CLEAR_SEARCH_DEBUG returns ERROR when service throws', async () => {
      const { searchDebugService } = await import('../../search-debug');
      (searchDebugService.clearHistory as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('clear fail');
      });

      const res = await dispatch(registry, { type: 'CLEAR_SEARCH_DEBUG' });

      expect(res).toEqual({ status: 'ERROR', message: 'clear fail' });
    });

    it('CLEAR_RECENT_SEARCHES returns ERROR when storage.remove rejects', async () => {
      // Rebuild registry with a storage.remove that rejects.
      const failingChrome = chromeMock()
        .withRuntime()
        .withStorage({ remove: vi.fn().mockRejectedValue(new Error('storage fail')) })
        .build();
      vi.stubGlobal('chrome', failingChrome);

      const res = await dispatch(registry, { type: 'CLEAR_RECENT_SEARCHES' });

      expect(res).toEqual({ status: 'ERROR', message: 'storage fail' });
    });

    it('CLEAR_RECENT_SEARCHES returns OK when storage succeeds', async () => {
      const res = await dispatch(registry, { type: 'CLEAR_RECENT_SEARCHES' });
      expect(res).toEqual({ status: 'OK' });
    });
  });

  describe('GENERATE_RANKING_REPORT', () => {
    it('defaults maskingLevel to "partial" when msg.maskingLevel is undefined', async () => {
      const { generateRankingReport } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        title: 'Report',
        body: 'body',
      });

      await dispatch(registry, { type: 'GENERATE_RANKING_REPORT', userNote: 'hello' });

      expect(generateRankingReport).toHaveBeenCalledWith({
        maskingLevel: 'partial',
        userNote: 'hello',
      });
    });

    it('passes explicit maskingLevel through', async () => {
      const { generateRankingReport } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        title: 'Report',
        body: 'body',
      });

      await dispatch(registry, {
        type: 'GENERATE_RANKING_REPORT',
        maskingLevel: 'strict',
      });

      expect(generateRankingReport).toHaveBeenCalledWith({
        maskingLevel: 'strict',
        userNote: undefined,
      });
    });

    it('returns ERROR when report is null', async () => {
      const { generateRankingReport } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

      const res = await dispatch(registry, { type: 'GENERATE_RANKING_REPORT' });

      expect(res.status).toBe('ERROR');
      expect(String(res.message)).toContain('No search snapshot');
    });

    it('method=api success returns api method and issueUrl', async () => {
      const { generateRankingReport, createGitHubIssue } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        title: 'Report',
        body: 'body',
      });
      (createGitHubIssue as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'https://github.com/owner/repo/issues/42',
      );

      const res = await dispatch(registry, { type: 'GENERATE_RANKING_REPORT', method: 'api' });

      expect(res).toEqual({
        status: 'OK',
        method: 'api',
        issueUrl: 'https://github.com/owner/repo/issues/42',
        reportBody: 'body',
      });
    });

    it('method=api failure falls back to prebuilt URL with apiError', async () => {
      const { generateRankingReport, createGitHubIssue } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        title: 'Report',
        body: 'body',
      });
      (createGitHubIssue as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('api down'));

      const res = await dispatch(registry, { type: 'GENERATE_RANKING_REPORT', method: 'api' });

      expect(res).toMatchObject({
        status: 'OK',
        method: 'url',
        apiError: 'api down',
        reportBody: 'body',
      });
      expect(String(res.issueUrl)).toContain('github.com');
    });

    it('non-api method builds URL directly', async () => {
      const { generateRankingReport, createGitHubIssue } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        title: 'Report',
        body: 'body',
      });

      const res = await dispatch(registry, { type: 'GENERATE_RANKING_REPORT', method: 'url' });

      expect(createGitHubIssue).not.toHaveBeenCalled();
      expect(res).toMatchObject({ status: 'OK', method: 'url', reportBody: 'body' });
    });

    it('outer catch returns ERROR when generateRankingReport throws', async () => {
      const { generateRankingReport } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('report crash');
      });

      const res = await dispatch(registry, { type: 'GENERATE_RANKING_REPORT' });

      expect(res).toEqual({ status: 'ERROR', message: 'report crash' });
    });
  });
});

describe('diagnostics-handlers (post-init) RUN_TROUBLESHOOTER', () => {
  let registry: MessageHandlerRegistry;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', chromeMock().withRuntime().withStorage().build());
    registry = new MessageHandlerRegistry();
    registerDiagnosticsPostInitHandlers(registry);

    const { embeddingProcessor } = await import('../../embedding-processor');
    (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValue({
      state: 'idle',
      total: 0,
      withEmbeddings: 0,
    });
  });

  it('registers only RUN_TROUBLESHOOTER', () => {
    expect(registry.registeredTypes).toEqual(['RUN_TROUBLESHOOTER']);
  });

  it('reports "healthy" when every step passes (embeddings + ollama disabled → skipped)', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 3 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false) // embeddingsEnabled
      .mockReturnValueOnce(false); // ollamaEnabled

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    expect(res.status).toBe('OK');
    const data = res.data as { steps: Array<{ id: string; status: string }>; overallStatus: string; totalDurationMs: number };
    expect(data.overallStatus).toBe('healthy');
    const byId = Object.fromEntries(data.steps.map((s) => [s.id, s.status]));
    expect(byId['sw-alive']).toBe('pass');
    expect(byId['db-open']).toBe('pass');
    expect(byId['index-health']).toBe('pass');
    expect(byId['search-cache']).toBe('pass');
    expect(byId['favicon-cache']).toBe('pass');
    expect(byId['embeddings']).toBe('skipped');
    expect(byId['ollama']).toBe('skipped');
    expect(typeof data.totalDurationMs).toBe('number');
  });

  it('db-open recovers from corruption → status "healed"', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { recoverFromCorruption } = await import('../../resilience');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('corrupt'));
    (recoverFromCorruption as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }>; overallStatus: string };
    const dbStep = data.steps.find((s) => s.id === 'db-open')!;
    expect(dbStep.status).toBe('healed');
    expect(dbStep.detail).toContain('Recovered');
    expect(data.overallStatus).toBe('healed');
  });

  it('db-open fail when recoverFromCorruption returns false → overallStatus "issues-remain"', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { recoverFromCorruption } = await import('../../resilience');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('corrupt'));
    (recoverFromCorruption as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string }>; overallStatus: string };
    const dbStep = data.steps.find((s) => s.id === 'db-open')!;
    expect(dbStep.status).toBe('fail');
    expect(data.overallStatus).toBe('issues-remain');
  });

  it('index-health rebuilds index when empty → "healed"', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { selfHeal } = await import('../../resilience');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]) // first call → empty
      .mockResolvedValueOnce([{ url: 'x' }, { url: 'y' }]); // after selfHeal
    (selfHeal as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }> };
    const idx = data.steps.find((s) => s.id === 'index-health')!;
    expect(idx.status).toBe('healed');
    expect(idx.detail).toContain('Rebuilt');
  });

  it('index-health reports "fail" when rebuild yields zero items', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { selfHeal } = await import('../../resilience');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (selfHeal as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }> };
    const idx = data.steps.find((s) => s.id === 'index-health')!;
    expect(idx.status).toBe('fail');
    expect(idx.detail).toContain('empty');
  });

  it('favicon-cache reports "healed" when expired entries are cleared', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 10 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(4);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }>; overallStatus: string };
    const fav = data.steps.find((s) => s.id === 'favicon-cache')!;
    expect(fav.status).toBe('healed');
    expect(fav.detail).toContain('cleared 4 expired');
    expect(data.overallStatus).toBe('healed');
  });

  it('embeddings step restarts processor when progress state is "error" → "healed"', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');
    const { embeddingProcessor } = await import('../../embedding-processor');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true) // embeddingsEnabled
      .mockReturnValueOnce(false); // ollamaEnabled
    (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      state: 'error',
      total: 0,
      withEmbeddings: 0,
    });
    (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }> };
    const emb = data.steps.find((s) => s.id === 'embeddings')!;
    expect(emb.status).toBe('healed');
    expect(emb.detail).toContain('Restarted');
    expect(embeddingProcessor.start).toHaveBeenCalled();
  });

  it('embeddings step reports percentage when processor is running', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');
    const { embeddingProcessor } = await import('../../embedding-processor');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      state: 'running',
      total: 200,
      withEmbeddings: 50,
    });

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }> };
    const emb = data.steps.find((s) => s.id === 'embeddings')!;
    expect(emb.status).toBe('pass');
    expect(emb.detail).toContain('running (25%)');
  });

  it('ollama step reports fail when circuit breaker is open', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');
    const { isCircuitBreakerOpen } = await import('../../ollama-service');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false) // embeddings disabled
      .mockReturnValueOnce(true); // ollama enabled
    (isCircuitBreakerOpen as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }>; overallStatus: string };
    const oll = data.steps.find((s) => s.id === 'ollama')!;
    expect(oll.status).toBe('fail');
    expect(oll.detail).toContain('Circuit breaker open');
    expect(data.overallStatus).toBe('issues-remain');
  });

  it('ollama step reports pass when circuit breaker is closed', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');
    const { isCircuitBreakerOpen } = await import('../../ollama-service');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    (isCircuitBreakerOpen as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }> };
    const oll = data.steps.find((s) => s.id === 'ollama')!;
    expect(oll.status).toBe('pass');
    expect(oll.detail).toBe('Connected');
  });

  it('runStep catch path records a failing step when an inner step throws', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fav boom'));
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as { steps: Array<{ id: string; status: string; detail: string }>; overallStatus: string };
    const fav = data.steps.find((s) => s.id === 'favicon-cache')!;
    expect(fav.status).toBe('fail');
    expect(fav.detail).toBe('fav boom');
    expect(data.overallStatus).toBe('issues-remain');
  });
});
