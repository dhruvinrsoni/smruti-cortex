import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock factories – declared before any vi.mock() so hoisting works correctly
// ---------------------------------------------------------------------------

function createStorageMock(
  getResult: Record<string, unknown> = {},
  setError: string | null = null
) {
  return {
    get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb(getResult)),
    set: vi.fn((_items: unknown, cb?: () => void) => cb?.()),
    remove: vi.fn((_key: unknown, cb?: () => void) => cb?.()),
    // Allow tests to override set behavior for error simulation
    _setError: setError,
  };
}

function createBrowserAPIMock(
  storageMock = createStorageMock(),
  lastError: { message: string } | null = null
) {
  return {
    storage: { local: storageMock },
    runtime: {
      lastError,
      sendMessage: vi.fn((_msg: unknown, cb?: () => void) => cb?.()),
    },
  };
}

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

const loggerMethods = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
});

vi.mock('../logger', () => ({
  Logger: {
    ...loggerMethods(),
    forComponent: () => loggerMethods(),
    getLevel: vi.fn(() => 2),
    setLevelInternal: vi.fn(),
  },
  ComponentLogger: class {},
  errorMeta: (err: unknown) => err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: 'non-Error', message: String(err) },
}));

vi.mock('../helpers', () => {
  const storageMock = createStorageMock();
  return {
    browserAPI: createBrowserAPIMock(storageMock),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fresh import of SettingsManager with clean module state */
async function getManager() {
  // Re-register mocks after resetModules — must use vi.doMock (not vi.mock)
  // because vi.mock is hoisted and only runs once at module load
  vi.doMock('../logger', () => ({
    Logger: {
      ...loggerMethods(),
      forComponent: () => loggerMethods(),
      getLevel: vi.fn(() => 2),
      setLevelInternal: vi.fn(),
    },
    ComponentLogger: class {},
    errorMeta: (err: unknown) => err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'non-Error', message: String(err) },
  }));

  vi.doMock('../helpers', () => {
    const storageMock = createStorageMock();
    return {
      browserAPI: createBrowserAPIMock(storageMock),
    };
  });

  const mod = await import('../settings');
  return mod;
}

/** Fresh import with custom storage contents */
async function getManagerWithStoredSettings(stored: Record<string, unknown>) {
  vi.doMock('../logger', () => ({
    Logger: {
      ...loggerMethods(),
      forComponent: () => loggerMethods(),
      getLevel: vi.fn(() => 2),
      setLevelInternal: vi.fn(),
    },
    ComponentLogger: class {},
    errorMeta: (err: unknown) => err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'non-Error', message: String(err) },
  }));

  vi.doMock('../helpers', () => {
    const storageMock = createStorageMock({ smrutiCortexSettings: stored });
    return {
      browserAPI: createBrowserAPIMock(storageMock),
    };
  });

  const mod = await import('../settings');
  return mod;
}

/** Fresh import with storage API unavailable (null) */
async function getManagerWithNoStorage() {
  vi.doMock('../logger', () => ({
    Logger: {
      ...loggerMethods(),
      forComponent: () => loggerMethods(),
      getLevel: vi.fn(() => 2),
      setLevelInternal: vi.fn(),
    },
    ComponentLogger: class {},
    errorMeta: (err: unknown) => err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'non-Error', message: String(err) },
  }));

  vi.doMock('../helpers', () => ({
    browserAPI: {
      storage: null,
      runtime: {
        lastError: null,
        sendMessage: vi.fn((_msg: unknown, cb?: () => void) => cb?.()),
      },
    },
  }));

  const mod = await import('../settings');
  return mod;
}

/** Fresh import where storage.set triggers a lastError */
async function getManagerWithSaveError(errorMessage: string) {
  vi.doMock('../logger', () => ({
    Logger: {
      ...loggerMethods(),
      forComponent: () => loggerMethods(),
      getLevel: vi.fn(() => 2),
      setLevelInternal: vi.fn(),
    },
    ComponentLogger: class {},
    errorMeta: (err: unknown) => err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'non-Error', message: String(err) },
  }));

  vi.doMock('../helpers', () => {
    const runtimeRef: { lastError: { message: string } | null } = { lastError: null };
    const storageMock = {
      get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn((_items: unknown, cb?: () => void) => {
        // Simulate lastError by setting it before calling callback
        runtimeRef.lastError = { message: errorMessage };
        cb?.();
      }),
    };
    return {
      browserAPI: {
        storage: { local: storageMock },
        runtime: runtimeRef,
      },
    };
  });

  const mod = await import('../settings');
  return mod;
}

