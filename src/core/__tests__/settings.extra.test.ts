import { describe, it, expect, vi } from 'vitest';

// Extra SettingsManager edge-case tests not covered in the main suite

describe('SettingsManager extra edge cases', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('migrates atlassianSiteUrl to jiraSiteUrl and confluenceSiteUrl', async () => {
    vi.doMock('../logger', () => ({
      Logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }),
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
        storage: {
          local: {
            get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => {
              cb({ smrutiCortexSettings: { atlassianSiteUrl: 'https://jira.example.com/some/path' } });
            }),
          },
        },
        runtime: { lastError: null, sendMessage: vi.fn((_msg: unknown, cb?: () => void) => cb?.()) },
      },
    }));

    const { SettingsManager } = await import('../settings');
    await SettingsManager.init();

    expect(SettingsManager.getSetting('jiraSiteUrl')).toBe('https://jira.example.com');
    expect(SettingsManager.getSetting('confluenceSiteUrl')).toBe('https://jira.example.com');
  });

  it('transforms webSearchEngine values (bing|duckduckgo → google) and preserves valid engines', async () => {
    // bing -> google
    vi.doMock('../logger', () => ({
      Logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }),
        getLevel: vi.fn(() => 2),
        setLevelInternal: vi.fn(),
      },
      ComponentLogger: class {},
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
    }));

    vi.doMock('../helpers', () => ({
      browserAPI: { storage: { local: { get: vi.fn((_k, cb) => cb({ smrutiCortexSettings: { webSearchEngine: 'bing' } })), set: vi.fn((_i, cb) => cb?.()) } }, runtime: { lastError: null, sendMessage: vi.fn((_m, cb?: () => void) => cb?.()) } },
    }));

    const { SettingsManager } = await import('../settings');
    await SettingsManager.init();
    expect(SettingsManager.getSetting('webSearchEngine')).toBe('google');

    // youtube preserved
    vi.resetModules();
    vi.doMock('../logger', () => ({
      Logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }),
        getLevel: vi.fn(() => 2),
        setLevelInternal: vi.fn(),
      },
      ComponentLogger: class {},
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
    }));
    vi.doMock('../helpers', () => ({ browserAPI: { storage: { local: { get: vi.fn((_k, cb) => cb({ smrutiCortexSettings: { webSearchEngine: 'youtube' } })), set: vi.fn((_i, cb) => cb?.()) } }, runtime: { lastError: null, sendMessage: vi.fn((_m, cb?: () => void) => cb?.()) } } }));

    const { SettingsManager: SettingsManager2 } = await import('../settings');
    await SettingsManager2.init();
    expect(SettingsManager2.getSetting('webSearchEngine')).toBe('youtube');
  });

  it('handles notifySettingsChanged sendMessage lastError without throwing', async () => {
    vi.doMock('../logger', () => ({
      Logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }),
        getLevel: vi.fn(() => 2),
        setLevelInternal: vi.fn(),
      },
      ComponentLogger: class {},
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
    }));

    vi.doMock('../helpers', () => {
      const runtimeRef: any = { lastError: null };
      runtimeRef.sendMessage = vi.fn((_msg: unknown, cb?: () => void) => {
        runtimeRef.lastError = { message: 'No receiving end' };
        cb?.();
      });
      const storageMock = { get: vi.fn((_k, cb) => cb({})), set: vi.fn((_i, cb) => cb?.()) };
      return { browserAPI: { storage: { local: storageMock }, runtime: runtimeRef } };
    });

    const { SettingsManager } = await import('../settings');

    // Should not throw even though sendMessage produces a lastError
    await expect(SettingsManager.updateSettings({ logLevel: 3 })).resolves.toBeUndefined();

    const { browserAPI } = await import('../helpers');
    expect(browserAPI.runtime.sendMessage).toHaveBeenCalled();
  });
});
