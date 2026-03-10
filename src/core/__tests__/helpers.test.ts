import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Note: browserAPI is a module-level IIFE evaluated at import time.
// Test detectBrowser(), isFirefox(), isChromium(), and getBrowserCompatibility() directly.

describe('detectBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return "chrome" for a Chrome user agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      serviceWorker: undefined,
    });
    const { detectBrowser } = await import('../helpers');
    expect(detectBrowser()).toBe('chrome');
  });

  it('should return "firefox" for a Firefox user agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0',
      serviceWorker: undefined,
    });
    const { detectBrowser } = await import('../helpers');
    expect(detectBrowser()).toBe('firefox');
  });

  it('should return "edge" for an Edge user agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      serviceWorker: undefined,
    });
    const { detectBrowser } = await import('../helpers');
    expect(detectBrowser()).toBe('edge');
  });

  it('should return "opera" for an Opera user agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
      serviceWorker: undefined,
    });
    const { detectBrowser } = await import('../helpers');
    expect(detectBrowser()).toBe('opera');
  });

  it('should return "safari" for a Safari user agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14) AppleWebKit/605.1 Safari/605.1',
      serviceWorker: undefined,
    });
    const { detectBrowser } = await import('../helpers');
    expect(detectBrowser()).toBe('safari');
  });

  it('should return "brave" for a Brave user agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Brave/120.0.0.0',
      serviceWorker: undefined,
    });
    const { detectBrowser } = await import('../helpers');
    expect(detectBrowser()).toBe('brave');
  });

  it('should return "unknown" for an unrecognized user agent', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'CustomBrowser/1.0',
      serviceWorker: undefined,
    });
    const { detectBrowser } = await import('../helpers');
    expect(detectBrowser()).toBe('unknown');
  });
});

describe('getBrowserCompatibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return an object with browser, supportsServiceWorker, supportsIndexedDB, supportsOmnibox, manifestVersion', async () => {
    vi.stubGlobal('chrome', {
      omnibox: {},
      runtime: {
        getManifest: () => ({ manifest_version: 3, version: '1.0.0' }),
        lastError: null,
      },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
      serviceWorker: { register: vi.fn() },
    });
    vi.stubGlobal('window', { indexedDB: {} });

    const { getBrowserCompatibility } = await import('../helpers');
    const result = getBrowserCompatibility();

    expect(result).toHaveProperty('browser');
    expect(result).toHaveProperty('supportsServiceWorker');
    expect(result).toHaveProperty('supportsIndexedDB');
    expect(result).toHaveProperty('supportsOmnibox');
    expect(result).toHaveProperty('manifestVersion');
  });

  it('should report manifestVersion 3 from manifest', async () => {
    vi.stubGlobal('chrome', {
      omnibox: {},
      runtime: {
        getManifest: () => ({ manifest_version: 3, version: '1.0.0' }),
        lastError: null,
      },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
    });
    vi.stubGlobal('window', { indexedDB: {} });

    const { getBrowserCompatibility } = await import('../helpers');
    const result = getBrowserCompatibility();
    expect(result.manifestVersion).toBe(3);
  });

  it('should have supportsOmnibox false when chrome.omnibox is undefined', async () => {
    vi.stubGlobal('chrome', {
      omnibox: undefined,
      runtime: {
        getManifest: () => ({ manifest_version: 3 }),
        lastError: null,
      },
    });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/120.0.0.0',
    });
    vi.stubGlobal('window', {});

    const { getBrowserCompatibility } = await import('../helpers');
    const result = getBrowserCompatibility();
    expect(result.supportsOmnibox).toBe(false);
  });
});

describe('isFirefox', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false in chrome-like environment (no browser global)', async () => {
    const { isFirefox } = await import('../helpers');
    // In jsdom environment, there is no `browser` global
    expect(isFirefox()).toBe(false);
  });
});

describe('isChromium', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when chrome is defined', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: null, getManifest: () => ({ manifest_version: 3, version: '1.0' }) },
    });
    const { isChromium } = await import('../helpers');
    expect(isChromium()).toBe(true);
  });
});

describe('promisify', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the result when no lastError', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: null, getManifest: () => ({ manifest_version: 3, version: '1.0' }) },
    });
    const { promisify } = await import('../helpers');
    const mockApi = vi.fn((_arg: string, cb: (result: string) => void) => cb('success'));
    const result = await promisify<string>(mockApi, 'test');
    expect(result).toBe('success');
  });

  it('rejects when chrome.runtime.lastError is set', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: { message: 'API error' }, getManifest: () => ({ manifest_version: 3, version: '1.0' }) },
    });
    const { promisify } = await import('../helpers');
    const mockApi = vi.fn((_arg: string, cb: (result: null) => void) => cb(null));
    await expect(promisify<null>(mockApi, 'test')).rejects.toBeDefined();
  });

  it('rejects when apiCall throws', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: null, getManifest: () => ({ manifest_version: 3, version: '1.0' }) },
    });
    const { promisify } = await import('../helpers');
    const throwingApi = vi.fn(() => { throw new Error('sync error'); });
    await expect(promisify(throwingApi)).rejects.toThrow('sync error');
  });
});
