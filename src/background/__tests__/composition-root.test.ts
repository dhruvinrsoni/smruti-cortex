import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  errorMeta: (e: unknown) => e,
}));

vi.mock('../../core/helpers', () => ({
  browserAPI: {
    runtime: { lastError: null },
    tabs: {},
    windows: {},
    bookmarks: {},
    history: {},
    storage: { local: {} },
    permissions: {},
  },
}));

vi.mock('../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn(),
    getSettings: vi.fn(() => ({})),
    init: vi.fn().mockResolvedValue(undefined),
    resetToDefaults: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('createRegistries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns preInit and postInit registries', async () => {
    const { createRegistries } = await import('../composition-root');
    const { preInit, postInit } = createRegistries();

    expect(preInit).toBeDefined();
    expect(postInit).toBeDefined();
    expect(preInit.size).toBeGreaterThan(0);
    expect(postInit.size).toBeGreaterThan(0);
  });

  it('preInit contains settings and diagnostics handlers', async () => {
    const { createRegistries } = await import('../composition-root');
    const { preInit } = createRegistries();

    expect(preInit.has('PING')).toBe(true);
    expect(preInit.has('GET_SETTINGS')).toBe(true);
    expect(preInit.has('GET_LOG_LEVEL')).toBe(true);
    expect(preInit.has('GET_PERFORMANCE_METRICS')).toBe(true);
  });

  it('postInit contains search, ollama, command, and diagnostics handlers', async () => {
    const { createRegistries } = await import('../composition-root');
    const { postInit } = createRegistries();

    expect(postInit.has('SEARCH_QUERY')).toBe(true);
    expect(postInit.has('REBUILD_INDEX')).toBe(true);
    expect(postInit.has('GET_EMBEDDING_STATS')).toBe(true);
    expect(postInit.has('RUN_TROUBLESHOOTER')).toBe(true);
    expect(postInit.has('CLOSE_TAB')).toBe(true);
    expect(postInit.has('FACTORY_RESET')).toBe(true);
  });

  it('preInit and postInit do not share message types', async () => {
    const { createRegistries } = await import('../composition-root');
    const { preInit, postInit } = createRegistries();

    const preTypes = new Set(preInit.registeredTypes);
    const postTypes = new Set(postInit.registeredTypes);
    for (const t of preTypes) {
      if (postTypes.has(t)) {
        throw new Error(`Duplicate handler for "${t}" in both preInit and postInit`);
      }
    }
  });
});
