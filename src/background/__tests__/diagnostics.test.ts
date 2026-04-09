// Tests for diagnostics.ts — module-level state functions

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must use vi.resetModules() for module-level state isolation
// All setup must happen inside each test via dynamic imports

describe('diagnostics module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: vi.fn(() => ({ name: 'Test', version: '1.0', manifest_version: 3 })),
        lastError: null,
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    vi.doMock('../../core/logger', () => ({
      Logger: {
        info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
        forComponent: () => ({
          info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
        }),
      },
    }));

    vi.doMock('../../core/settings', () => ({
      SettingsManager: {
        init: vi.fn().mockResolvedValue(undefined),
        getSettings: vi.fn().mockReturnValue({ sensitiveUrlBlacklist: [] }),
        getSetting: vi.fn().mockReturnValue(false),
      },
    }));

    vi.doMock('../database', () => ({
      getAllIndexedItems: vi.fn().mockResolvedValue([]),
      getStorageQuotaInfo: vi.fn().mockResolvedValue({ bytesInUse: 0, quota: 0 }),
    }));

    vi.doMock('../resilience', () => ({
      checkHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
    }));
  });

  describe('isSearchDebugEnabled', () => {
    it('returns false by default', async () => {
      const { isSearchDebugEnabled } = await import('../diagnostics');
      expect(isSearchDebugEnabled()).toBe(false);
    });
  });

  describe('setSearchDebugEnabled', () => {
    it('sets debug enabled to true', async () => {
      const { isSearchDebugEnabled, setSearchDebugEnabled } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
      expect(isSearchDebugEnabled()).toBe(true);
    });

    it('sets debug enabled to false', async () => {
      const { setSearchDebugEnabled, isSearchDebugEnabled } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
      await setSearchDebugEnabled(false);
      expect(isSearchDebugEnabled()).toBe(false);
    });

    it('persists to chrome.storage.local', async () => {
      const { setSearchDebugEnabled } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ searchDebugEnabled: true });
    });
  });

  describe('initSearchDebugState', () => {
    it('reads from chrome.storage.local', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({ searchDebugEnabled: true } as unknown as void);
      const { initSearchDebugState, isSearchDebugEnabled } = await import('../diagnostics');
      await initSearchDebugState();
      expect(isSearchDebugEnabled()).toBe(true);
    });

    it('defaults to false if not in storage', async () => {
      vi.mocked(chrome.storage.local.get).mockResolvedValueOnce({} as unknown as void);
      const { initSearchDebugState, isSearchDebugEnabled } = await import('../diagnostics');
      await initSearchDebugState();
      expect(isSearchDebugEnabled()).toBe(false);
    });
  });

  describe('recordSearchDebug', () => {
    it('always records regardless of debug flag', async () => {
      const { recordSearchDebug, getSearchHistory } = await import('../diagnostics');
      recordSearchDebug('test query', 5, 20);
      const history = getSearchHistory();
      expect(history).toHaveLength(1);
      expect(history[0].query).toBe('test query');
      expect(history[0].resultCount).toBe(5);
      expect(history[0].duration).toBe(20);
    });

    it('limits history to 50 entries', async () => {
      const { recordSearchDebug, getSearchHistory } = await import('../diagnostics');
      for (let i = 0; i < 55; i++) {
        recordSearchDebug(`query ${i}`, i, i * 10);
      }
      expect(getSearchHistory()).toHaveLength(50);
    });
  });

  describe('getSearchHistory', () => {
    it('returns empty array initially', async () => {
      const { getSearchHistory } = await import('../diagnostics');
      expect(getSearchHistory()).toEqual([]);
    });

    it('returns a copy (not internal reference)', async () => {
      const { getSearchHistory, recordSearchDebug } = await import('../diagnostics');
      recordSearchDebug('query', 1, 10);
      const h1 = getSearchHistory();
      const h2 = getSearchHistory();
      expect(h1).not.toBe(h2);
    });
  });

  describe('getSearchAnalytics', () => {
    it('returns zeros when history is empty', async () => {
      const { getSearchAnalytics } = await import('../diagnostics');
      const analytics = getSearchAnalytics();
      expect(analytics.totalSearches).toBe(0);
      expect(analytics.averageResults).toBe(0);
      expect(analytics.averageDuration).toBe(0);
      expect(analytics.topQueries).toEqual([]);
      expect(analytics.queryLengthDistribution).toEqual({});
    });

    it('calculates analytics from recorded searches', async () => {
      const { getSearchAnalytics, recordSearchDebug } = await import('../diagnostics');
      recordSearchDebug('react', 10, 30);
      recordSearchDebug('react', 6, 20);
      recordSearchDebug('vue', 4, 10);
      const analytics = getSearchAnalytics();
      expect(analytics.totalSearches).toBe(3);
      expect(analytics.averageResults).toBeCloseTo(20 / 3, 1);
      expect(analytics.averageDuration).toBeCloseTo(60 / 3, 1);
    });

    it('lists top queries by frequency', async () => {
      const { getSearchAnalytics, recordSearchDebug } = await import('../diagnostics');
      recordSearchDebug('react', 5, 10);
      recordSearchDebug('react', 5, 10);
      recordSearchDebug('vue', 5, 10);
      const analytics = getSearchAnalytics();
      expect(analytics.topQueries[0].query).toBe('react');
      expect(analytics.topQueries[0].count).toBe(2);
    });

    it('includes recentSearches', async () => {
      const { getSearchAnalytics, recordSearchDebug } = await import('../diagnostics');
      recordSearchDebug('last query', 3, 15);
      const analytics = getSearchAnalytics();
      expect(analytics.recentSearches).toBeDefined();
      expect(Array.isArray(analytics.recentSearches)).toBe(true);
    });

    it('computes queryLengthDistribution', async () => {
      const { getSearchAnalytics, recordSearchDebug } = await import('../diagnostics');
      recordSearchDebug('hi', 1, 5);
      recordSearchDebug('hey', 2, 10);
      recordSearchDebug('hi', 1, 5);
      recordSearchDebug('hello world', 3, 15);
      const analytics = getSearchAnalytics();
      expect(analytics.queryLengthDistribution[2]).toBe(2);
      expect(analytics.queryLengthDistribution[3]).toBe(1);
      expect(analytics.queryLengthDistribution[11]).toBe(1);
    });
  });

  describe('registerCollector', () => {
    it('registers a collector without throwing', async () => {
      const { registerCollector } = await import('../diagnostics');
      const collector = { name: 'test', collect: vi.fn().mockResolvedValue({}) };
      expect(() => registerCollector(collector)).not.toThrow();
    });
  });

  describe('generateDiagnosticReport', () => {
    it('returns a report with all built-in collectors', async () => {
      const { generateDiagnosticReport } = await import('../diagnostics');
      const report = await generateDiagnosticReport();
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('version');
      expect(report).toHaveProperty('collectors');
      // Built-in collectors: system, storage, settings, health, performance
      expect(report.collectors).toHaveProperty('system');
      expect(report.collectors).toHaveProperty('storage');
      expect(report.collectors).toHaveProperty('settings');
      expect(report.collectors).toHaveProperty('health');
      expect(report.collectors).toHaveProperty('performance');
    });

    it('handles collector errors gracefully', async () => {
      const { generateDiagnosticReport, registerCollector } = await import('../diagnostics');
      registerCollector({
        name: 'failing',
        collect: async () => { throw new Error('test error'); },
      });
      const report = await generateDiagnosticReport();
      expect(report.collectors.failing).toEqual({ error: 'test error' });
    });
  });

  describe('exportDiagnosticsAsJson', () => {
    it('returns valid JSON string', async () => {
      const { exportDiagnosticsAsJson } = await import('../diagnostics');
      const json = await exportDiagnosticsAsJson();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('generatedAt');
      expect(parsed).toHaveProperty('collectors');
    });
  });

  describe('exportDiagnosticsAsText', () => {
    it('returns formatted text with section headers', async () => {
      const { exportDiagnosticsAsText } = await import('../diagnostics');
      const text = await exportDiagnosticsAsText();
      expect(text).toContain('SmrutiCortex Diagnostic Report');
      expect(text).toContain('SYSTEM');
      expect(text).toContain('STORAGE');
      expect(text).toContain('SETTINGS');
      expect(text).toContain('HEALTH');
      expect(text).toContain('PERFORMANCE');
    });
  });

  describe('built-in collectors', () => {
    it('system collector returns extension and browser info', async () => {
      const { generateDiagnosticReport } = await import('../diagnostics');
      const report = await generateDiagnosticReport();
      const system = report.collectors.system as Record<string, unknown>;
      expect(system).toHaveProperty('extension');
      expect(system).toHaveProperty('browser');
      expect(system).toHaveProperty('timestamp');
    });

    it('storage collector returns quota and index stats', async () => {
      const { generateDiagnosticReport } = await import('../diagnostics');
      const report = await generateDiagnosticReport();
      const storage = report.collectors.storage as Record<string, unknown>;
      expect(storage).toHaveProperty('quota');
      expect(storage).toHaveProperty('indexStats');
    });

    it('settings collector returns sanitized settings', async () => {
      const { generateDiagnosticReport } = await import('../diagnostics');
      const report = await generateDiagnosticReport();
      // Settings collector should return settings object
      expect(report.collectors.settings).toBeDefined();
    });

    it('health collector returns health status', async () => {
      const { generateDiagnosticReport } = await import('../diagnostics');
      const report = await generateDiagnosticReport();
      expect(report.collectors.health).toEqual({ status: 'healthy' });
    });

    it('performance collector returns timing info', async () => {
      const { generateDiagnosticReport } = await import('../diagnostics');
      const report = await generateDiagnosticReport();
      const perf = report.collectors.performance as Record<string, unknown>;
      expect(perf).toHaveProperty('timing');
      expect(perf).toHaveProperty('memory');
    });
  });
});
