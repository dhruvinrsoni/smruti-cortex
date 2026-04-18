import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';

// Hoisted mutable mock so vi.mock factory can reference it (vitest hoists vi.mock)
let runSearchMock: any = vi.fn();

vi.mock('../search/search-engine', () => ({
  runSearch: (...args: any[]) => runSearchMock(...args),
  getLastAIStatus: () => ({ status: 'none' }),
}));

// Speed up init: mock heavy dependencies so the service-worker init completes fast
vi.mock('../database', () => ({
  openDatabase: vi.fn(async () => ({})),
  getStorageQuotaInfo: vi.fn(async () => ({ usage: 0, quota: 0, usedFormatted: '0 B', totalFormatted: '0 B', percentage: 0, itemCount: 0 })),
  setForceRebuildFlag: vi.fn(async () => {}),
  getForceRebuildFlag: vi.fn(async () => false),
  getSetting: vi.fn(async (_k: string, d: any) => d),
  setSetting: vi.fn(async () => {}),
  getAllIndexedItems: vi.fn(async () => []),
  saveIndexedItem: vi.fn(async () => {}),
}));

vi.mock('../indexing', () => ({
  ingestHistory: vi.fn(async () => {}),
  performFullRebuild: vi.fn(async () => {}),
}));

vi.mock('../resilience', () => ({
  ensureReady: async () => true,
  clearAndRebuild: async () => ({ success: true, itemCount: 0, message: 'ok' }),
  startHealthMonitoring: () => {},
  recoverFromCorruption: async () => true,
  handleQuotaExceeded: async () => {},
}));

vi.mock('../../core/logger', () => ({
  Logger: {
    init: async () => {},
    forComponent: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} }),
    getLevel: () => 2,
    setLevel: async () => {},
  },
}));

vi.mock('../../core/settings', () => ({
  SettingsManager: {
    init: vi.fn(async () => {}),
    getSetting: vi.fn(() => false),
    getSettings: vi.fn(() => ({})),
    applyRemoteSettings: vi.fn(async () => {}),
  },
}));

describe('service-worker: quick-search port', () => {
  beforeEach(async () => {
    // Reset mocks and set default runSearch behavior
    vi.clearAllMocks();
    runSearchMock.mockReset();
    runSearchMock.mockResolvedValue([{ id: '1', title: 'Result 1', url: 'https://example.com/1' }]);

    // Import the service-worker module (registers onConnect listener)
    await import('../service-worker');

    // Allow async init IIFE to complete (fast because heavy deps are mocked)
    await new Promise((r) => setTimeout(r, 200));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('handles SEARCH_QUERY through quick-search port (success path)', async () => {
    const posted: any[] = [];
    const listeners: any = {};

    const port = {
      name: 'quick-search',
      onMessage: { addListener(fn: any) { listeners.message = fn; }, removeListener() { listeners.message = undefined; } },
      onDisconnect: { addListener(fn: any) { listeners.disconnect = fn; }, removeListener() { listeners.disconnect = undefined; } },
      postMessage: (m: any) => posted.push(m),
    } as any;

    // Simulate a port connection
    (globalThis as any).__chromeMocks.callOnConnect(port);

    expect(typeof listeners.message).toBe('function');

    const respPromise = new Promise((resolve) => {
      const orig = port.postMessage;
      // Override to resolve on first post
      port.postMessage = (m: any) => resolve(m);
    });

    // Send a search query through the port
    listeners.message({ type: 'SEARCH_QUERY', query: 'hello' });

    const resp: any = await respPromise;
    expect(runSearchMock).toHaveBeenCalledWith('hello', { skipAI: false });
    expect(resp).toHaveProperty('results');
    expect(Array.isArray(resp.results)).toBe(true);
    expect(resp.results[0]).toMatchObject({ title: 'Result 1', url: 'https://example.com/1' });
    expect(resp).toHaveProperty('query', 'hello');
  });

  it('rate-limits quick-search port after threshold', async () => {
    const posted: any[] = [];
    const listeners: any = {};

    const port = {
      name: 'quick-search',
      onMessage: { addListener(fn: any) { listeners.message = fn; }, removeListener() { listeners.message = undefined; } },
      onDisconnect: { addListener(fn: any) { listeners.disconnect = fn; }, removeListener() { listeners.disconnect = undefined; } },
      postMessage: (m: any) => posted.push(m),
    } as any;

    (globalThis as any).__chromeMocks.callOnConnect(port);
    expect(typeof listeners.message).toBe('function');

    // Fire more than PORT_RATE_LIMIT queries quickly
    for (let i = 0; i < 35; i++) {
      listeners.message({ type: 'SEARCH_QUERY', query: `q${i}` });
    }

    // Allow background processing
    await new Promise((r) => setTimeout(r, 300));

    // One of the posted messages should indicate rate limiting
    const rateLimited = posted.some((p: any) => p && p.error === 'Rate limited');
    expect(rateLimited).toBe(true);
  });
});

export {};
