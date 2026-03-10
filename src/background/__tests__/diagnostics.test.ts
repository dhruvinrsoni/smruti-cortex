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
    it('does not record when debug is disabled', async () => {
      const { recordSearchDebug, getSearchHistory } = await import('../diagnostics');
      recordSearchDebug('test query', 5, 20);
      expect(getSearchHistory()).toHaveLength(0);
    });

    it('records when debug is enabled', async () => {
      const { recordSearchDebug, getSearchHistory, setSearchDebugEnabled } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
      recordSearchDebug('test query', 5, 20);
      const history = getSearchHistory();
      expect(history).toHaveLength(1);
      expect(history[0].query).toBe('test query');
      expect(history[0].resultCount).toBe(5);
      expect(history[0].duration).toBe(20);
    });

    it('limits history to 50 entries', async () => {
      const { recordSearchDebug, getSearchHistory, setSearchDebugEnabled } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
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
      const { getSearchHistory, setSearchDebugEnabled, recordSearchDebug } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
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
    });

    it('calculates analytics from recorded searches', async () => {
      const { getSearchAnalytics, setSearchDebugEnabled, recordSearchDebug } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
      recordSearchDebug('react', 10, 30);
      recordSearchDebug('react', 6, 20);
      recordSearchDebug('vue', 4, 10);
      const analytics = getSearchAnalytics();
      expect(analytics.totalSearches).toBe(3);
      expect(analytics.averageResults).toBeCloseTo(20 / 3, 1);
      expect(analytics.averageDuration).toBeCloseTo(60 / 3, 1);
    });

    it('lists top queries by frequency', async () => {
      const { getSearchAnalytics, setSearchDebugEnabled, recordSearchDebug } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
      recordSearchDebug('react', 5, 10);
      recordSearchDebug('react', 5, 10);
      recordSearchDebug('vue', 5, 10);
      const analytics = getSearchAnalytics();
      expect(analytics.topQueries[0].query).toBe('react');
      expect(analytics.topQueries[0].count).toBe(2);
    });

    it('includes recentSearches', async () => {
      const { getSearchAnalytics, setSearchDebugEnabled, recordSearchDebug } = await import('../diagnostics');
      await setSearchDebugEnabled(true);
      recordSearchDebug('last query', 3, 15);
      const analytics = getSearchAnalytics();
      expect(analytics.recentSearches).toBeDefined();
      expect(Array.isArray(analytics.recentSearches)).toBe(true);
    });
  });

  describe('registerCollector', () => {
    it('registers a collector without throwing', async () => {
      const { registerCollector } = await import('../diagnostics');
      const collector = { name: 'test', collect: vi.fn().mockResolvedValue({}) };
      expect(() => registerCollector(collector)).not.toThrow();
    });
  });
});
