import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';

// Hoisted mocks for module-level imports
let performFullRebuildMock: any = vi.fn();
let handleQuotaExceededMock: any = vi.fn(async () => {});
let clearSearchCacheMock: any = vi.fn();

vi.mock('../indexing', () => ({
  performFullRebuild: (...args: any[]) => performFullRebuildMock(...args),
  ingestHistory: vi.fn(async () => {}),
}));

vi.mock('../resilience', () => ({
  ensureReady: async () => true,
  handleQuotaExceeded: (...args: any[]) => handleQuotaExceededMock(...args),
  clearAndRebuild: async () => ({ success: true, itemCount: 0, message: 'ok' }),
  startHealthMonitoring: () => {},
  recoverFromCorruption: async () => true,
}));

vi.mock('../search/search-cache', () => ({
  clearSearchCache: (...args: any[]) => clearSearchCacheMock(...args),
}));

vi.mock('../../core/logger', () => ({
  Logger: {
    init: async () => {},
    forComponent: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} }),
    getLevel: () => 2,
    setLevel: async () => {},
  },
}));

vi.mock('../database', () => ({
  openDatabase: vi.fn(async () => ({})),
  getStorageQuotaInfo: vi.fn(async () => ({ usage: 0, quota: 0 })),
  setForceRebuildFlag: vi.fn(async () => {}),
  getForceRebuildFlag: vi.fn(async () => false),
  getAllIndexedItems: vi.fn(async () => []),
  saveIndexedItem: vi.fn(async () => {}),
}));

vi.mock('../../core/settings', () => ({
  SettingsManager: { init: vi.fn(async () => {}), getSetting: vi.fn(() => false), getSettings: vi.fn(() => ({})), applyRemoteSettings: vi.fn(async () => {}) },
}));

describe('service-worker: REBUILD_INDEX', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    performFullRebuildMock.mockReset();
    performFullRebuildMock.mockResolvedValue(undefined);
    handleQuotaExceededMock.mockReset();
    clearSearchCacheMock.mockReset();

    // Import service-worker after mocks are defined so module-level listeners register with hoisted chrome stub
    await import('../service-worker');
    // Allow any async init to run briefly (fast because heavy deps are mocked)
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('responds OK on successful REBUILD_INDEX and clears search cache', async () => {
    const sendResponse = vi.fn();
    const respPromise = new Promise((resolve) => sendResponse.mockImplementation((r: any) => resolve(r)));

    (globalThis as any).__chromeMocks.callOnMessage({ type: 'REBUILD_INDEX' }, {}, sendResponse);

    const resp: any = await respPromise;
    expect(resp).toHaveProperty('status', 'OK');
    expect(resp).toHaveProperty('message', 'Index rebuilt successfully');
    expect(clearSearchCacheMock).toHaveBeenCalled();
  });

  it('calls handleQuotaExceeded and returns ERROR when performFullRebuild throws QuotaExceededError', async () => {
    const e: any = new Error('quota');
    e.name = 'QuotaExceededError';
    performFullRebuildMock.mockRejectedValue(e);

    const sendResponse = vi.fn();
    const respPromise = new Promise((resolve) => sendResponse.mockImplementation((r: any) => resolve(r)));

    (globalThis as any).__chromeMocks.callOnMessage({ type: 'REBUILD_INDEX' }, {}, sendResponse);

    const resp: any = await respPromise;
    expect(handleQuotaExceededMock).toHaveBeenCalled();
    expect(resp).toHaveProperty('status', 'ERROR');
    expect(resp).toHaveProperty('message', 'quota');
  });
});

export {};
