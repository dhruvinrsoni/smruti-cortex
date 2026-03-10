import { describe, it, expect, vi, beforeEach } from 'vitest';

// Logger mock must be declared before module imports
vi.mock('../logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    forComponent: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  ComponentLogger: class {},
}));

// browserAPI mock
vi.mock('../helpers', () => {
  const storageMock = {
    get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
    set: vi.fn((_items: unknown, cb?: () => void) => cb?.()),
    remove: vi.fn((_key: unknown, cb?: () => void) => cb?.()),
  };
  return {
    browserAPI: {
      storage: { local: storageMock },
      runtime: { lastError: null },
    },
  };
});

// SettingsManager has static state — use dynamic import + resetModules to isolate tests
describe('SettingsManager', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function getManager() {
    // Re-apply mocks after resetModules
    vi.mock('../logger', () => ({
      Logger: {
        info: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        forComponent: () => ({
          info: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        }),
      },
      ComponentLogger: class {},
    }));
    vi.mock('../helpers', () => {
      const storageMock = {
        get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
        set: vi.fn((_items: unknown, cb?: () => void) => cb?.()),
        remove: vi.fn((_key: unknown, cb?: () => void) => cb?.()),
      };
      return {
        browserAPI: {
          storage: { local: storageMock },
          runtime: { lastError: null },
        },
      };
    });
    const { SettingsManager } = await import('../settings');
    return SettingsManager;
  }

  describe('DisplayMode enum', () => {
    it('should export DisplayMode with LIST and CARDS', async () => {
      const { DisplayMode } = await import('../settings');
      expect(DisplayMode.LIST).toBe('list');
      expect(DisplayMode.CARDS).toBe('cards');
    });
  });

  describe('isInitialized', () => {
    it('should return false before init() is called', async () => {
      const SM = await getManager();
      expect(SM.isInitialized()).toBe(false);
    });

    it('should return true after init() is called', async () => {
      const SM = await getManager();
      SM.init();
      expect(SM.isInitialized()).toBe(true);
    });
  });

  describe('getSettings', () => {
    it('should return default settings before init', async () => {
      const SM = await getManager();
      const settings = SM.getSettings();
      expect(settings).toHaveProperty('displayMode');
      expect(settings).toHaveProperty('logLevel');
      expect(settings).toHaveProperty('highlightMatches');
    });

    it('should return a copy (not internal reference)', async () => {
      const SM = await getManager();
      const s1 = SM.getSettings();
      const s2 = SM.getSettings();
      expect(s1).not.toBe(s2);
    });
  });

  describe('getSetting', () => {
    it('should return the default displayMode', async () => {
      const SM = await getManager();
      expect(SM.getSetting('displayMode')).toBe('list');
    });

    it('should return logLevel default of 2 (INFO)', async () => {
      const SM = await getManager();
      expect(SM.getSetting('logLevel')).toBe(2);
    });

    it('should return true for highlightMatches default', async () => {
      const SM = await getManager();
      expect(SM.getSetting('highlightMatches')).toBe(true);
    });

    it('should return false for ollamaEnabled default', async () => {
      const SM = await getManager();
      expect(SM.getSetting('ollamaEnabled')).toBe(false);
    });

    it('should return indexBookmarks default as true', async () => {
      const SM = await getManager();
      expect(SM.getSetting('indexBookmarks')).toBe(true);
    });
  });

  describe('setSetting / updateSettings', () => {
    it('should update a setting value', async () => {
      const SM = await getManager();
      SM.setSetting('logLevel', 3);
      expect(SM.getSetting('logLevel')).toBe(3);
    });

    it('should update multiple settings at once via updateSettings', async () => {
      const SM = await getManager();
      SM.updateSettings({ logLevel: 1, highlightMatches: false });
      expect(SM.getSetting('logLevel')).toBe(1);
      expect(SM.getSetting('highlightMatches')).toBe(false);
    });

    it('should keep other settings unchanged after partial update', async () => {
      const SM = await getManager();
      const origDisplay = SM.getSetting('displayMode');
      SM.updateSettings({ logLevel: 3 });
      expect(SM.getSetting('displayMode')).toBe(origDisplay);
    });
  });

  describe('resetToDefaults', () => {
    it('should restore settings to schema defaults', async () => {
      const SM = await getManager();
      SM.setSetting('logLevel', 4);
      SM.resetToDefaults();
      expect(SM.getSetting('logLevel')).toBe(2); // default is 2
    });
  });

  describe('default values', () => {
    it('should default sortBy to best-match', async () => {
      const SM = await getManager();
      expect(SM.getSetting('sortBy')).toBe('best-match');
    });

    it('should default defaultResultCount to 50', async () => {
      const SM = await getManager();
      expect(SM.getSetting('defaultResultCount')).toBe(50);
    });

    it('should default maxResults to 100', async () => {
      const SM = await getManager();
      expect(SM.getSetting('maxResults')).toBe(100);
    });

    it('should default theme to auto', async () => {
      const SM = await getManager();
      expect(SM.getSetting('theme')).toBe('auto');
    });

    it('should default ollamaModel to llama3.2:1b', async () => {
      const SM = await getManager();
      expect(SM.getSetting('ollamaModel')).toBe('llama3.2:1b');
    });

    it('should default sensitiveUrlBlacklist to empty array', async () => {
      const SM = await getManager();
      expect(SM.getSetting('sensitiveUrlBlacklist')).toEqual([]);
    });
  });
});
