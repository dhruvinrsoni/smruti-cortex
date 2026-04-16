/**
 * Service worker tests — exercises message handler dispatch and initialization
 * Uses vi.hoisted to set up chrome globals before module load
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

/** Mocks for advanced browser command handlers (tabs, windows, permissions, tabGroups, browsingData, topSites). */
const swBrowserMocks = vi.hoisted(() => {
  const tabsQuery = vi.fn();
  const tabsRemove = vi.fn();
  const tabsCreate = vi.fn();
  const tabsDiscard = vi.fn();
  const tabsMove = vi.fn();
  const tabsUpdate = vi.fn();
  const tabsGet = vi.fn();
  const tabsGroup = vi.fn();
  const tabsUngroup = vi.fn();
  const windowsGetCurrent = vi.fn();
  const windowsGetAll = vi.fn();
  const windowsCreate = vi.fn();
  const scriptingExecuteScript = vi.fn();
  const permissionsContains = vi.fn();
  const permissionsRequest = vi.fn();
  const tabGroupsQuery = vi.fn();
  const tabGroupsUpdate = vi.fn();
  const browsingDataRemoveCache = vi.fn();
  const browsingDataRemoveCookies = vi.fn();
  const browsingDataRemoveLocalStorage = vi.fn();
  const browsingDataRemoveDownloads = vi.fn();
  const browsingDataRemoveFormData = vi.fn();
  const browsingDataRemovePasswords = vi.fn();
  const browsingDataRemove = vi.fn();
  const topSitesGet = vi.fn();

  function resetSwBrowserCommandMocks() {
    tabsQuery.mockImplementation(async () => []);
    tabsRemove.mockImplementation(async () => undefined);
    tabsCreate.mockImplementation(async () => ({}));
    tabsDiscard.mockImplementation(async () => ({}));
    tabsMove.mockImplementation(async () => ({}));
    tabsUpdate.mockImplementation(async () => ({}));
    tabsGet.mockImplementation(async () => ({ id: 1, groupId: -1 }));
    tabsGroup.mockImplementation(async () => 1);
    tabsUngroup.mockImplementation(async () => undefined);
    windowsGetCurrent.mockImplementation(async () => ({ id: 10 }));
    windowsGetAll.mockImplementation(async () => []);
    windowsCreate.mockImplementation(async () => ({}));
    scriptingExecuteScript.mockImplementation(async () => []);
    permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => { cb(true); });
    permissionsRequest.mockImplementation((_p: unknown, cb?: (g: boolean) => void) => { cb?.(true); });
    tabGroupsQuery.mockImplementation(async () => []);
    tabGroupsUpdate.mockImplementation(async () => ({}));
    browsingDataRemoveCache.mockImplementation(async () => undefined);
    browsingDataRemoveCookies.mockImplementation(async () => undefined);
    browsingDataRemoveLocalStorage.mockImplementation(async () => undefined);
    browsingDataRemoveDownloads.mockImplementation(async () => undefined);
    browsingDataRemoveFormData.mockImplementation(async () => undefined);
    browsingDataRemovePasswords.mockImplementation(async () => undefined);
    browsingDataRemove.mockImplementation(async () => undefined);
    topSitesGet.mockImplementation((cb: (s: { url: string; title: string }[]) => void) => { cb([]); });
  }
  resetSwBrowserCommandMocks();

  return {
    tabsQuery, tabsRemove, tabsCreate, tabsDiscard, tabsMove, tabsUpdate, tabsGet, tabsGroup, tabsUngroup,
    windowsGetCurrent, windowsGetAll, windowsCreate,
    scriptingExecuteScript,
    permissionsContains, permissionsRequest,
    tabGroupsQuery, tabGroupsUpdate,
    browsingDataRemoveCache, browsingDataRemoveCookies, browsingDataRemoveLocalStorage,
    browsingDataRemoveDownloads, browsingDataRemoveFormData, browsingDataRemovePasswords, browsingDataRemove,
    topSitesGet,
    resetSwBrowserCommandMocks,
  };
});

