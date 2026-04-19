import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Reusable Logger mock factory
// ---------------------------------------------------------------------------
const mkLogger = () => ({
  Logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
    getLevel: vi.fn(() => 2),
    setLevelInternal: vi.fn(),
  },
  ComponentLogger: class {},
  errorMeta: (err: unknown) =>
    err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'non-Error', message: String(err) },
});

// ---------------------------------------------------------------------------
// Fresh module import with optional stored settings
// ---------------------------------------------------------------------------
async function freshModule(stored?: Record<string, unknown>) {
  vi.doMock('../logger', () => mkLogger());
  vi.doMock('../helpers', () => ({
    browserAPI: {
      storage: {
        local: {
          get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) =>
            cb(stored !== undefined ? { smrutiCortexSettings: stored } : {}),
          ),
          set: vi.fn((_i: unknown, cb?: () => void) => cb?.()),
        },
      },
      runtime: {
        lastError: null,
        sendMessage: vi.fn((_m: unknown, cb?: () => void) => cb?.()),
      },
    },
  }));
  return import('../settings');
}

// ===========================================================================
// Tests
// ===========================================================================

describe('SettingsManager extra coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // URL site settings — jiraSiteUrl & confluenceSiteUrl validate + transform
  // -----------------------------------------------------------------------
  describe.each(['jiraSiteUrl', 'confluenceSiteUrl'] as const)(
    '%s validation & transform',
    (key) => {
      it.each([
        ['valid https URL', 'https://example.com/path', 'https://example.com'],
        ['valid http URL with port', 'http://example.com:8080/foo', 'http://example.com:8080'],
        ['empty string', '', ''],
      ])('should accept %s', async (_label, input, expected) => {
        const { SettingsManager } = await freshModule({ [key]: input });
        await SettingsManager.init();
        expect(SettingsManager.getSetting(key)).toBe(expected);
      });

      it.each([
        ['non-string', 123],
        ['invalid URL string', 'not-a-url'],
        ['ftp:// protocol', 'ftp://example.com'],
      ])('should reject %s and use default', async (_label, input) => {
        const { SettingsManager } = await freshModule({ [key]: input });
        await SettingsManager.init();
        expect(SettingsManager.getSetting(key)).toBe('');
      });
    },
  );

  // -----------------------------------------------------------------------
  // webSearchEngine — validate + transform
  // -----------------------------------------------------------------------
  describe('webSearchEngine', () => {
    it.each([
      ['duckduckgo', 'google'],
      ['bing', 'google'],
      ['github', 'github'],
      ['gcp', 'gcp'],
      ['google', 'google'],
      ['youtube', 'youtube'],
    ])('should transform "%s" → "%s"', async (input, expected) => {
      const { SettingsManager } = await freshModule({ webSearchEngine: input });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('webSearchEngine')).toBe(expected);
    });

    it('should reject invalid engine and use default', async () => {
      const { SettingsManager } = await freshModule({ webSearchEngine: 'yahoo' });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('webSearchEngine')).toBe('google');
    });
  });

  // -----------------------------------------------------------------------
  // commandPaletteModes
  // -----------------------------------------------------------------------
  describe('commandPaletteModes', () => {
    it('should accept valid subset', async () => {
      const { SettingsManager } = await freshModule({ commandPaletteModes: ['/', '>'] });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('commandPaletteModes')).toEqual(['/', '>']);
    });

    it('should reject array with invalid mode', async () => {
      const { SettingsManager } = await freshModule({
        commandPaletteModes: ['/', 'invalid'],
      });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('commandPaletteModes')).toEqual([
        '/', '>', '@', '#', '??',
      ]);
    });

    it('should reject non-array', async () => {
      const { SettingsManager } = await freshModule({ commandPaletteModes: '/' });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('commandPaletteModes')).toEqual([
        '/', '>', '@', '#', '??',
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // toolbarToggles
  // -----------------------------------------------------------------------
  describe('toolbarToggles', () => {
    it('should accept valid string array', async () => {
      const { SettingsManager } = await freshModule({
        toolbarToggles: ['ollamaEnabled'],
      });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('toolbarToggles')).toEqual(['ollamaEnabled']);
    });

    it('should reject array with non-string elements', async () => {
      const { SettingsManager } = await freshModule({ toolbarToggles: [1, 2] });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('toolbarToggles')).toEqual([
        'ollamaEnabled', 'indexBookmarks', 'showDuplicateUrls',
      ]);
    });

    it('should reject non-array', async () => {
      const { SettingsManager } = await freshModule({ toolbarToggles: 'foo' });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('toolbarToggles')).toEqual([
        'ollamaEnabled', 'indexBookmarks', 'showDuplicateUrls',
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Boolean settings NOT covered by the main test file
  // -----------------------------------------------------------------------
  describe('additional boolean settings', () => {
    const boolSettings: Array<[string, boolean]> = [
      ['showRecentHistory', true],
      ['showRecentSearches', true],
      ['unifiedScroll', false],
      ['commandPaletteEnabled', true],
      ['commandPaletteInPopup', false],
      ['commandPaletteOnboarded', false],
      ['advancedBrowserCommands', false],
    ];

    it.each(boolSettings)(
      '%s: should accept valid boolean value',
      async (key) => {
        const { SettingsManager } = await freshModule({ [key]: true });
        await SettingsManager.init();
        expect(SettingsManager.getSetting(key as any)).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    );

    it.each(boolSettings)(
      '%s: should reject non-boolean and use default (%s)',
      async (key, defaultVal) => {
        const { SettingsManager } = await freshModule({ [key]: 'yes' });
        await SettingsManager.init();
        expect(SettingsManager.getSetting(key as any)).toBe(defaultVal); // eslint-disable-line @typescript-eslint/no-explicit-any
      },
    );
  });

  // -----------------------------------------------------------------------
  // developerGithubPat
  // -----------------------------------------------------------------------
  describe('developerGithubPat', () => {
    it('should accept valid string', async () => {
      const { SettingsManager } = await freshModule({
        developerGithubPat: 'ghp_abc123',
      });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('developerGithubPat')).toBe('ghp_abc123');
    });

    it('should reject non-string and use default', async () => {
      const { SettingsManager } = await freshModule({ developerGithubPat: 12345 });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('developerGithubPat')).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // atlassianSiteUrl migration edge cases
  // -----------------------------------------------------------------------
  describe('atlassianSiteUrl migration', () => {
    it('should migrate valid URL to both jira and confluence fields', async () => {
      const { SettingsManager } = await freshModule({
        atlassianSiteUrl: 'https://jira.example.com/some/path',
      });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('jiraSiteUrl')).toBe('https://jira.example.com');
      expect(SettingsManager.getSetting('confluenceSiteUrl')).toBe('https://jira.example.com');
    });

    it('should NOT migrate when jiraSiteUrl is already set', async () => {
      const { SettingsManager } = await freshModule({
        atlassianSiteUrl: 'https://old.example.com',
        jiraSiteUrl: 'https://jira.example.com',
      });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('jiraSiteUrl')).toBe('https://jira.example.com');
      expect(SettingsManager.getSetting('confluenceSiteUrl')).toBe('');
    });

    it('should NOT migrate when confluenceSiteUrl is already set', async () => {
      const { SettingsManager } = await freshModule({
        atlassianSiteUrl: 'https://old.example.com',
        confluenceSiteUrl: 'https://confluence.example.com',
      });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('confluenceSiteUrl')).toBe(
        'https://confluence.example.com',
      );
      expect(SettingsManager.getSetting('jiraSiteUrl')).toBe('');
    });

    it('should ignore bad legacy URL (catch branch)', async () => {
      const { SettingsManager } = await freshModule({
        atlassianSiteUrl: 'not-a-valid-url',
      });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('jiraSiteUrl')).toBe('');
      expect(SettingsManager.getSetting('confluenceSiteUrl')).toBe('');
    });

    it('should ignore non-string legacy value', async () => {
      const { SettingsManager } = await freshModule({ atlassianSiteUrl: 12345 });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('jiraSiteUrl')).toBe('');
    });

    it('should ignore empty/whitespace-only legacy value', async () => {
      const { SettingsManager } = await freshModule({ atlassianSiteUrl: '   ' });
      await SettingsManager.init();
      expect(SettingsManager.getSetting('jiraSiteUrl')).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Error handling — uncovered catch blocks and error paths
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('init catch: should use defaults when storage.get throws synchronously', async () => {
      vi.doMock('../logger', () => mkLogger());
      vi.doMock('../helpers', () => ({
        browserAPI: {
          storage: {
            local: {
              get: vi.fn(() => { throw new Error('Storage access denied'); }),
              set: vi.fn((_i: unknown, cb?: () => void) => cb?.()),
            },
          },
          runtime: {
            lastError: null,
            sendMessage: vi.fn((_m: unknown, cb?: () => void) => cb?.()),
          },
        },
      }));

      const { SettingsManager } = await import('../settings');
      await SettingsManager.init();

      expect(SettingsManager.isInitialized()).toBe(true);
      expect(SettingsManager.getSetting('logLevel')).toBe(2);
    });

    it('loadFromStorage callback catch: should resolve null on getter error', async () => {
      vi.doMock('../logger', () => mkLogger());
      vi.doMock('../helpers', () => ({
        browserAPI: {
          storage: {
            local: {
              get: vi.fn((_k: unknown, cb: (r: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                const result: Record<string, unknown> = {};
                Object.defineProperty(result, 'smrutiCortexSettings', {
                  get() { throw new Error('corrupted storage'); },
                });
                cb(result);
              }),
              set: vi.fn((_i: unknown, cb?: () => void) => cb?.()),
            },
          },
          runtime: {
            lastError: null,
            sendMessage: vi.fn((_m: unknown, cb?: () => void) => cb?.()),
          },
        },
      }));

      const { SettingsManager } = await import('../settings');
      await SettingsManager.init();

      expect(SettingsManager.getSetting('logLevel')).toBe(2);
    });

    it('notifySettingsChanged catch: should swallow sendMessage throw', async () => {
      vi.doMock('../logger', () => mkLogger());
      vi.doMock('../helpers', () => ({
        browserAPI: {
          storage: {
            local: {
              get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
              set: vi.fn((_i: unknown, cb?: () => void) => cb?.()),
            },
          },
          runtime: {
            lastError: null,
            sendMessage: vi.fn(() => {
              throw new Error('Extension context invalidated');
            }),
          },
        },
      }));

      const { SettingsManager } = await import('../settings');
      await expect(
        SettingsManager.updateSettings({ logLevel: 3 }),
      ).resolves.toBeUndefined();
    });

    it('applySettings catch: should swallow Logger.getLevel throw', async () => {
      const logger = mkLogger();
      logger.Logger.getLevel = vi.fn(() => { throw new Error('Logger broken'); });
      vi.doMock('../logger', () => logger);
      vi.doMock('../helpers', () => ({
        browserAPI: {
          storage: {
            local: {
              get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
              set: vi.fn((_i: unknown, cb?: () => void) => cb?.()),
            },
          },
          runtime: {
            lastError: null,
            sendMessage: vi.fn((_m: unknown, cb?: () => void) => cb?.()),
          },
        },
      }));

      const { SettingsManager } = await import('../settings');
      await SettingsManager.init();

      expect(SettingsManager.isInitialized()).toBe(true);
      expect(SettingsManager.getSetting('logLevel')).toBe(2);
    });

    it('importSettings: should throw "Invalid settings format" for null JSON', async () => {
      const { SettingsManager } = await freshModule();
      await expect(SettingsManager.importSettings('null')).rejects.toThrow(
        'Invalid settings format',
      );
    });
  });

  // -----------------------------------------------------------------------
  // applyRemoteSettings — same log level branch
  // -----------------------------------------------------------------------
  describe('applyRemoteSettings', () => {
    it('should skip setLevelInternal when log level matches current', async () => {
      const { SettingsManager } = await freshModule();
      const { Logger } = await import('../logger');

      await SettingsManager.applyRemoteSettings({ logLevel: 2 });

      expect(Logger.setLevelInternal).not.toHaveBeenCalled();
    });
  });
});
