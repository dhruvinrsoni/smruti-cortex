import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the database module — service-worker.ts calls openDatabase() during
// async init(), and IndexedDB is not available in the jsdom test environment.
vi.mock('../database', () => ({
  openDatabase: vi.fn(async () => ({})),
  getStorageQuotaInfo: vi.fn(async () => ({ usage: 0, quota: 0 })),
  setForceRebuildFlag: vi.fn(async () => {}),
  getForceRebuildFlag: vi.fn(async () => false),
  getBatchHelper: vi.fn(() => ({ add: vi.fn(), flush: vi.fn() })),
}));

vi.mock('../indexing', () => ({
  ingestHistory: vi.fn(async () => {}),
  performFullRebuild: vi.fn(async () => {}),
  mergeMetadata: vi.fn(async () => {}),
}));

vi.mock('../search/search-engine', () => ({
  runSearch: vi.fn(async () => []),
  getLastAIStatus: vi.fn(() => null),
}));

// vi.hoisted runs before ANY module imports — the only way to ensure
// globalThis.chrome is set before service-worker.ts module body executes
// (static imports are hoisted above top-level module statements).
const mocks = vi.hoisted(() => {
  let capturedCommandCb: ((cmd: string) => void) | null = null;

  const sendMessageMock = vi.fn((_tabId: number, _message: unknown, cb: (r: unknown) => void) => {
    cb({ success: true });
  });
  const queryMock = vi.fn(async () => [{ id: 123, url: 'https://example.com' }]);

  // Deep no-op proxy — silently handles any chrome API not explicitly mocked,
  // preventing TypeError on missing .addListener / nested property chains.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function noOp(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(function() {} as any, {
      get: () => noOp(),
      apply: () => undefined,
    });
  }

  // Wrap an object so any property not explicitly defined returns noOp().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function proxied(obj: Record<string, any>): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(obj as any, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(t: any, prop: string) { return prop in t ? t[prop] : noOp(); },
    });
  }

  // Explicit mock for APIs the test cares about; everything else falls through
  // to noOp() via proxied() so no TypeError on unknown nested .addListener calls.
  (globalThis as any).chrome = proxied({
    commands: proxied({
      onCommand: {
        addListener: (cb: (cmd: string) => void) => { capturedCommandCb = cb; },
      },
    }),
    tabs: proxied({ query: queryMock, sendMessage: sendMessageMock }),
    action: proxied({ openPopup: noOp() }),
    runtime: proxied({
      lastError: null,
      getManifest: () => ({ manifest_version: 3 }),
    }),
    storage: proxied({
      local: proxied({
        // Must call callback so SettingsManager.init() resolves
        get: (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
        set: noOp(),
      }),
      sync: proxied({
        get: (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
      }),
    }),
  });

  return {
    get commandCallback() { return capturedCommandCb; },
    sendMessageMock,
    queryMock,
  };
});

// Importing the service-worker module registers the commands listener
// at module level (registerCommandsListenerEarly() at module load)
import '../service-worker';

describe('OPEN_INLINE_SEARCH integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends OPEN_INLINE_SEARCH to active tab when shortcut triggers', async () => {
    // Wait a tick for module-level registration
    await new Promise((r) => setTimeout(r, 0));

    // Ensure listener was registered
    expect(mocks.commandCallback).toBeTruthy();

    // Trigger the command listener as Chrome would
    mocks.commandCallback!('open-popup');

    // Allow async flow to run
    await new Promise((r) => setTimeout(r, 10));

    expect(mocks.queryMock).toHaveBeenCalled();
    expect(mocks.sendMessageMock).toHaveBeenCalledWith(123, { type: 'OPEN_INLINE_SEARCH' }, expect.any(Function));
  });
});
