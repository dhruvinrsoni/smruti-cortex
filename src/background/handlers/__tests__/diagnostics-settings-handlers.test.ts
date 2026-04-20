 
 
/**
 * Combined branch-coverage tests for diagnostics-handlers and settings-handlers.
 *
 * Targets:
 *   - RUN_TROUBLESHOOTER: all 7 diagnostic steps × pass/healed/fail/skipped
 *   - GENERATE_RANKING_REPORT: null-report, api success, api fallback, url, outer catch
 *   - GET_PERFORMANCE_METRICS: storageInfo null branch
 *   - SETTINGS_CHANGED: model-changed branch, no-op, enable/disable
 *   - FACTORY_RESET / RESET_SETTINGS: error paths
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandlerRegistry } from '../registry';
import {
  registerDiagnosticsPreInitHandlers,
  registerDiagnosticsPostInitHandlers,
} from '../diagnostics-handlers';
import { registerSettingsHandlers } from '../settings-handlers';
import { chromeMock } from '../../../__test-utils__/chrome-mock';

// ── Shared mocks ──

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    getLevel: vi.fn().mockReturnValue('INFO'),
    setLevel: vi.fn().mockResolvedValue(undefined),
  },
  errorMeta: (err: unknown) => ({ error: String(err) }),
}));

vi.mock('../../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn(),
    getSettings: vi.fn(() => ({ theme: 'system' })),
    applyRemoteSettings: vi.fn(),
    resetToDefaults: vi.fn(),
  },
}));

const helperMocks = vi.hoisted(() => ({
  tabsCreate: vi.fn(),
  runtimeGetURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
}));

vi.mock('../../../core/helpers', () => ({
  browserAPI: {
    tabs: { create: helperMocks.tabsCreate },
    runtime: { getURL: helperMocks.runtimeGetURL },
  },
}));

vi.mock('../../performance-monitor', () => ({
  getPerformanceMetrics: vi.fn(),
  formatMetricsForDisplay: vi.fn(),
  performanceTracker: { reset: vi.fn() },
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
  searchDebugService: { clearHistory: vi.fn() },
}));

vi.mock('../../ranking-report', () => ({
  generateRankingReport: vi.fn(),
  createGitHubIssue: vi.fn(),
  buildGitHubIssueUrl: vi.fn(() => 'https://github.com/owner/repo/issues/new?title=x'),
}));

vi.mock('../../resilience', () => ({
  recoverFromCorruption: vi.fn(),
  selfHeal: vi.fn(),
  clearAndRebuild: vi.fn(),
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
    stop: vi.fn(),
    getProgress: vi.fn(),
  },
}));

vi.mock('../../ollama-service', () => ({
  isCircuitBreakerOpen: vi.fn(),
  normalizeModelName: vi.fn((m: string) => m.trim().toLowerCase()),
}));

// ── Helpers ──

type AnyRecord = Record<string, unknown>;

function dispatch(
  registry: MessageHandlerRegistry,
  msg: { type: string; [k: string]: unknown },
): Promise<AnyRecord> {
  return new Promise<AnyRecord>((resolve) => {
    void registry.dispatch(
      msg,
      {} as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as AnyRecord),
    );
  });
}

type StepData = {
  steps: Array<{ id: string; status: string; detail: string; durationMs: number }>;
  overallStatus: string;
  totalDurationMs: number;
};

function stepById(data: StepData, id: string) {
  return data.steps.find((s) => s.id === id)!;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DIAGNOSTICS HANDLERS — PRE-INIT
// ═══════════════════════════════════════════════════════════════════════════

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

  // ── GET_PERFORMANCE_METRICS ──

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

    it('passes undefined storage when getStorageQuotaInfo rejects (null branch)', async () => {
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

  // ── RESET_PERFORMANCE_METRICS ──

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

  // ── EXPORT_DIAGNOSTICS ──

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

  // ── Small pre-init error branches ──

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

    it('CLEAR_RECENT_SEARCHES returns OK when storage succeeds', async () => {
      const res = await dispatch(registry, { type: 'CLEAR_RECENT_SEARCHES' });
      expect(res).toEqual({ status: 'OK' });
    });

    it('CLEAR_RECENT_SEARCHES returns ERROR when storage.remove rejects', async () => {
      vi.stubGlobal('chrome', chromeMock()
        .withRuntime()
        .withStorage({ remove: vi.fn().mockRejectedValue(new Error('storage fail')) })
        .build());

      const res = await dispatch(registry, { type: 'CLEAR_RECENT_SEARCHES' });

      expect(res).toEqual({ status: 'ERROR', message: 'storage fail' });
    });
  });

  // ── GENERATE_RANKING_REPORT ──

  describe('GENERATE_RANKING_REPORT', () => {
    it('defaults maskingLevel to "partial" when msg.maskingLevel is undefined', async () => {
      const { generateRankingReport } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({ title: 'R', body: 'b' });

      await dispatch(registry, { type: 'GENERATE_RANKING_REPORT', userNote: 'hello' });

      expect(generateRankingReport).toHaveBeenCalledWith({
        maskingLevel: 'partial',
        userNote: 'hello',
      });
    });

    it('passes explicit maskingLevel through', async () => {
      const { generateRankingReport } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({ title: 'R', body: 'b' });

      await dispatch(registry, { type: 'GENERATE_RANKING_REPORT', maskingLevel: 'strict' });

      expect(generateRankingReport).toHaveBeenCalledWith({
        maskingLevel: 'strict',
        userNote: undefined,
      });
    });

    it('returns ERROR when report is null (no search snapshot)', async () => {
      const { generateRankingReport } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

      const res = await dispatch(registry, { type: 'GENERATE_RANKING_REPORT' });

      expect(res.status).toBe('ERROR');
      expect(String(res.message)).toContain('No search snapshot');
    });

    it('method=api success returns api method and issueUrl', async () => {
      const { generateRankingReport, createGitHubIssue } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({ title: 'R', body: 'body' });
      (createGitHubIssue as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://github.com/owner/repo/issues/42');

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
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({ title: 'R', body: 'body' });
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

    it('non-api method builds URL directly without calling createGitHubIssue', async () => {
      const { generateRankingReport, createGitHubIssue } = await import('../../ranking-report');
      (generateRankingReport as ReturnType<typeof vi.fn>).mockReturnValueOnce({ title: 'R', body: 'body' });

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

// ═══════════════════════════════════════════════════════════════════════════
//  DIAGNOSTICS HANDLERS — POST-INIT (RUN_TROUBLESHOOTER)
// ═══════════════════════════════════════════════════════════════════════════

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

  // ── Happy path ──

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
    const data = res.data as StepData;
    expect(data.overallStatus).toBe('healthy');
    expect(stepById(data, 'sw-alive').status).toBe('pass');
    expect(stepById(data, 'db-open').status).toBe('pass');
    expect(stepById(data, 'index-health').status).toBe('pass');
    expect(stepById(data, 'search-cache').status).toBe('pass');
    expect(stepById(data, 'favicon-cache').status).toBe('pass');
    expect(stepById(data, 'embeddings').status).toBe('skipped');
    expect(stepById(data, 'ollama').status).toBe('skipped');
    expect(typeof data.totalDurationMs).toBe('number');
  });

  // ── Database step ──

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

    const data = res.data as StepData;
    expect(stepById(data, 'db-open').status).toBe('healed');
    expect(stepById(data, 'db-open').detail).toContain('Recovered');
    expect(data.overallStatus).toBe('healed');
  });

  it('db-open fail when recoverFromCorruption returns false → "issues-remain"', async () => {
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

    const data = res.data as StepData;
    expect(stepById(data, 'db-open').status).toBe('fail');
    expect(data.overallStatus).toBe('issues-remain');
  });

  // ── Search index step ──

  it('index-health rebuilds index when empty → "healed"', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { selfHeal } = await import('../../resilience');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ url: 'x' }, { url: 'y' }]);
    (selfHeal as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    expect(stepById(data, 'index-health').status).toBe('healed');
    expect(stepById(data, 'index-health').detail).toContain('Rebuilt');
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

    const data = res.data as StepData;
    expect(stepById(data, 'index-health').status).toBe('fail');
    expect(stepById(data, 'index-health').detail).toContain('empty');
  });

  // ── Favicon cache step ──

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

    const data = res.data as StepData;
    const fav = stepById(data, 'favicon-cache');
    expect(fav.status).toBe('healed');
    expect(fav.detail).toContain('cleared 4 expired');
    expect(data.overallStatus).toBe('healed');
  });

  // ── Embeddings step ──

  it('embeddings step skipped when disabled', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false) // embeddingsEnabled
      .mockReturnValueOnce(false); // ollamaEnabled

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    expect(stepById(data, 'embeddings').status).toBe('skipped');
    expect(stepById(data, 'embeddings').detail).toBe('Disabled');
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
      .mockReturnValueOnce(true)  // embeddingsEnabled
      .mockReturnValueOnce(false); // ollamaEnabled
    (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      state: 'error',
      total: 0,
      withEmbeddings: 0,
    });
    (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    const emb = stepById(data, 'embeddings');
    expect(emb.status).toBe('healed');
    expect(emb.detail).toContain('Restarted');
    expect(embeddingProcessor.start).toHaveBeenCalled();
  });

  it('embeddings step reports percentage when processor is running with progress', async () => {
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

    const data = res.data as StepData;
    const emb = stepById(data, 'embeddings');
    expect(emb.status).toBe('pass');
    expect(emb.detail).toContain('running (25%)');
  });

  it('embeddings step reports 0% when total is 0 (ternary false branch)', async () => {
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
      state: 'idle',
      total: 0,
      withEmbeddings: 0,
    });

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    const emb = stepById(data, 'embeddings');
    expect(emb.status).toBe('pass');
    expect(emb.detail).toContain('idle (0%)');
  });

  // ── Ollama step ──

  it('ollama step skipped when disabled', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false) // embeddingsEnabled
      .mockReturnValueOnce(false); // ollamaEnabled

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    expect(stepById(data, 'ollama').status).toBe('skipped');
    expect(stepById(data, 'ollama').detail).toBe('Disabled');
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
      .mockReturnValueOnce(false)  // embeddings disabled
      .mockReturnValueOnce(true);  // ollama enabled
    (isCircuitBreakerOpen as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    const oll = stepById(data, 'ollama');
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

    const data = res.data as StepData;
    const oll = stepById(data, 'ollama');
    expect(oll.status).toBe('pass');
    expect(oll.detail).toBe('Connected');
  });

  // ── runStep catch ──

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

    const data = res.data as StepData;
    const fav = stepById(data, 'favicon-cache');
    expect(fav.status).toBe('fail');
    expect(fav.detail).toBe('fav boom');
    expect(data.overallStatus).toBe('issues-remain');
  });

  // ── Outer catch ──

  it('outer catch fires when unrecoverable error occurs → returns ERROR', async () => {
    const origNow = performance.now;
    vi.spyOn(performance, 'now').mockImplementationOnce(() => {
      throw new Error('perf exploded');
    });

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    expect(res).toEqual({ status: 'ERROR', message: 'perf exploded' });
    performance.now = origNow;
  });

  // ── Combined status logic ──

  it('overallStatus is "healed" when at least one step healed and none failed', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');
    const { embeddingProcessor } = await import('../../embedding-processor');

    (openDatabase as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 5 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2); // healed
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)  // embeddingsEnabled
      .mockReturnValueOnce(false); // ollamaEnabled
    (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      state: 'error',
      total: 0,
      withEmbeddings: 0,
    });
    (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    expect(data.overallStatus).toBe('healed');
    expect(stepById(data, 'favicon-cache').status).toBe('healed');
    expect(stepById(data, 'embeddings').status).toBe('healed');
  });

  it('overallStatus is "issues-remain" when a fail exists even alongside healed steps', async () => {
    const { openDatabase, getAllIndexedItems } = await import('../../database');
    const { recoverFromCorruption } = await import('../../resilience');
    const { getFaviconCacheStats, clearExpiredFavicons } = await import('../../favicon-cache');
    const { SettingsManager } = await import('../../../core/settings');

    (openDatabase as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('corrupt'));
    (recoverFromCorruption as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false); // fail
    (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ url: 'x' }]);
    (getFaviconCacheStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 5 });
    (clearExpiredFavicons as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3); // healed
    (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    const res = await dispatch(registry, { type: 'RUN_TROUBLESHOOTER' });

    const data = res.data as StepData;
    expect(data.overallStatus).toBe('issues-remain');
    expect(stepById(data, 'db-open').status).toBe('fail');
    expect(stepById(data, 'favicon-cache').status).toBe('healed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

describe('settings-handlers', () => {
  let preInit: MessageHandlerRegistry;
  let postInit: MessageHandlerRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.tabsCreate.mockResolvedValue({});
    preInit = new MessageHandlerRegistry();
    postInit = new MessageHandlerRegistry();
    registerSettingsHandlers(preInit, postInit);
  });

  it('registers pre-init and post-init handlers into the correct registries', () => {
    expect(preInit.registeredTypes).toEqual(expect.arrayContaining([
      'PING',
      'OPEN_SETTINGS',
      'GET_LOG_LEVEL',
      'SET_LOG_LEVEL',
      'SETTINGS_CHANGED',
      'POPUP_PERF_LOG',
      'GET_SETTINGS',
    ]));
    expect(postInit.registeredTypes).toEqual(expect.arrayContaining([
      'FACTORY_RESET',
      'RESET_SETTINGS',
    ]));
    expect(preInit.has('FACTORY_RESET')).toBe(false);
    expect(postInit.has('PING')).toBe(false);
  });

  // ── Trivial handlers ──

  describe('trivial handlers', () => {
    it('PING returns ok', async () => {
      const res = await dispatch(preInit, { type: 'PING' });
      expect(res).toEqual({ status: 'ok' });
    });

    it('GET_LOG_LEVEL returns current Logger level', async () => {
      const res = await dispatch(preInit, { type: 'GET_LOG_LEVEL' });
      expect(res).toEqual({ logLevel: 'INFO' });
    });

    it('SET_LOG_LEVEL awaits Logger.setLevel and responds ok', async () => {
      const { Logger } = await import('../../../core/logger');
      const res = await dispatch(preInit, { type: 'SET_LOG_LEVEL', level: 'DEBUG' });
      expect((Logger as { setLevel: ReturnType<typeof vi.fn> }).setLevel).toHaveBeenCalledWith('DEBUG');
      expect(res).toEqual({ status: 'ok' });
    });

    it('POPUP_PERF_LOG logs and responds ok', async () => {
      const res = await dispatch(preInit, {
        type: 'POPUP_PERF_LOG',
        stage: 'opened',
        timestamp: 123,
        elapsedMs: 45,
      });
      expect(res).toEqual({ status: 'ok' });
    });

    it('GET_SETTINGS returns current settings snapshot', async () => {
      const res = await dispatch(preInit, { type: 'GET_SETTINGS' });
      expect(res).toEqual({ status: 'OK', settings: { theme: 'system' } });
    });
  });

  // ── OPEN_SETTINGS ──

  describe('OPEN_SETTINGS', () => {
    it('responds ok and requests the settings URL', async () => {
      const res = await dispatch(preInit, { type: 'OPEN_SETTINGS' });

      expect(res).toEqual({ status: 'ok' });
      expect(helperMocks.runtimeGetURL).toHaveBeenCalledWith('popup/popup.html#settings');
      expect(helperMocks.tabsCreate).toHaveBeenCalledWith({
        url: 'chrome-extension://mock/popup/popup.html#settings',
      });
    });

    it('suppresses tabs.create rejection via .catch branch', async () => {
      helperMocks.tabsCreate.mockRejectedValueOnce(new Error('tab create fail'));
      const res = await dispatch(preInit, { type: 'OPEN_SETTINGS' });
      expect(res).toEqual({ status: 'ok' });
      await Promise.resolve();
      await Promise.resolve();
    });

    it('accepts a non-Error rejection via the String(err) fallback in the .catch', async () => {
      helperMocks.tabsCreate.mockRejectedValueOnce('plain-string-error');
      const res = await dispatch(preInit, { type: 'OPEN_SETTINGS' });
      expect(res).toEqual({ status: 'ok' });
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // ── SETTINGS_CHANGED ──

  describe('SETTINGS_CHANGED', () => {
    it('responds ok and skips processing when msg.settings is absent', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const res = await dispatch(preInit, { type: 'SETTINGS_CHANGED' });
      expect(res).toEqual({ status: 'ok' });
      expect(SettingsManager.applyRemoteSettings).not.toHaveBeenCalled();
    });

    it('defaults wasEmbeddingsEnabled to false when prior value is undefined', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(undefined) // wasEmbeddingsEnabled → ?? false
        .mockReturnValueOnce(undefined) // oldEmbeddingModel → || 'nomic-embed-text'
        .mockReturnValueOnce(undefined) // nowEmbeddingsEnabled → ?? false
        .mockReturnValueOnce(undefined); // nowEmbeddingModel

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { theme: 'dark' },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(SettingsManager.applyRemoteSettings).toHaveBeenCalledWith({ theme: 'dark' });
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
      expect(embeddingProcessor.stop).not.toHaveBeenCalled();
    });

    it('starts processor when embeddings flip from off → on', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');
      (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: true },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.start).toHaveBeenCalled();
      expect(embeddingProcessor.stop).not.toHaveBeenCalled();
    });

    it('swallows processor start rejection via fire-and-forget .catch', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');
      (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('processor boom'),
      );

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: true },
      });

      expect(res).toEqual({ status: 'ok' });
      await Promise.resolve();
      await Promise.resolve();
    });

    it('accepts a non-Error rejection from processor start', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');
      (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'plain-string-error',
      );

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: true },
      });

      expect(res).toEqual({ status: 'ok' });
      await Promise.resolve();
      await Promise.resolve();
    });

    it('stops processor when embeddings flip from on → off', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text');

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: false },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.stop).toHaveBeenCalled();
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
    });

    it('stops processor when embedding model changes while enabled (normalizeModelName differs)', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)               // wasEmbeddingsEnabled
        .mockReturnValueOnce('nomic-embed-text')  // oldEmbeddingModel
        .mockReturnValueOnce(true)                // nowEmbeddingsEnabled
        .mockReturnValueOnce('mxbai-embed-large'); // nowEmbeddingModel (different)

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingModel: 'mxbai-embed-large' },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.stop).toHaveBeenCalled();
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
    });

    it('is a no-op for embeddings when both enabled and model unchanged', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { theme: 'dark' },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
      expect(embeddingProcessor.stop).not.toHaveBeenCalled();
    });

    it('normalizes model names for comparison (whitespace/case insensitive)', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('Nomic-Embed-Text ')  // before: extra whitespace + caps
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');   // after: normalized

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingModel: 'nomic-embed-text' },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
      expect(embeddingProcessor.stop).not.toHaveBeenCalled();
    });
  });

  // ── FACTORY_RESET / RESET_SETTINGS ──

  describe('FACTORY_RESET / RESET_SETTINGS', () => {
    it('FACTORY_RESET resets settings and rebuilds on success', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { clearAndRebuild } = await import('../../resilience');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      (clearAndRebuild as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(postInit, { type: 'FACTORY_RESET' });

      expect(res).toEqual({ status: 'OK' });
      expect(SettingsManager.resetToDefaults).toHaveBeenCalled();
      expect(clearAndRebuild).toHaveBeenCalled();
    });

    it('FACTORY_RESET returns { error } when resetToDefaults rejects', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('reset fail'),
      );

      const res = await dispatch(postInit, { type: 'FACTORY_RESET' });

      expect(res).toEqual({ error: 'reset fail' });
    });

    it('FACTORY_RESET returns { error } when clearAndRebuild rejects', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { clearAndRebuild } = await import('../../resilience');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      (clearAndRebuild as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('rebuild fail'));

      const res = await dispatch(postInit, { type: 'FACTORY_RESET' });

      expect(res).toEqual({ error: 'rebuild fail' });
    });

    it('RESET_SETTINGS resets to defaults on success', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(postInit, { type: 'RESET_SETTINGS' });

      expect(res).toEqual({ status: 'OK' });
    });

    it('RESET_SETTINGS returns { error } when reset rejects', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('reset boom'),
      );

      const res = await dispatch(postInit, { type: 'RESET_SETTINGS' });

      expect(res).toEqual({ error: 'reset boom' });
    });
  });
});