/** Fresh import where sendMessage triggers a lastError */
async function getManagerWithSendMessageError() {
  vi.doMock('../logger', () => ({
    Logger: {
      ...loggerMethods(),
      forComponent: () => loggerMethods(),
      getLevel: vi.fn(() => 2),
      setLevelInternal: vi.fn(),
    },
    ComponentLogger: class {},
    errorMeta: (err: unknown) => err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'non-Error', message: String(err) },
  }));

  vi.doMock('../helpers', () => {
    const runtimeRef: { lastError: { message: string } | null; sendMessage: ReturnType<typeof vi.fn> } = {
      lastError: null,
      sendMessage: vi.fn((_msg: unknown, cb?: () => void) => {
        runtimeRef.lastError = { message: 'No receiving end' };
        cb?.();
      }),
    };
    const storageMock = createStorageMock();
    return {
      browserAPI: {
        storage: { local: storageMock },
        runtime: runtimeRef,
      },
    };
  });

  const mod = await import('../settings');
  return mod;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('SettingsManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });


  // -----------------------------------------------------------------------
  // isInitialized
  // -----------------------------------------------------------------------
  describe('isInitialized', () => {
    it('should return false before init() is called', async () => {
      const { SettingsManager } = await getManager();
      expect(SettingsManager.isInitialized()).toBe(false);
    });

    it('should return true after init() is called', async () => {
      const { SettingsManager } = await getManager();
      await SettingsManager.init();
      expect(SettingsManager.isInitialized()).toBe(true);
    });

    it('should remain true after multiple init() calls', async () => {
      const { SettingsManager } = await getManager();
      await SettingsManager.init();
      await SettingsManager.init();
      expect(SettingsManager.isInitialized()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // init()
  // -----------------------------------------------------------------------
  describe('init', () => {
    it('should load settings from storage and merge with defaults', async () => {
      const { SettingsManager } = await getManagerWithStoredSettings({
        logLevel: 4,
        highlightMatches: false,
      });

      await SettingsManager.init();

      expect(SettingsManager.getSetting('logLevel')).toBe(4);
      expect(SettingsManager.getSetting('highlightMatches')).toBe(false);
      // Non-overridden defaults remain
      expect(SettingsManager.getSetting('displayMode')).toBe('list');
    });

    it('should use defaults when storage is empty', async () => {
      const { SettingsManager } = await getManager();

      await SettingsManager.init();

      expect(SettingsManager.getSetting('logLevel')).toBe(2);
      expect(SettingsManager.getSetting('displayMode')).toBe('list');
      expect(SettingsManager.getSetting('highlightMatches')).toBe(true);
    });

    it('should skip second init when already initialized', async () => {
      const { SettingsManager } = await getManagerWithStoredSettings({
        logLevel: 4,
      });

      await SettingsManager.init();
      expect(SettingsManager.getSetting('logLevel')).toBe(4);

      // Manually change to verify second init doesn't re-load
      await SettingsManager.updateSettings({ logLevel: 0 });
      await SettingsManager.init(); // should be a no-op
      expect(SettingsManager.getSetting('logLevel')).toBe(0);
    });

    it('should use defaults when storage API is not available', async () => {
      const { SettingsManager } = await getManagerWithNoStorage();

      await SettingsManager.init();

      expect(SettingsManager.isInitialized()).toBe(true);
      expect(SettingsManager.getSetting('logLevel')).toBe(2);
    });

    it('should validate stored settings and reject invalid values', async () => {
      const { SettingsManager } = await getManagerWithStoredSettings({
        logLevel: 999,          // out of range [0..4]
        highlightMatches: 'yes', // not a boolean
        displayMode: 'grid',    // not in DisplayMode enum
        maxResults: -5,         // must be > 0
      });

      await SettingsManager.init();

      // Invalid values should fall back to defaults
      expect(SettingsManager.getSetting('logLevel')).toBe(2);
      expect(SettingsManager.getSetting('highlightMatches')).toBe(true);
      expect(SettingsManager.getSetting('displayMode')).toBe('list');
      expect(SettingsManager.getSetting('maxResults')).toBe(100);
    });

    it('should keep valid stored values while rejecting only invalid ones', async () => {
      const { SettingsManager } = await getManagerWithStoredSettings({
        logLevel: 3,                // valid
        maxResults: -5,             // invalid
        ollamaEnabled: true,        // valid
        ollamaEndpoint: '',         // invalid (empty string)
      });

      await SettingsManager.init();

      expect(SettingsManager.getSetting('logLevel')).toBe(3);
      expect(SettingsManager.getSetting('maxResults')).toBe(100);    // default
      expect(SettingsManager.getSetting('ollamaEnabled')).toBe(true);
      expect(SettingsManager.getSetting('ollamaEndpoint')).toBe('http://localhost:11434'); // default
    });

    it('should handle non-object stored value gracefully', async () => {
      // Storage returns a string instead of an object
      vi.doMock('../logger', () => ({
        Logger: {
          ...loggerMethods(),
          forComponent: () => loggerMethods(),
          getLevel: vi.fn(() => 2),
          setLevelInternal: vi.fn(),
        },
        ComponentLogger: class {},
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
      }));
      vi.doMock('../helpers', () => {
        const storageMock = {
          get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) =>
            cb({ smrutiCortexSettings: 'not-an-object' })
          ),
          set: vi.fn((_items: unknown, cb?: () => void) => cb?.()),
        };
        return {
          browserAPI: {
            storage: { local: storageMock },
            runtime: {
              lastError: null,
              sendMessage: vi.fn((_msg: unknown, cb?: () => void) => cb?.()),
            },
          },
        };
      });

      const { SettingsManager } = await import('../settings');
      await SettingsManager.init();

      // Should use defaults when stored value is not an object
      expect(SettingsManager.getSetting('logLevel')).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // getSettings()
  // -----------------------------------------------------------------------
  describe('getSettings', () => {
    it('should return default settings before init', async () => {
      const { SettingsManager } = await getManager();
      const settings = SettingsManager.getSettings();

      expect(settings.displayMode).toBe('list');
      expect(settings.logLevel).toBe(2);
      expect(settings.highlightMatches).toBe(true);
      expect(settings.ollamaEnabled).toBe(false);
      expect(settings.theme).toBe('auto');
    });

    it('should return a copy (not the internal reference)', async () => {
      const { SettingsManager } = await getManager();
      const s1 = SettingsManager.getSettings();
      const s2 = SettingsManager.getSettings();

      expect(s1).not.toBe(s2);
      expect(s1).toEqual(s2);
    });

    it('should not allow mutation of returned settings to affect internal state', async () => {
      const { SettingsManager } = await getManager();
      const settings = SettingsManager.getSettings();
      (settings as any).logLevel = 999;

      expect(SettingsManager.getSetting('logLevel')).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // getSetting() — all schema keys return correct defaults
  // -----------------------------------------------------------------------
  describe('getSetting', () => {
    it('should return schema defaults for every setting key', async () => {
      const { SettingsManager } = await getManager();
      const allDefaults = SettingsManager.getSettings();

      for (const [key, expected] of Object.entries(allDefaults)) {
        const actual = SettingsManager.getSetting(key as keyof typeof allDefaults);
        expect(actual, `default for "${key}"`).toEqual(expected);
      }
    });
  });

  // -----------------------------------------------------------------------
  // setSetting()
  // -----------------------------------------------------------------------
  describe('setSetting', () => {
    it('should update a single setting value', async () => {
      const { SettingsManager } = await getManager();

      await SettingsManager.setSetting('logLevel', 4);

      expect(SettingsManager.getSetting('logLevel')).toBe(4);
    });

    it('should persist the change to storage', async () => {
      const { SettingsManager } = await getManager();
      const { browserAPI } = await import('../helpers');

      await SettingsManager.setSetting('highlightMatches', false);

      expect(browserAPI.storage.local.set).toHaveBeenCalled();
    });

    it('should not affect other settings', async () => {
      const { SettingsManager } = await getManager();

      await SettingsManager.setSetting('logLevel', 0);

      expect(SettingsManager.getSetting('displayMode')).toBe('list');
      expect(SettingsManager.getSetting('highlightMatches')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // updateSettings()
  // -----------------------------------------------------------------------
  describe('updateSettings', () => {
    it('should update multiple settings at once', async () => {
      const { SettingsManager } = await getManager();

      await SettingsManager.updateSettings({
        logLevel: 1,
        highlightMatches: false,
        maxResults: 500,
      });

      expect(SettingsManager.getSetting('logLevel')).toBe(1);
      expect(SettingsManager.getSetting('highlightMatches')).toBe(false);
      expect(SettingsManager.getSetting('maxResults')).toBe(500);
    });

    it('should keep unchanged settings intact', async () => {
      const { SettingsManager } = await getManager();
      const origDisplay = SettingsManager.getSetting('displayMode');

      await SettingsManager.updateSettings({ logLevel: 3 });

      expect(SettingsManager.getSetting('displayMode')).toBe(origDisplay);
    });

    it('should save to storage after update', async () => {
      const { SettingsManager } = await getManager();
      const { browserAPI } = await import('../helpers');

      await SettingsManager.updateSettings({ logLevel: 3 });

      expect(browserAPI.storage.local.set).toHaveBeenCalled();
      const setCall = vi.mocked(browserAPI.storage.local.set).mock.calls[0];
      const savedData = setCall[0] as Record<string, any>;
      expect(savedData.smrutiCortexSettings.logLevel).toBe(3);
    });

    it('should throw when storage save fails', async () => {
      const { SettingsManager } = await getManagerWithSaveError('QUOTA_EXCEEDED');

      await expect(SettingsManager.updateSettings({ logLevel: 3 })).rejects.toThrow(
        'QUOTA_EXCEEDED'
      );
    });

    it('should update AI-related settings', async () => {
      const { SettingsManager } = await getManager();

      await SettingsManager.updateSettings({
        ollamaEnabled: true,
        ollamaEndpoint: 'http://192.168.1.100:11434',
        ollamaModel: 'mistral:7b',
        ollamaTimeout: 60000,
        aiSearchDelayMs: 1000,
      });

      expect(SettingsManager.getSetting('ollamaEnabled')).toBe(true);
      expect(SettingsManager.getSetting('ollamaEndpoint')).toBe('http://192.168.1.100:11434');
      expect(SettingsManager.getSetting('ollamaModel')).toBe('mistral:7b');
      expect(SettingsManager.getSetting('ollamaTimeout')).toBe(60000);
      expect(SettingsManager.getSetting('aiSearchDelayMs')).toBe(1000);
    });

    it('should update privacy settings', async () => {
      const { SettingsManager } = await getManager();

      await SettingsManager.updateSettings({
        loadFavicons: false,
        sensitiveUrlBlacklist: ['bank.com', 'secret.org'],
      });

      expect(SettingsManager.getSetting('loadFavicons')).toBe(false);
      expect(SettingsManager.getSetting('sensitiveUrlBlacklist')).toEqual(['bank.com', 'secret.org']);
    });
  });

  // -----------------------------------------------------------------------
  // applyRemoteSettings()
  // -----------------------------------------------------------------------
  describe('applyRemoteSettings', () => {
    it('should merge remote settings into current state', async () => {
      const { SettingsManager } = await getManager();

      await SettingsManager.applyRemoteSettings({ logLevel: 4, theme: 'dark' });

      expect(SettingsManager.getSetting('logLevel')).toBe(4);
      expect(SettingsManager.getSetting('theme')).toBe('dark');
    });

    it('should save to storage', async () => {
      const { SettingsManager } = await getManager();
      const { browserAPI } = await import('../helpers');

      await SettingsManager.applyRemoteSettings({ logLevel: 3 });

      expect(browserAPI.storage.local.set).toHaveBeenCalled();
    });

    it('should apply log level when it differs from current', async () => {
      const { SettingsManager } = await getManager();
      const { Logger } = await import('../logger');

      // Logger.getLevel returns 2 by default (mocked), and we set logLevel to 4
      await SettingsManager.applyRemoteSettings({ logLevel: 4 });

      expect(Logger.setLevelInternal).toHaveBeenCalledWith(4);
    });

    it('should not re-broadcast a SETTINGS_CHANGED message', async () => {
      const { SettingsManager } = await getManager();
      const { browserAPI } = await import('../helpers');

      await SettingsManager.applyRemoteSettings({ logLevel: 3 });

      // sendMessage should NOT be called — that's the whole point of applyRemoteSettings
      expect(browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle save error gracefully without throwing', async () => {
      const { SettingsManager } = await getManagerWithSaveError('Disk full');

      // applyRemoteSettings catches errors internally, should not throw
      await expect(
        SettingsManager.applyRemoteSettings({ logLevel: 3 })
      ).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // resetToDefaults()
  // -----------------------------------------------------------------------
  describe('resetToDefaults', () => {
    it('should restore all settings to schema defaults', async () => {
      const { SettingsManager } = await getManager();

      // Change several settings
      await SettingsManager.updateSettings({
        logLevel: 4,
        highlightMatches: false,
        maxResults: 500,
        theme: 'dark',
        ollamaEnabled: true,
      });

      await SettingsManager.resetToDefaults();

      expect(SettingsManager.getSetting('logLevel')).toBe(2);
      expect(SettingsManager.getSetting('highlightMatches')).toBe(true);
      expect(SettingsManager.getSetting('maxResults')).toBe(100);
      expect(SettingsManager.getSetting('theme')).toBe('auto');
      expect(SettingsManager.getSetting('ollamaEnabled')).toBe(false);
    });

    it('should save defaults to storage', async () => {
      const { SettingsManager } = await getManager();
      const { browserAPI } = await import('../helpers');

      await SettingsManager.resetToDefaults();

      expect(browserAPI.storage.local.set).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // exportSettings()
  // -----------------------------------------------------------------------
  describe('exportSettings', () => {
    it('should return a valid JSON string', async () => {
      const { SettingsManager } = await getManager();

      const json = SettingsManager.exportSettings();
      const parsed = JSON.parse(json);

      expect(typeof json).toBe('string');
      expect(parsed).toHaveProperty('displayMode', 'list');
      expect(parsed).toHaveProperty('logLevel', 2);
    });

    it('should reflect updated settings', async () => {
      const { SettingsManager } = await getManager();
      await SettingsManager.updateSettings({ maxResults: 42 });

      const json = SettingsManager.exportSettings();
      const parsed = JSON.parse(json);

      expect(parsed.maxResults).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // importSettings()
  // -----------------------------------------------------------------------
  describe('importSettings', () => {
    it('should import valid settings from JSON string', async () => {
      const { SettingsManager } = await getManager();
      const toImport = JSON.stringify({ logLevel: 4, maxResults: 200 });

      await SettingsManager.importSettings(toImport);

      expect(SettingsManager.getSetting('logLevel')).toBe(4);
      expect(SettingsManager.getSetting('maxResults')).toBe(200);
    });

    it('should reject invalid JSON and throw', async () => {
      const { SettingsManager } = await getManager();

      await expect(SettingsManager.importSettings('not-json')).rejects.toThrow();
    });

    it('should validate imported values against schema', async () => {
      const { SettingsManager } = await getManager();
      const toImport = JSON.stringify({
        logLevel: 999,      // invalid
        maxResults: 50,      // valid
      });

      await SettingsManager.importSettings(toImport);

      // Invalid logLevel should fall back to default
      expect(SettingsManager.getSetting('logLevel')).toBe(2);
      // Valid maxResults should be applied
      expect(SettingsManager.getSetting('maxResults')).toBe(50);
    });

    it('should fill missing keys with defaults during import', async () => {
      const { SettingsManager } = await getManager();
      // Only provide one key — everything else should get defaults
      const toImport = JSON.stringify({ theme: 'dark' });

      await SettingsManager.importSettings(toImport);

      expect(SettingsManager.getSetting('theme')).toBe('dark');
      expect(SettingsManager.getSetting('logLevel')).toBe(2);
      expect(SettingsManager.getSetting('displayMode')).toBe('list');
    });
  });

  // -----------------------------------------------------------------------
  // Schema validation (tested indirectly via init + import)
  // -----------------------------------------------------------------------
  describe('schema validation', () => {
    describe('displayMode', () => {
      it('should accept "list"', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ displayMode: 'list' });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('displayMode')).toBe('list');
      });

      it('should accept "cards"', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ displayMode: 'cards' });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('displayMode')).toBe('cards');
      });

      it('should reject invalid value and use default', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ displayMode: 'tiles' });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('displayMode')).toBe('list');
      });
    });

    describe('logLevel', () => {
      it('should accept 0 (ERROR)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ logLevel: 0 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('logLevel')).toBe(0);
      });

      it('should accept 4 (TRACE)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ logLevel: 4 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('logLevel')).toBe(4);
      });

      it('should reject negative values', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ logLevel: -1 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('logLevel')).toBe(2);
      });

      it('should reject values above 4', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ logLevel: 5 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('logLevel')).toBe(2);
      });

      it('should reject non-number types', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ logLevel: 'high' });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('logLevel')).toBe(2);
      });
    });

    describe('focusDelayMs', () => {
      it('should accept 0', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ focusDelayMs: 0 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('focusDelayMs')).toBe(0);
      });

      it('should accept 2000 (max)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ focusDelayMs: 2000 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('focusDelayMs')).toBe(2000);
      });

      it('should reject values above 2000', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ focusDelayMs: 2001 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('focusDelayMs')).toBe(450);
      });
    });

    describe('ollamaTimeout', () => {
      it('should accept -1 (infinite)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ ollamaTimeout: -1 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('ollamaTimeout')).toBe(-1);
      });

      it('should accept 5000 (minimum)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ ollamaTimeout: 5000 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('ollamaTimeout')).toBe(5000);
      });

      it('should accept 120000 (maximum)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ ollamaTimeout: 120000 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('ollamaTimeout')).toBe(120000);
      });

      it('should reject 0 (neither -1 nor in range)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ ollamaTimeout: 0 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('ollamaTimeout')).toBe(30000);
      });

      it('should reject 4999 (below minimum range)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ ollamaTimeout: 4999 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('ollamaTimeout')).toBe(30000);
      });

      it('should reject 120001 (above maximum range)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ ollamaTimeout: 120001 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('ollamaTimeout')).toBe(30000);
      });
    });

    describe('aiSearchDelayMs', () => {
      it('should accept 200 (minimum)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ aiSearchDelayMs: 200 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('aiSearchDelayMs')).toBe(200);
      });

      it('should accept 3000 (maximum)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ aiSearchDelayMs: 3000 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('aiSearchDelayMs')).toBe(3000);
      });

      it('should reject 199 (below minimum)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ aiSearchDelayMs: 199 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('aiSearchDelayMs')).toBe(500);
      });

      it('should reject 3001 (above maximum)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ aiSearchDelayMs: 3001 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('aiSearchDelayMs')).toBe(500);
      });
    });

    describe('sensitiveUrlBlacklist', () => {
      it('should accept valid string array', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({
          sensitiveUrlBlacklist: ['bank.com', 'paypal.com'],
        });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('sensitiveUrlBlacklist')).toEqual(['bank.com', 'paypal.com']);
      });

      it('should reject array with non-string elements', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({
          sensitiveUrlBlacklist: ['bank.com', 123],
        });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('sensitiveUrlBlacklist')).toEqual([]);
      });

      it('should reject non-array value', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({
          sensitiveUrlBlacklist: 'bank.com',
        });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('sensitiveUrlBlacklist')).toEqual([]);
      });
    });

    describe('sortBy', () => {
      it.each(['best-match', 'most-recent', 'most-visited', 'alphabetical'] as const)(
        'should accept valid value "%s"',
        async (value) => {
          const { SettingsManager } = await getManagerWithStoredSettings({ sortBy: value });
          await SettingsManager.init();
          expect(SettingsManager.getSetting('sortBy')).toBe(value);
        }
      );

      it('should reject invalid sort order', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ sortBy: 'random' });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('sortBy')).toBe('best-match');
      });
    });

    describe('defaultResultCount', () => {
      it('should accept 1 (minimum boundary)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ defaultResultCount: 1 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('defaultResultCount')).toBe(1);
      });

      it('should accept 200 (maximum boundary)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ defaultResultCount: 200 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('defaultResultCount')).toBe(200);
      });

      it('should reject 0', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ defaultResultCount: 0 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('defaultResultCount')).toBe(50);
      });

      it('should reject 201', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ defaultResultCount: 201 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('defaultResultCount')).toBe(50);
      });
    });

    describe('theme', () => {
      it.each(['light', 'dark', 'auto'] as const)(
        'should accept valid theme "%s"',
        async (value) => {
          const { SettingsManager } = await getManagerWithStoredSettings({ theme: value });
          await SettingsManager.init();
          expect(SettingsManager.getSetting('theme')).toBe(value);
        }
      );

      it('should reject invalid theme', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ theme: 'solarized' });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('theme')).toBe('auto');
      });
    });

    describe('maxResults', () => {
      it('should accept 1 (minimum boundary)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ maxResults: 1 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('maxResults')).toBe(1);
      });

      it('should accept 1000 (maximum boundary)', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ maxResults: 1000 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('maxResults')).toBe(1000);
      });

      it('should reject 0', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ maxResults: 0 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('maxResults')).toBe(100);
      });

      it('should reject 1001', async () => {
        const { SettingsManager } = await getManagerWithStoredSettings({ maxResults: 1001 });
        await SettingsManager.init();
        expect(SettingsManager.getSetting('maxResults')).toBe(100);
      });
    });

    describe('boolean settings', () => {
      const booleanKeys = [
        'highlightMatches',
        'ollamaEnabled',
        'embeddingsEnabled',
        'loadFavicons',
        'indexBookmarks',
        'showDuplicateUrls',
        'showNonMatchingResults',
        'selectAllOnFocus',
      ] as const;

      for (const key of booleanKeys) {
        it(`should accept true for ${key}`, async () => {
          const { SettingsManager } = await getManagerWithStoredSettings({ [key]: true });
          await SettingsManager.init();
          expect(SettingsManager.getSetting(key)).toBe(true);
        });

        it(`should accept false for ${key}`, async () => {
          const { SettingsManager } = await getManagerWithStoredSettings({ [key]: false });
          await SettingsManager.init();
          expect(SettingsManager.getSetting(key)).toBe(false);
        });

        it(`should reject non-boolean for ${key}`, async () => {
          const { SettingsManager } = await getManagerWithStoredSettings({ [key]: 'yes' });
          await SettingsManager.init();
          // Should use schema default
          const defaults: Record<string, boolean> = {
            highlightMatches: true,
            ollamaEnabled: false,
            embeddingsEnabled: false,
            loadFavicons: true,
            indexBookmarks: true,
            showDuplicateUrls: false,
            showNonMatchingResults: false,
            selectAllOnFocus: false,
          };
          expect(SettingsManager.getSetting(key)).toBe(defaults[key]);
        });
      }
    });

    describe('string settings', () => {
      const stringKeys = ['ollamaEndpoint', 'ollamaModel', 'embeddingModel'] as const;

      for (const key of stringKeys) {
        it(`should reject empty string for ${key}`, async () => {
          const { SettingsManager } = await getManagerWithStoredSettings({ [key]: '' });
          await SettingsManager.init();
          // Should use schema default
          const defaults: Record<string, string> = {
            ollamaEndpoint: 'http://localhost:11434',
            ollamaModel: 'llama3.2:3b',
            embeddingModel: 'mxbai-embed-large',
          };
          expect(SettingsManager.getSetting(key)).toBe(defaults[key]);
        });

        it(`should reject non-string for ${key}`, async () => {
          const { SettingsManager } = await getManagerWithStoredSettings({ [key]: 123 });
          await SettingsManager.init();
          const defaults: Record<string, string> = {
            ollamaEndpoint: 'http://localhost:11434',
            ollamaModel: 'llama3.2:3b',
            embeddingModel: 'mxbai-embed-large',
          };
          expect(SettingsManager.getSetting(key)).toBe(defaults[key]);
        });
      }
    });
  });

  // -----------------------------------------------------------------------
  // Storage edge cases
  // -----------------------------------------------------------------------
  describe('storage edge cases', () => {
    it('should handle storage API not available during save (updateSettings)', async () => {
      const { SettingsManager } = await getManagerWithNoStorage();

      await expect(SettingsManager.updateSettings({ logLevel: 3 })).rejects.toThrow(
        'Storage API not available'
      );
    });

    it('should handle sendMessage error in notifySettingsChanged gracefully', async () => {
      const { SettingsManager } = await getManagerWithSendMessageError();

      // Should not throw even though sendMessage produces a lastError
      await expect(SettingsManager.updateSettings({ logLevel: 3 })).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // applySettings (log level application)
  // -----------------------------------------------------------------------
  describe('applySettings (via init)', () => {
    it('should apply log level when loaded value differs from current Logger level', async () => {
      // Logger.getLevel() returns 2, stored logLevel is 4 => should call setLevelInternal(4)
      const { SettingsManager } = await getManagerWithStoredSettings({ logLevel: 4 });
      const { Logger } = await import('../logger');

      await SettingsManager.init();

      expect(Logger.setLevelInternal).toHaveBeenCalledWith(4);
    });

    it('should not call setLevelInternal when log level matches', async () => {
      // Logger.getLevel() returns 2, stored logLevel is also 2 => no call
      const { SettingsManager } = await getManagerWithStoredSettings({ logLevel: 2 });
      const { Logger } = await import('../logger');

      await SettingsManager.init();

      expect(Logger.setLevelInternal).not.toHaveBeenCalled();
    });
  });
});
