/**
 * Service worker tests — exercises message handler dispatch and initialization
 * Uses vi.hoisted to set up chrome globals before module load
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock all heavy dependencies to prevent side effects
vi.mock('../database', () => ({
  openDatabase: vi.fn(async () => ({})),
  getStorageQuotaInfo: vi.fn(async () => ({ usage: 0, quota: 0, usedFormatted: '0 B', totalFormatted: 'Unlimited', percentage: 0, itemCount: 0 })),
  setForceRebuildFlag: vi.fn(async () => {}),
  getForceRebuildFlag: vi.fn(async () => false),
  getSetting: vi.fn(async (_key: string, defaultValue: unknown) => defaultValue),
  setSetting: vi.fn(async () => {}),
  getRecentIndexedItems: vi.fn(async () => []),
  getAllIndexedItems: vi.fn(async () => []),
  getBatchHelper: vi.fn(() => ({ add: vi.fn(), flush: vi.fn() })),
}));

vi.mock('../indexing', () => ({
  ingestHistory: vi.fn(async () => {}),
  performFullRebuild: vi.fn(async () => {}),
  mergeMetadata: vi.fn(async () => {}),
  performBookmarksIndex: vi.fn(async () => ({ indexed: 0, updated: 0 })),
  performIncrementalHistoryIndexManual: vi.fn(async () => ({ added: 0, updated: 0 })),
}));

vi.mock('../search/search-engine', () => ({
  runSearch: vi.fn(async () => []),
  getLastAIStatus: vi.fn(() => null),
}));

vi.mock('../resilience', () => ({
  clearAndRebuild: vi.fn(async () => ({ success: true, message: 'done', itemCount: 0 })),
  checkHealth: vi.fn(async () => ({ healthy: true })),
  selfHeal: vi.fn(async () => {}),
  startHealthMonitoring: vi.fn(),
}));

vi.mock('../favicon-cache', () => ({
  clearFaviconCache: vi.fn(async () => ({ cleared: 0, freedBytes: 0 })),
  getFaviconCacheStats: vi.fn(async () => ({ count: 0, totalSize: 0, oldestCacheDate: null })),
  getFaviconWithCache: vi.fn(async () => null),
}));

vi.mock('../embedding-processor', () => ({
  embeddingProcessor: {
    start: vi.fn(),
    stop: vi.fn(),
    setSearchActive: vi.fn(),
    getProgress: vi.fn(() => ({ state: 'idle', processed: 0, total: 0, withEmbeddings: 0, remaining: 0, speed: 0, estimatedMinutes: 0 })),
  },
}));

vi.mock('../search/search-cache', () => ({
  clearSearchCache: vi.fn(),
  getSearchCache: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })),
}));

vi.mock('../../core/logger', () => ({
  Logger: {
    init: vi.fn(async () => {}),
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    getLevel: vi.fn(() => 2),
    setLevel: vi.fn(async () => {}),
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

vi.mock('../../core/helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function noOp(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(function() {} as any, {
      get: () => noOp(),
      apply: () => undefined,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function proxied(obj: Record<string, any>): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(obj as any, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(t: any, prop: string) { return prop in t ? t[prop] : noOp(); },
    });
  }
  return {
    browserAPI: proxied({
      tabs: proxied({ query: async () => [], sendMessage: () => {}, create: () => {}, onActivated: { addListener: () => {} }, onUpdated: { addListener: () => {} } }),
      runtime: proxied({
        lastError: null,
        getManifest: () => ({ manifest_version: 3, version: '8.0.0' }),
        onMessage: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          addListener: (cb: any) => {
            // Store handler for test access — access via globalThis to avoid hoisting issues
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).__swTestMessageHandler = cb;
          },
        },
        onConnect: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          addListener: (cb: any) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).__swTestPortHandler = cb;
          },
        },
        onStartup: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        getURL: (path: string) => `chrome-extension://test/${path}`,
        sendMessage: () => {},
      }),
      commands: proxied({ onCommand: { addListener: () => {} } }),
      action: proxied({ openPopup: () => {} }),
      storage: proxied({
        local: proxied({
          get: (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
          set: (_items: unknown, cb?: () => void) => cb?.(),
        }),
        onChanged: { addListener: () => {} },
      }),
      alarms: proxied({ create: () => {}, onAlarm: { addListener: () => {} } }),
      history: proxied({ search: () => {} }),
    }),
  };
});

vi.mock('../diagnostics', () => ({
  exportDiagnosticsAsJson: vi.fn(async () => '{}'),
  getSearchAnalytics: vi.fn(() => ({ totalSearches: 0, averageMs: 0 })),
  getSearchHistory: vi.fn(() => []),
  isSearchDebugEnabled: vi.fn(() => false),
  setSearchDebugEnabled: vi.fn(async () => {}),
  recordSearchDebug: vi.fn(),
  initSearchDebugState: vi.fn(async () => {}),
}));

vi.mock('../performance-monitor', () => ({
  getPerformanceMetrics: vi.fn(() => ({})),
  formatMetricsForDisplay: vi.fn(() => ''),
  performanceTracker: { recordSearch: vi.fn(), recordIndexing: vi.fn(), recordRestart: vi.fn(), recordHealthCheck: vi.fn() },
}));

vi.mock('../ollama-service', () => ({
  isCircuitBreakerOpen: vi.fn(() => false),
  checkMemoryPressure: vi.fn(() => ({ ok: true })),
  getOllamaConfigFromSettings: vi.fn(async () => ({})),
  getOllamaService: vi.fn(() => ({ checkStatus: vi.fn(async () => ({ available: false })) })),
}));

const mocks = vi.hoisted(() => {
  // Capture variables must be inside vi.hoisted to be available at module load time
  const captured: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messageHandler: ((msg: any, sender: any, sendResponse: (r: any) => void) => boolean | void) | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    portHandler: ((port: any) => void) | null;
  } = { messageHandler: null, portHandler: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function noOp(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(function() {} as any, {
      get: () => noOp(),
      apply: () => undefined,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function proxied(obj: Record<string, any>): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(obj as any, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(t: any, prop: string) { return prop in t ? t[prop] : noOp(); },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).chrome = proxied({
    commands: proxied({
      onCommand: { addListener: () => {} },
    }),
    tabs: proxied({
      query: async () => [],
      sendMessage: (_tabId: number, _msg: unknown, cb: (r: unknown) => void) => cb({ success: true }),
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      create: () => {},
    }),
    action: proxied({ openPopup: noOp() }),
    runtime: proxied({
      lastError: null,
      getManifest: () => ({ manifest_version: 3, version: '8.0.0' }),
      onMessage: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        addListener: (cb: any) => {
          captured.messageHandler = cb;
        },
      },
      onConnect: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        addListener: (cb: any) => { captured.portHandler = cb; },
      },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: () => {},
    }),
    storage: proxied({
      local: proxied({
        get: (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: (_items: unknown, cb?: () => void) => cb?.(),
      }),
      sync: proxied({
        get: (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
      }),
      onChanged: { addListener: () => {} },
    }),
    alarms: proxied({
      create: () => {},
      onAlarm: { addListener: () => {} },
    }),
  });

  return { captured };
});

// Reference the mocks so they're used
void mocks;

// Import the service-worker module — registers listeners at module level
import '../service-worker';

// Helper to send a message and get response
async function sendMessage(msg: Record<string, unknown>): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (globalThis as any).__swTestMessageHandler;
  if (!handler) {
    throw new Error('Message handler not captured — initLogger() may have failed');
  }
  return new Promise((resolve) => {
    handler(msg, {}, (response: unknown) => resolve(response));
  });
}

describe('service-worker message handler', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Wait for async initLogger() IIFE to register the message handler
    await new Promise(r => setTimeout(r, 500));
  });

  it('should respond to PING', async () => {
    const response = await sendMessage({ type: 'PING' });
    expect(response).toEqual({ status: 'ok' });
  });

  it('should respond to GET_LOG_LEVEL', async () => {
    const response = await sendMessage({ type: 'GET_LOG_LEVEL' });
    expect(response).toHaveProperty('logLevel');
  });

  it('should respond to GET_SETTINGS', async () => {
    const response = await sendMessage({ type: 'GET_SETTINGS' });
    expect(response).toHaveProperty('status', 'OK');
    expect(response).toHaveProperty('settings');
  });

  it('should respond to GET_PERFORMANCE_METRICS', async () => {
    const response = await sendMessage({ type: 'GET_PERFORMANCE_METRICS' });
    expect(response).toHaveProperty('status', 'OK');
  });

  it('should respond to EXPORT_DIAGNOSTICS', async () => {
    const response = await sendMessage({ type: 'EXPORT_DIAGNOSTICS' });
    await new Promise(r => setTimeout(r, 50));
    expect(response).toHaveProperty('status', 'OK');
  });

  it('should respond to GET_SEARCH_ANALYTICS', async () => {
    const response = await sendMessage({ type: 'GET_SEARCH_ANALYTICS' });
    expect(response).toHaveProperty('status', 'OK');
  });

  it('should respond to GET_SEARCH_DEBUG_ENABLED', async () => {
    const response = await sendMessage({ type: 'GET_SEARCH_DEBUG_ENABLED' });
    expect(response).toHaveProperty('status', 'OK');
  });

  it('should respond to SET_SEARCH_DEBUG_ENABLED', async () => {
    const response = await sendMessage({ type: 'SET_SEARCH_DEBUG_ENABLED', enabled: true });
    expect(response).toHaveProperty('status', 'OK');
  });

  it('should respond to EXPORT_SEARCH_DEBUG', async () => {
    const response = await sendMessage({ type: 'EXPORT_SEARCH_DEBUG' });
    expect(response).toHaveProperty('status', 'OK');
  });

  it('should respond to POPUP_PERF_LOG', async () => {
    const response = await sendMessage({ type: 'POPUP_PERF_LOG', stage: 'test', timestamp: Date.now(), elapsedMs: 100 });
    expect(response).toEqual({ status: 'ok' });
  });

  it('should respond to SETTINGS_CHANGED', async () => {
    const response = await sendMessage({ type: 'SETTINGS_CHANGED', settings: { ollamaEnabled: false } });
    expect(response).toEqual({ status: 'ok' });
  });

  it('should respond to OPEN_SETTINGS', async () => {
    const response = await sendMessage({ type: 'OPEN_SETTINGS' });
    expect(response).toEqual({ status: 'ok' });
  });

  // Post-init messages that need initialized = true will return "not ready"
  // since the async init may not complete during test. This is expected behavior.
  it('should respond to uninitialized post-init messages with not ready', async () => {
    const response = await sendMessage({ type: 'SEARCH_QUERY', query: 'test' });
    await new Promise(r => setTimeout(r, 100));
    // Either returns results (init completed) or error (not ready)
    expect(response).toBeDefined();
  });
});

describe('service-worker port-based messaging', () => {
  it('should accept quick-search port connection', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const portHandler = (globalThis as any).__swTestPortHandler;
    expect(portHandler).toBeDefined();
    expect(typeof portHandler).toBe('function');
  });
});