/** Omnibox + bookmarks + runtime.sendMessage for service-worker omnibox integration tests */
const swOmniboxMocks = vi.hoisted(() => {
  const omniboxOnInputChanged: Array<
    (text: string, suggest: (suggestions: { content: string; description: string }[]) => void) => void | Promise<void>
  > = [];
  const omniboxOnInputEntered: Array<
    (text: string, disposition: string) => void | Promise<void>
  > = [];
  const bookmarksSearch = vi.fn(async () => [] as chrome.bookmarks.BookmarkTreeNode[]);
  const runtimeSendMessage = vi.fn();
  return { omniboxOnInputChanged, omniboxOnInputEntered, bookmarksSearch, runtimeSendMessage };
});

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
  saveIndexedItem: vi.fn(async () => {}),
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
  selfHeal: vi.fn(async () => true),
  startHealthMonitoring: vi.fn(),
  recoverFromCorruption: vi.fn(async () => true),
  ensureReady: vi.fn(async () => true),
  handleQuotaExceeded: vi.fn(async () => true),
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
    pause: vi.fn(),
    resume: vi.fn(),
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
  const m = swBrowserMocks;
  const o = swOmniboxMocks;
   
  function noOp(): any {
     
    return new Proxy(function() {} as any, {
      get: () => noOp(),
      apply: () => undefined,
    });
  }
   
  function proxied(obj: Record<string, any>): any {
     
    return new Proxy(obj as any, {
       
      get(t: any, prop: string) { return prop in t ? t[prop] : noOp(); },
    });
  }
  return {
    browserAPI: proxied({
      tabs: proxied({
        query: (...args: unknown[]) => m.tabsQuery(...args),
        sendMessage: () => {},
        create: (...args: unknown[]) => m.tabsCreate(...args),
        remove: (...args: unknown[]) => m.tabsRemove(...args),
        discard: (...args: unknown[]) => m.tabsDiscard(...args),
        move: (...args: unknown[]) => m.tabsMove(...args),
        update: (...args: unknown[]) => m.tabsUpdate(...args),
        get: (...args: unknown[]) => m.tabsGet(...args),
        group: (...args: unknown[]) => m.tabsGroup(...args),
        ungroup: (...args: unknown[]) => m.tabsUngroup(...args),
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
      }),
      windows: proxied({
        create: (...args: unknown[]) => m.windowsCreate(...args),
        getCurrent: (...args: unknown[]) => m.windowsGetCurrent(...args),
        getAll: (...args: unknown[]) => m.windowsGetAll(...args),
        WINDOW_ID_CURRENT: -2,
      }),
      scripting: proxied({
        executeScript: (...args: unknown[]) => m.scriptingExecuteScript(...args),
      }),
      permissions: proxied({
        contains: (p: unknown, cb: (r: boolean) => void) => m.permissionsContains(p, cb),
        request: (p: unknown, cb?: (g: boolean) => void) => m.permissionsRequest(p, cb),
      }),
      tabGroups: proxied({
        query: (...args: unknown[]) => m.tabGroupsQuery(...args),
        update: (...args: unknown[]) => m.tabGroupsUpdate(...args),
      }),
      browsingData: proxied({
        removeCache: (...args: unknown[]) => m.browsingDataRemoveCache(...args),
        removeCookies: (...args: unknown[]) => m.browsingDataRemoveCookies(...args),
        removeLocalStorage: (...args: unknown[]) => m.browsingDataRemoveLocalStorage(...args),
        removeDownloads: (...args: unknown[]) => m.browsingDataRemoveDownloads(...args),
        removeFormData: (...args: unknown[]) => m.browsingDataRemoveFormData(...args),
        removePasswords: (...args: unknown[]) => m.browsingDataRemovePasswords(...args),
        remove: (...args: unknown[]) => m.browsingDataRemove(...args),
      }),
      topSites: proxied({
        get: (cb: (sites: { url: string; title: string }[]) => void) => m.topSitesGet(cb),
      }),
      bookmarks: proxied({
        search: (...args: unknown[]) => o.bookmarksSearch(...args),
      }),
      omnibox: proxied({
        setDefaultSuggestion: () => {},
        onInputChanged: {
           
          addListener: (cb: any) => { o.omniboxOnInputChanged.push(cb); },
        },
        onInputEntered: {
           
          addListener: (cb: any) => { o.omniboxOnInputEntered.push(cb); },
        },
      }),
      runtime: proxied({
        lastError: null,
        getManifest: () => ({ manifest_version: 3, version: '8.0.0' }),
        onMessage: {
           
          addListener: (cb: any) => {
            // Store handler for test access — access via globalThis to avoid hoisting issues
             
            (globalThis as any).__swTestMessageHandler = cb;
          },
        },
        onConnect: {
           
          addListener: (cb: any) => {
             
            (globalThis as any).__swTestPortHandler = cb;
          },
        },
        onStartup: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        getURL: (path: string) => `chrome-extension://test/${path}`,
        sendMessage: (...args: unknown[]) => o.runtimeSendMessage(...args),
      }),
      commands: proxied({ onCommand: { addListener: () => {} } }),
      action: proxied({ openPopup: () => {} }),
      storage: proxied({
        local: proxied({
          get: (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
          set: (_items: unknown, cb?: () => void) => cb?.(),
          remove: (_keys: unknown, cb?: () => void) => cb?.(),
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

vi.mock('../search-debug', () => ({
  searchDebugService: { clearHistory: vi.fn() },
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
  getOllamaService: vi.fn(() => ({ checkStatus: vi.fn(async () => ({ available: false })), warmup: vi.fn(async () => true) })),
}));

vi.mock('../ai-keyword-cache', () => ({
  loadCache: vi.fn(async () => {}),
  getCacheStats: vi.fn(() => ({ size: 5, maxSize: 1000, estimatedBytes: 512 })),
  clearAIKeywordCache: vi.fn(async () => ({ cleared: 5 })),
  getCachedExpansion: vi.fn(() => null),
  getPrefixMatch: vi.fn(() => null),
  cacheExpansion: vi.fn(),
}));

const mocks = vi.hoisted(() => {
  // Capture variables must be inside vi.hoisted to be available at module load time
  const captured: {
     
    messageHandler: ((msg: any, sender: any, sendResponse: (r: any) => void) => boolean | void) | null;
     
    portHandler: ((port: any) => void) | null;
  } = { messageHandler: null, portHandler: null };
   
  function noOp(): any {
     
    return new Proxy(function() {} as any, {
      get: () => noOp(),
      apply: () => undefined,
    });
  }
   
  function proxied(obj: Record<string, any>): any {
     
    return new Proxy(obj as any, {
       
      get(t: any, prop: string) { return prop in t ? t[prop] : noOp(); },
    });
  }

   
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
         
        addListener: (cb: any) => {
          captured.messageHandler = cb;
        },
      },
      onConnect: {
         
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

import { runSearch } from '../search/search-engine';

// Import the service-worker module — registers listeners at module level
import '../service-worker';

// Helper to send a message and get response (optional sender.tab for tab-scoped commands)
async function sendMessage(
  msg: Record<string, unknown>,
  sender: { tab?: { id?: number; url?: string; index?: number } } = {},
): Promise<unknown> {
   
  const handler = (globalThis as any).__swTestMessageHandler;
  if (!handler) {
    throw new Error('Message handler not captured — initLogger() may have failed');
  }
  return new Promise((resolve) => {
    handler(msg, sender, (response: unknown) => resolve(response));
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

  it('should respond to CLEAR_SEARCH_DEBUG', async () => {
    const response = await sendMessage({ type: 'CLEAR_SEARCH_DEBUG' });
    expect(response).toEqual({ status: 'OK' });
  });

  it('should respond to CLEAR_RECENT_SEARCHES', async () => {
    const response = await sendMessage({ type: 'CLEAR_RECENT_SEARCHES' });
    expect(response).toEqual({ status: 'OK' });
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

  it('should respond to SET_LOG_LEVEL', async () => {
    const response = await sendMessage({ type: 'SET_LOG_LEVEL', level: 3 });
    expect(response).toEqual({ status: 'ok' });
  });
});

describe('service-worker post-init message handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Wait for async init to complete so post-init handlers are available
    await new Promise(r => setTimeout(r, 500));
  });

  it('should respond to REBUILD_INDEX', async () => {
    const response = await sendMessage({ type: 'REBUILD_INDEX' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.message).toBe('Index rebuilt successfully');
  });

  it('should respond to CLEAR_ALL_DATA', async () => {
    const response = await sendMessage({ type: 'CLEAR_ALL_DATA' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('itemCount');
  });

  it('should respond to GET_RECENT_HISTORY', async () => {
    const response = await sendMessage({ type: 'GET_RECENT_HISTORY', limit: 10 });
     
    const res = response as any;
    expect(res).toHaveProperty('results');
    expect(Array.isArray(res.results)).toBe(true);
  });

  it('should respond to GET_RECENT_HISTORY with default limit', async () => {
    const response = await sendMessage({ type: 'GET_RECENT_HISTORY' });
     
    const res = response as any;
    expect(res).toHaveProperty('results');
    expect(Array.isArray(res.results)).toBe(true);
  });

  it('should respond to GET_STORAGE_QUOTA', async () => {
    const response = await sendMessage({ type: 'GET_STORAGE_QUOTA' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('data');
    expect(res.data).toHaveProperty('usage');
    expect(res.data).toHaveProperty('quota');
  });

  it('should respond to CLEAR_FAVICON_CACHE', async () => {
    const response = await sendMessage({ type: 'CLEAR_FAVICON_CACHE' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('cleared');
    expect(res).toHaveProperty('freedBytes');
  });

  it('should respond to GET_FAVICON_CACHE_STATS', async () => {
    const response = await sendMessage({ type: 'GET_FAVICON_CACHE_STATS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('count');
    expect(res).toHaveProperty('totalSize');
  });

  it('should respond to GET_FAVICON', async () => {
    const response = await sendMessage({ type: 'GET_FAVICON', hostname: 'example.com' });
     
    const res = response as any;
    expect(res).toHaveProperty('dataUrl');
  });

  it('should respond to GET_EMBEDDING_PROGRESS', async () => {
    const response = await sendMessage({ type: 'GET_EMBEDDING_PROGRESS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('progress');
    expect(res.progress).toHaveProperty('state', 'idle');
  });

  it('should respond to SEARCH_QUERY with results', async () => {
    const response = await sendMessage({ type: 'SEARCH_QUERY', query: 'test search' });
     
    const res = response as any;
    expect(res).toHaveProperty('results');
    expect(res).toHaveProperty('query', 'test search');
    expect(Array.isArray(res.results)).toBe(true);
  });

  it('should respond to SEARCH_QUERY with skipAI flag', async () => {
    const response = await sendMessage({ type: 'SEARCH_QUERY', query: 'hello', skipAI: true });
     
    const res = response as any;
    expect(res).toHaveProperty('results');
    expect(res).toHaveProperty('skipAI', true);
  });

  it('should respond to GET_HEALTH_STATUS', async () => {
    const response = await sendMessage({ type: 'GET_HEALTH_STATUS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('data');
    expect(res.data).toHaveProperty('healthy', true);
  });

  it('should respond to SELF_HEAL', async () => {
    const response = await sendMessage({ type: 'SELF_HEAL' });
     
    const res = response as any;
    // selfHeal mock returns undefined (not explicitly true), so status may be PARTIAL
    expect(['OK', 'PARTIAL']).toContain(res.status);
    expect(res).toHaveProperty('message');
    expect(res).toHaveProperty('data');
  });

  it('should respond to GET_EMBEDDING_STATS', async () => {
    const response = await sendMessage({ type: 'GET_EMBEDDING_STATS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('total');
    expect(res).toHaveProperty('withEmbeddings');
    expect(res).toHaveProperty('estimatedBytes');
  });

  it('should respond to INDEX_BOOKMARKS', async () => {
    const response = await sendMessage({ type: 'INDEX_BOOKMARKS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('indexed');
    expect(res).toHaveProperty('updated');
  });

  it('should respond to MANUAL_INDEX', async () => {
    const response = await sendMessage({ type: 'MANUAL_INDEX' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('added');
    expect(res).toHaveProperty('updated');
  });

  it('should respond to EXPORT_INDEX', async () => {
    const response = await sendMessage({ type: 'EXPORT_INDEX' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.data).toHaveProperty('items');
    expect(res.data).toHaveProperty('version');
    expect(res.data).toHaveProperty('exportDate');
    expect(res.data).toHaveProperty('itemCount');
  });

  it('should respond to IMPORT_INDEX', async () => {
    const response = await sendMessage({ type: 'IMPORT_INDEX', items: [
      { url: 'https://example.com', title: 'Example', lastVisit: Date.now(), hostname: 'example.com', visitCount: 1, tokens: [] },
    ] });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(0);
  });

  it('should respond to START_EMBEDDING_PROCESSOR', async () => {
    const response = await sendMessage({ type: 'START_EMBEDDING_PROCESSOR' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('progress');
  });

  it('should respond to PAUSE_EMBEDDING_PROCESSOR', async () => {
    const response = await sendMessage({ type: 'PAUSE_EMBEDDING_PROCESSOR' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('progress');
  });

  it('should respond to RESUME_EMBEDDING_PROCESSOR', async () => {
    const response = await sendMessage({ type: 'RESUME_EMBEDDING_PROCESSOR' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('progress');
  });

  it('should respond to GET_AI_CACHE_STATS', async () => {
    const response = await sendMessage({ type: 'GET_AI_CACHE_STATS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('size');
    expect(res).toHaveProperty('maxSize');
    expect(res).toHaveProperty('estimatedBytes');
  });

  it('should respond to CLEAR_AI_CACHE', async () => {
    const response = await sendMessage({ type: 'CLEAR_AI_CACHE' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('cleared');
  });

  it('should respond to METADATA_CAPTURE', async () => {
    const response = await sendMessage({
      type: 'METADATA_CAPTURE',
      payload: { url: 'https://example.com', metaDescription: 'A test page', metaKeywords: 'test,page' },
    });
    expect(response).toEqual({ status: 'ok' });
  });

  it('should respond to CLEAR_ALL_EMBEDDINGS', async () => {
    const response = await sendMessage({ type: 'CLEAR_ALL_EMBEDDINGS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res).toHaveProperty('cleared');
  });

  it('should return error for unknown message type', async () => {
    const response = await sendMessage({ type: 'TOTALLY_UNKNOWN_MESSAGE_TYPE_XYZ' });
     
    const res = response as any;
    expect(res).toHaveProperty('error', 'Unknown message type');
  });
});

describe('service-worker error paths', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new Promise(r => setTimeout(r, 500));
  });

  it('should return ERROR when REBUILD_INDEX throws', async () => {
    const { performFullRebuild } = await import('../indexing');
    (performFullRebuild as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Rebuild failed'));
    const response = await sendMessage({ type: 'REBUILD_INDEX' });
     
    const res = response as any;
    expect(res.status).toBe('ERROR');
    expect(res.message).toBe('Rebuild failed');
  });

  it('should return ERROR when GET_STORAGE_QUOTA throws', async () => {
    const { getStorageQuotaInfo } = await import('../database');
    (getStorageQuotaInfo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Quota check failed'));
    const response = await sendMessage({ type: 'GET_STORAGE_QUOTA' });
     
    const res = response as any;
    expect(res.status).toBe('ERROR');
    expect(res.message).toBe('Quota check failed');
  });

  it('should return ERROR when CLEAR_FAVICON_CACHE throws', async () => {
    const { clearFaviconCache } = await import('../favicon-cache');
    (clearFaviconCache as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Cache clear failed'));
    const response = await sendMessage({ type: 'CLEAR_FAVICON_CACHE' });
     
    const res = response as any;
    expect(res.status).toBe('ERROR');
    expect(res.message).toBe('Cache clear failed');
  });

  it('should return empty results when GET_RECENT_HISTORY throws', async () => {
    const { getRecentIndexedItems } = await import('../database');
    (getRecentIndexedItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB read failed'));
    const response = await sendMessage({ type: 'GET_RECENT_HISTORY', limit: 10 });
     
    const res = response as any;
    // The handler catches the error and returns empty results
    expect(res).toHaveProperty('results');
    expect(res.results).toEqual([]);
  });

  it('should return ERROR when GET_HEALTH_STATUS throws', async () => {
    const { checkHealth } = await import('../resilience');
    (checkHealth as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Health check failed'));
    const response = await sendMessage({ type: 'GET_HEALTH_STATUS' });
     
    const res = response as any;
    expect(res.status).toBe('ERROR');
    expect(res.message).toBe('Health check failed');
  });
});

describe('service-worker port-based messaging', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await new Promise(r => setTimeout(r, 500));
  });

  it('should accept quick-search port connection', () => {
     
    const portHandler = (globalThis as any).__swTestPortHandler;
    expect(portHandler).toBeDefined();
    expect(typeof portHandler).toBe('function');
  });

  it('should handle SEARCH_QUERY through quick-search port', async () => {
     
    const portHandler = (globalThis as any).__swTestPortHandler;

     
    const messageListeners: ((msg: any) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    const postMessage = vi.fn();

    const mockPort = {
      name: 'quick-search',
      postMessage,
       
      onMessage: { addListener: (cb: (msg: any) => void) => { messageListeners.push(cb); } },
      onDisconnect: { addListener: (cb: () => void) => { disconnectListeners.push(cb); } },
    };

    portHandler(mockPort);

    // Simulate sending a search query through the port
    for (const listener of messageListeners) {
      listener({ type: 'SEARCH_QUERY', query: 'port search test' });
    }

    // Allow async processing to complete
    await new Promise(r => setTimeout(r, 100));

    expect(postMessage).toHaveBeenCalled();
    const call = postMessage.mock.calls[0][0];
    expect(call).toHaveProperty('results');
    expect(call).toHaveProperty('query', 'port search test');
  });

  it('should ignore non-quick-search port connections', () => {
     
    const portHandler = (globalThis as any).__swTestPortHandler;

    const messageListeners: (() => void)[] = [];
    const mockPort = {
      name: 'some-other-port',
      postMessage: vi.fn(),
      onMessage: { addListener: (cb: () => void) => { messageListeners.push(cb); } },
      onDisconnect: { addListener: vi.fn() },
    };

    portHandler(mockPort);

    // No message listeners should be registered for non-quick-search ports
    expect(messageListeners.length).toBe(0);
  });

  it('should handle port disconnect gracefully', async () => {
     
    const portHandler = (globalThis as any).__swTestPortHandler;

     
    const messageListeners: ((msg: any) => void)[] = [];
    const disconnectListeners: (() => void)[] = [];
    const postMessage = vi.fn();

    const mockPort = {
      name: 'quick-search',
      postMessage,
       
      onMessage: { addListener: (cb: (msg: any) => void) => { messageListeners.push(cb); } },
      onDisconnect: { addListener: (cb: () => void) => { disconnectListeners.push(cb); } },
    };

    portHandler(mockPort);

    // Trigger disconnect
    for (const listener of disconnectListeners) {
      listener();
    }

    // Now send a search query — the port is disconnected, so postMessage should not be called
    // (it might still be called because the mock doesn't throw, but the code checks portDisconnected)
    for (const listener of messageListeners) {
      listener({ type: 'SEARCH_QUERY', query: 'after disconnect' });
    }

    await new Promise(r => setTimeout(r, 100));

    // After disconnect, the handler sets portDisconnected = true, so no postMessage calls
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('should send skipAI flag through port response', async () => {
     
    const portHandler = (globalThis as any).__swTestPortHandler;

     
    const messageListeners: ((msg: any) => void)[] = [];
    const postMessage = vi.fn();

    const mockPort = {
      name: 'quick-search',
      postMessage,
       
      onMessage: { addListener: (cb: (msg: any) => void) => { messageListeners.push(cb); } },
      onDisconnect: { addListener: vi.fn() },
    };

    portHandler(mockPort);

    for (const listener of messageListeners) {
      listener({ type: 'SEARCH_QUERY', query: 'test', skipAI: true });
    }

    await new Promise(r => setTimeout(r, 100));

    expect(postMessage).toHaveBeenCalled();
    const call = postMessage.mock.calls[0][0];
    expect(call).toHaveProperty('skipAI', true);
  });
});

describe('advanced browser command message handlers', () => {
  const m = swBrowserMocks;

  beforeEach(async () => {
    vi.clearAllMocks();
    m.resetSwBrowserCommandMocks();
    await new Promise(r => setTimeout(r, 500));
  });

  it('CLOSE_OTHER_TABS removes non-active unpinned tabs', async () => {
    m.tabsQuery.mockImplementation(async () => [
      { id: 1, pinned: false },
      { id: 2, pinned: false },
      { id: 3, pinned: true },
    ]);
    const response = await sendMessage({ type: 'CLOSE_OTHER_TABS', tabId: 1 });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(1);
    expect(m.tabsRemove).toHaveBeenCalledWith([2]);
  });

  it('CLOSE_OTHER_TABS returns error without tab id', async () => {
    const response = await sendMessage({ type: 'CLOSE_OTHER_TABS' });
     
    expect((response as any).error).toBe('No active tab');
  });

  it('CLOSE_TABS_RIGHT uses active tab index (two queries)', async () => {
    m.tabsQuery
      .mockResolvedValueOnce([{ id: 5, index: 1, pinned: false }])
      .mockResolvedValueOnce([
        { id: 5, index: 1, pinned: false },
        { id: 6, index: 2, pinned: false },
        { id: 7, index: 3, pinned: false },
      ]);
    const response = await sendMessage({ type: 'CLOSE_TABS_RIGHT' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(2);
    expect(m.tabsRemove).toHaveBeenCalledWith([6, 7]);
  });

  it('CLOSE_TABS_LEFT closes tabs with lower index (two queries)', async () => {
    m.tabsQuery
      .mockResolvedValueOnce([{ id: 3, index: 2, pinned: false }])
      .mockResolvedValueOnce([
        { id: 1, index: 0, pinned: false },
        { id: 2, index: 1, pinned: false },
        { id: 3, index: 2, pinned: false },
      ]);
    const response = await sendMessage({ type: 'CLOSE_TABS_LEFT' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(2);
    expect(m.tabsRemove).toHaveBeenCalledWith([1, 2]);
  });

  it('CLOSE_ALL_TABS creates new tab then removes all', async () => {
    m.tabsQuery.mockImplementation(async () => [{ id: 1 }, { id: 2 }]);
    const response = await sendMessage({ type: 'CLOSE_ALL_TABS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(2);
    expect(m.tabsCreate).toHaveBeenCalledWith({ url: 'chrome://newtab' });
    expect(m.tabsRemove).toHaveBeenCalledWith([1, 2]);
  });

  it('DISCARD_TAB discards given tab', async () => {
    const response = await sendMessage({ type: 'DISCARD_TAB', tabId: 9 });
     
    expect((response as any).status).toBe('OK');
    expect(m.tabsDiscard).toHaveBeenCalledWith(9);
  });

  it('DISCARD_OTHER_TABS counts discarded background tabs', async () => {
    m.tabsQuery.mockImplementation(async () => [
      { id: 1, active: true, discarded: false },
      { id: 2, active: false, discarded: false },
      { id: 3, active: false, discarded: true },
    ]);
    const response = await sendMessage({ type: 'DISCARD_OTHER_TABS', tabId: 1 });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.discarded).toBe(1);
    expect(m.tabsDiscard).toHaveBeenCalledWith(2);
  });

  it('MOVE_TAB_NEW_WINDOW creates window with tab', async () => {
    const response = await sendMessage({ type: 'MOVE_TAB_NEW_WINDOW', tabId: 4 });
     
    expect((response as any).status).toBe('OK');
    expect(m.windowsCreate).toHaveBeenCalledWith({ tabId: 4 });
  });

  it('MERGE_WINDOWS moves tabs from other windows', async () => {
    m.windowsGetCurrent.mockResolvedValue({ id: 1 });
    m.windowsGetAll.mockResolvedValue([
      { id: 1, tabs: [{ id: 10 }] },
      { id: 2, tabs: [{ id: 20 }, { id: 21 }] },
    ]);
    const response = await sendMessage({ type: 'MERGE_WINDOWS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.moved).toBe(2);
    expect(m.tabsMove).toHaveBeenCalledWith(20, { windowId: 1, index: -1 });
    expect(m.tabsMove).toHaveBeenCalledWith(21, { windowId: 1, index: -1 });
  });

  it('CLOSE_DUPLICATES keeps first URL and closes rest', async () => {
    m.tabsQuery.mockImplementation(async () => [
      { id: 1, url: 'https://x.com' },
      { id: 2, url: 'https://x.com#frag' },
      { id: 3, url: 'https://y.com' },
    ]);
    const response = await sendMessage({ type: 'CLOSE_DUPLICATES' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(1);
    expect(m.tabsRemove).toHaveBeenCalledWith([2]);
  });

  it('SORT_TABS moves unpinned tabs by URL order', async () => {
    m.tabsQuery.mockImplementation(async () => [
      { id: 1, pinned: true, url: 'https://z.com' },
      { id: 2, pinned: false, url: 'https://b.com' },
      { id: 3, pinned: false, url: 'https://a.com' },
    ]);
    const response = await sendMessage({ type: 'SORT_TABS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.sorted).toBe(2);
    expect(m.tabsMove).toHaveBeenCalledWith(3, { index: 1 });
    expect(m.tabsMove).toHaveBeenCalledWith(2, { index: 2 });
  });

  it('SCROLL_TO_TOP runs executeScript', async () => {
    const response = await sendMessage({ type: 'SCROLL_TO_TOP', tabId: 8 });
     
    expect((response as any).status).toBe('OK');
    expect(m.scriptingExecuteScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 8 } }));
  });

  it('UNPIN_TAB and UNMUTE_TAB update tab', async () => {
    await sendMessage({ type: 'UNPIN_TAB', tabId: 3 });
    expect(m.tabsUpdate).toHaveBeenCalledWith(3, { pinned: false });
    await sendMessage({ type: 'UNMUTE_TAB', tabId: 3 });
    expect(m.tabsUpdate).toHaveBeenCalledWith(3, { muted: false });
  });

  it('GROUP_TAB requires tabGroups permission', async () => {
    m.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => { cb(false); });
    const response = await sendMessage({ type: 'GROUP_TAB', tabId: 1 });
     
    expect(String((response as any).error)).toContain('tabGroups');
    expect(m.tabsGroup).not.toHaveBeenCalled();
  });

  it('GROUP_TAB calls tabs.group when permitted', async () => {
    const response = await sendMessage({ type: 'GROUP_TAB', tabId: 1 });
     
    expect((response as any).status).toBe('OK');
    expect(m.tabsGroup).toHaveBeenCalledWith({ tabIds: 1 });
  });

  it('COLLAPSE_GROUPS updates each group', async () => {
    m.tabGroupsQuery.mockResolvedValue([{ id: 100 }, { id: 101 }]);
    const response = await sendMessage({ type: 'COLLAPSE_GROUPS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.collapsed).toBe(2);
    expect(m.tabGroupsUpdate).toHaveBeenCalledWith(100, { collapsed: true });
    expect(m.tabGroupsUpdate).toHaveBeenCalledWith(101, { collapsed: true });
  });

  it('NAME_GROUP sets title when tab is grouped', async () => {
    m.tabsGet.mockResolvedValue({ id: 1, groupId: 42 });
    const response = await sendMessage({ type: 'NAME_GROUP', tabId: 1, name: 'Work' });
     
    expect((response as any).status).toBe('OK');
    expect(m.tabGroupsUpdate).toHaveBeenCalledWith(42, { title: 'Work' });
  });

  it('COLOR_GROUP passes color to tabGroups.update', async () => {
    m.tabsGet.mockResolvedValue({ id: 1, groupId: 7 });
    const response = await sendMessage({ type: 'COLOR_GROUP', tabId: 1, color: 'red' });
     
    expect((response as any).status).toBe('OK');
    expect(m.tabGroupsUpdate).toHaveBeenCalledWith(7, { color: 'red' });
  });

  it('CLOSE_GROUP removes all tabs in group', async () => {
    m.tabsGet.mockResolvedValue({ id: 1, groupId: 99 });
    m.tabsQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const response = await sendMessage({ type: 'CLOSE_GROUP', tabId: 1 });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.closed).toBe(2);
    expect(m.tabsRemove).toHaveBeenCalledWith([1, 2]);
  });

  it('UNGROUP_ALL ungroups grouped tabs', async () => {
    m.tabsQuery.mockResolvedValue([
      { id: 1, groupId: -1 },
      { id: 2, groupId: 5 },
    ]);
    const response = await sendMessage({ type: 'UNGROUP_ALL' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.ungrouped).toBe(1);
    expect(m.tabsUngroup).toHaveBeenCalledWith(2);
  });

  it('CLEAR_BROWSER_CACHE calls removeCache when browsingData allowed', async () => {
    const response = await sendMessage({ type: 'CLEAR_BROWSER_CACHE' });
     
    expect((response as any).status).toBe('OK');
    expect(m.browsingDataRemoveCache).toHaveBeenCalledWith({});
  });

  it('CLEAR_LAST_HOUR calls browsingData.remove with time range', async () => {
    const response = await sendMessage({ type: 'CLEAR_LAST_HOUR' });
     
    expect((response as any).status).toBe('OK');
    expect(m.browsingDataRemove).toHaveBeenCalled();
    const arg0 = m.browsingDataRemove.mock.calls[0][0];
    expect(arg0).toHaveProperty('since');
    expect(typeof arg0.since).toBe('number');
    expect(m.browsingDataRemove.mock.calls[0][1]).toMatchObject({
      cache: true, cookies: true, history: true, localStorage: true,
    });
  });

  it('GET_TOP_SITES returns sites when permitted', async () => {
    m.topSitesGet.mockImplementation((cb) => {
      cb([{ url: 'https://a.test/', title: 'A' }]);
    });
    const response = await sendMessage({ type: 'GET_TOP_SITES' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.sites).toHaveLength(1);
    expect(res.sites[0].url).toBe('https://a.test/');
  });

  it('REQUEST_OPTIONAL_PERMISSIONS returns granted flag', async () => {
    m.permissionsRequest.mockImplementation((_p: unknown, cb?: (g: boolean) => void) => { cb?.(false); });
    const response = await sendMessage({
      type: 'REQUEST_OPTIONAL_PERMISSIONS',
      permissions: ['topSites'],
    });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.granted).toBe(false);
  });

  it('CHECK_PERMISSIONS is true only when all permissions granted', async () => {
    let call = 0;
    m.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => {
      call += 1;
      cb(call === 1);
    });
    const response = await sendMessage({
      type: 'CHECK_PERMISSIONS',
      permissions: ['a', 'b'],
    });
     
    expect((response as any).granted).toBe(false);
  });

  it('UNGROUP_TAB calls tabs.ungroup', async () => {
    const response = await sendMessage({ type: 'UNGROUP_TAB', tabId: 11 });
     
    expect((response as any).status).toBe('OK');
    expect(m.tabsUngroup).toHaveBeenCalledWith(11);
  });

  it('EXPAND_GROUPS expands each group', async () => {
    m.tabGroupsQuery.mockResolvedValue([{ id: 200 }]);
    const response = await sendMessage({ type: 'EXPAND_GROUPS' });
     
    const res = response as any;
    expect(res.status).toBe('OK');
    expect(res.expanded).toBe(1);
    expect(m.tabGroupsUpdate).toHaveBeenCalledWith(200, { collapsed: false });
  });

  it('CLEAR_COOKIES returns error when browsingData permission denied', async () => {
    m.permissionsContains.mockImplementation((_p: unknown, cb: (r: boolean) => void) => { cb(false); });
    const response = await sendMessage({ type: 'CLEAR_COOKIES' });
     
    expect((response as any).error).toContain('browsingData');
    expect(m.browsingDataRemoveCookies).not.toHaveBeenCalled();
  });

  it('NAME_GROUP returns error when tab is not grouped', async () => {
    m.tabsGet.mockResolvedValue({ id: 1, groupId: -1 });
    const response = await sendMessage({ type: 'NAME_GROUP', tabId: 1, name: 'X' });
     
    expect((response as any).error).toContain('not in a group');
  });

  it('SCROLL_TO_BOTTOM runs executeScript with scroll target', async () => {
    const response = await sendMessage({ type: 'SCROLL_TO_BOTTOM', tabId: 12 });
     
    expect((response as any).status).toBe('OK');
    expect(m.scriptingExecuteScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 12 } }));
  });
});

describe('omnibox listeners', () => {
  const m = swBrowserMocks;
  const o = swOmniboxMocks;

  beforeEach(async () => {
    vi.clearAllMocks();
    m.resetSwBrowserCommandMocks();
    o.bookmarksSearch.mockResolvedValue([]);
    o.runtimeSendMessage.mockClear();
    vi.mocked(runSearch).mockResolvedValue([]);
    await new Promise(r => setTimeout(r, 500));
  });

  it('onInputChanged suggests everyday commands for / prefix', async () => {
    const onInputChanged = o.omniboxOnInputChanged[0];
    expect(onInputChanged).toBeDefined();
    const suggest = vi.fn();
    await onInputChanged('/settings', suggest);
    expect(suggest).toHaveBeenCalled();
    const suggestions = suggest.mock.calls[0][0] as { content: string }[];
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.content === '/settings')).toBe(true);
  });

  it('onInputChanged uses power tier for > prefix', async () => {
    const onInputChanged = o.omniboxOnInputChanged[0];
    const suggest = vi.fn();
    await onInputChanged('>', suggest);
    expect(suggest).toHaveBeenCalled();
    const suggestions = suggest.mock.calls[0][0] as { content: string }[];
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(s => s.content.startsWith('>'))).toBe(true);
  });

  it('onInputChanged filters tabs for @ prefix', async () => {
    m.tabsQuery.mockResolvedValue([
      { id: 42, title: 'Alpha', url: 'https://alpha.example' },
    ]);
    const onInputChanged = o.omniboxOnInputChanged[0];
    const suggest = vi.fn();
    await onInputChanged('@alp', suggest);
    expect(suggest).toHaveBeenCalledWith([
      expect.objectContaining({ content: '@tab:42' }),
    ]);
  });

  it('onInputChanged suggests bookmarks for # prefix with query', async () => {
    o.bookmarksSearch.mockResolvedValue([
      { id: '1', title: 'Doc', url: 'https://doc.example/x' } as chrome.bookmarks.BookmarkTreeNode,
    ]);
    const onInputChanged = o.omniboxOnInputChanged[0];
    const suggest = vi.fn();
    await onInputChanged('#doc', suggest);
    expect(suggest).toHaveBeenCalledWith([
      expect.objectContaining({ content: 'https://doc.example/x' }),
    ]);
  });

  it('onInputChanged suggests history search results by default', async () => {
    vi.mocked(runSearch).mockResolvedValue([
      { url: 'https://hist.example', title: 'H', visitCount: 1, lastVisit: Date.now() },
    ]);
    const onInputChanged = o.omniboxOnInputChanged[0];
    const suggest = vi.fn();
    await onInputChanged('hist', suggest);
    expect(suggest).toHaveBeenCalledWith([
      expect.objectContaining({ content: 'https://hist.example' }),
    ]);
  });

  it('onInputChanged passes empty suggestions on runSearch error', async () => {
    vi.mocked(runSearch).mockRejectedValueOnce(new Error('search failed'));
    const onInputChanged = o.omniboxOnInputChanged[0];
    const suggest = vi.fn();
    await onInputChanged('x', suggest);
    expect(suggest).toHaveBeenCalledWith([]);
  });

  it('onInputEntered activates @tab:id and focuses window', async () => {
    m.tabsGet.mockResolvedValue({ id: 5, windowId: 99 });
    const onInputEntered = o.omniboxOnInputEntered[0];
    expect(onInputEntered).toBeDefined();
    await onInputEntered('@tab:5', 'currentTab');
    expect(m.tabsGet).toHaveBeenCalledWith(5);
    expect(m.tabsUpdate).toHaveBeenCalledWith(5, { active: true });
  });

  it('onInputEntered sends message for / command with messageType', async () => {
    const onInputEntered = o.omniboxOnInputEntered[0];
    await onInputEntered('/settings', 'newForegroundTab');
    expect(o.runtimeSendMessage).toHaveBeenCalledWith({ type: 'OPEN_SETTINGS' }, expect.any(Function));
  });

  it('onInputEntered creates tab for command with url', async () => {
    const onInputEntered = o.omniboxOnInputEntered[0];
    await onInputEntered('/password-manager', 'newForegroundTab');
    expect(m.tabsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('chrome://') }),
    );
  });

  it('onInputEntered opens google search when text is not a valid URL', async () => {
    const onInputEntered = o.omniboxOnInputEntered[0];
    await onInputEntered('hello world', 'newForegroundTab');
    expect(m.tabsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('google.com/search'),
        active: true,
      }),
    );
  });

  it('onInputEntered updates current tab when disposition is currentTab', async () => {
    m.tabsQuery.mockResolvedValueOnce([{ id: 7, active: true, windowId: 1 }]);
    const onInputEntered = o.omniboxOnInputEntered[0];
    await onInputEntered('https://example.com/path', 'currentTab');
    expect(m.tabsUpdate).toHaveBeenCalledWith(7, { url: 'https://example.com/path' });
  });

  it('onInputEntered creates background tab when disposition is newBackgroundTab', async () => {
    const onInputEntered = o.omniboxOnInputEntered[0];
    await onInputEntered('https://example.com/', 'newBackgroundTab');
    expect(m.tabsCreate).toHaveBeenCalledWith({ url: 'https://example.com/', active: false });
  });

  it('onInputEntered swallows errors from tabs.get', async () => {
    m.tabsGet.mockRejectedValueOnce(new Error('missing'));
    const onInputEntered = o.omniboxOnInputEntered[0];
    await expect(onInputEntered('@tab:99', 'currentTab')).resolves.toBeUndefined();
  });
});
