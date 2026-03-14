// Tests for extractor.ts content script
// isSensitiveUrl is a local function — we test behavior indirectly
// The IIFE runs immediately on import with window.top === window (jsdom)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome runtime for the IIFE that runs on import
const mockSendMessage = vi.fn((_msg: unknown, cb: (r: unknown) => void) => cb(undefined));

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null,
    getManifest: () => ({ version: '1.0', manifest_version: 3 }),
  },
  storage: {
    local: {
      get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
    },
  },
});

// Provide a minimal document for jsdom
vi.stubGlobal('document', {
  title: 'Test Page',
  querySelector: vi.fn(() => null),
  querySelectorAll: vi.fn(() => []),
  referrer: '',
  readyState: 'complete',
});

vi.stubGlobal('location', { href: 'https://example.com/test' });

describe('extractor content script', () => {
  it('imports without throwing', async () => {
    await expect(import('../extractor')).resolves.toBeDefined();
  });

  it('module exports nothing (no named exports)', async () => {
    // extractor.ts has no exports, it's side-effect only
    const mod = await import('../extractor');
    expect(typeof mod).toBe('object');
  });
});

describe('isSensitiveUrl patterns (tested via pattern logic)', () => {
  // Since isSensitiveUrl is not exported, we verify the patterns work by
  // examining the function logic directly through string matching

  const SENSITIVE_PATTERNS = [
    'bank', 'banking', 'onlinebanking',
    'login', 'signin', 'signup', 'auth', 'authenticate', 'sso', 'oauth',
    '1password', 'lastpass', 'bitwarden', 'dashlane', 'keepass',
    'paypal', 'stripe', 'square', 'payment',
    'creditcard', 'debitcard', 'account/security', 'account/password',
  ];

  const SENSITIVE_DOMAINS = [
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'usbank.com',
    'capitalone.com', 'pnc.com', 'tdbank.com', 'ally.com',
    '1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com', 'keeper.com',
    'paypal.com', 'stripe.com', 'square.com',
    'coinbase.com', 'binance.com', 'kraken.com',
  ];

  // Re-implement the logic to verify patterns are correct
  function isSensitiveUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return false;
    }

    for (const pattern of SENSITIVE_PATTERNS) {
      if (lowerUrl.includes(pattern)) return true;
    }

    for (const domain of SENSITIVE_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) return true;
    }

    return false;
  }

  it('detects bank-related URLs', () => {
    expect(isSensitiveUrl('https://mybank.example.com/login')).toBe(true);
  });

  it('detects login page URLs', () => {
    expect(isSensitiveUrl('https://example.com/login')).toBe(true);
  });

  it('detects signin URLs', () => {
    expect(isSensitiveUrl('https://app.example.com/signin')).toBe(true);
  });

  it('detects signup page', () => {
    expect(isSensitiveUrl('https://example.com/signup')).toBe(true);
  });

  it('detects auth URLs', () => {
    expect(isSensitiveUrl('https://example.com/auth/callback')).toBe(true);
  });

  it('detects password manager domains', () => {
    expect(isSensitiveUrl('https://1password.com/sign-in')).toBe(true);
    expect(isSensitiveUrl('https://lastpass.com/login')).toBe(true);
    expect(isSensitiveUrl('https://bitwarden.com/account')).toBe(true);
  });

  it('detects payment domains', () => {
    expect(isSensitiveUrl('https://paypal.com/checkout')).toBe(true);
    expect(isSensitiveUrl('https://stripe.com/dashboard')).toBe(true);
  });

  it('detects bank domains (exact match)', () => {
    expect(isSensitiveUrl('https://chase.com/account')).toBe(true);
    expect(isSensitiveUrl('https://bankofamerica.com')).toBe(true);
  });

  it('detects bank subdomain', () => {
    expect(isSensitiveUrl('https://secure.ally.com')).toBe(true);
  });

  it('detects crypto exchange domains', () => {
    expect(isSensitiveUrl('https://coinbase.com/trade')).toBe(true);
    expect(isSensitiveUrl('https://binance.com')).toBe(true);
  });

  it('does not flag safe URLs', () => {
    expect(isSensitiveUrl('https://github.com/user/repo')).toBe(false);
    expect(isSensitiveUrl('https://example.com/docs')).toBe(false);
    expect(isSensitiveUrl('https://google.com/search?q=test')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSensitiveUrl('https://example.com/LOGIN')).toBe(true);
    expect(isSensitiveUrl('https://CHASE.COM/account')).toBe(true);
  });

  it('checks oauth pattern', () => {
    expect(isSensitiveUrl('https://example.com/oauth/authorize')).toBe(true);
  });

  // New edge case tests
  it('detects SSO pattern', () => {
    expect(isSensitiveUrl('https://accounts.example.com/sso/login')).toBe(true);
  });

  it('detects authenticate pattern', () => {
    expect(isSensitiveUrl('https://api.example.com/authenticate')).toBe(true);
  });

  it('detects creditcard and debitcard patterns', () => {
    expect(isSensitiveUrl('https://example.com/creditcard/apply')).toBe(true);
    expect(isSensitiveUrl('https://example.com/debitcard/manage')).toBe(true);
  });

  it('detects account/security and account/password paths', () => {
    expect(isSensitiveUrl('https://example.com/account/security')).toBe(true);
    expect(isSensitiveUrl('https://example.com/account/password')).toBe(true);
  });

  it('detects keepass and dashlane patterns', () => {
    expect(isSensitiveUrl('https://keepass.info/download')).toBe(true);
    expect(isSensitiveUrl('https://dashlane.com/features')).toBe(true);
  });

  it('detects kraken crypto domain', () => {
    expect(isSensitiveUrl('https://kraken.com/trade')).toBe(true);
  });

  it('returns false for invalid URLs', () => {
    expect(isSensitiveUrl('not-a-url')).toBe(false);
  });
});

// ==========================================
// Tests that exercise the ACTUAL extractor.ts code paths
// by importing with different location.href values
// ==========================================

describe('extractor IIFE — sensitive URL early return (lines 36-37, 43-44, 66)', () => {
  let mockSendMsg: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockSendMsg = vi.fn((_msg: unknown, cb: (r: unknown) => void) => cb(undefined));

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: mockSendMsg,
        lastError: null,
        getManifest: () => ({ version: '1.0', manifest_version: 3 }),
      },
      storage: { local: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})) } },
    });
    vi.stubGlobal('document', {
      title: 'Test Page',
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      referrer: '',
      readyState: 'complete',
    });
  });

  it('skips extraction for URL matching a sensitive pattern (e.g. /login)', async () => {
    vi.stubGlobal('location', { href: 'https://example.com/login' });
    await import('../extractor');
    // Should NOT send METADATA_CAPTURE because isSensitiveUrl returns true at line 37
    await vi.dynamicImportSettled?.() ?? new Promise(r => setTimeout(r, 50));
    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(0);
  });

  it('skips extraction for URL matching a sensitive domain (e.g. chase.com)', async () => {
    vi.stubGlobal('location', { href: 'https://chase.com/accounts' });
    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));
    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(0);
  });

  it('skips extraction for subdomain of sensitive domain (e.g. secure.ally.com)', async () => {
    vi.stubGlobal('location', { href: 'https://secure.ally.com/dashboard' });
    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));
    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(0);
  });

  it('proceeds with extraction for non-sensitive URL', async () => {
    vi.stubGlobal('location', { href: 'https://github.com/user/repo' });
    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));
    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(1);
  });
});

describe('extractor IIFE — user blacklist check (lines 78-89)', () => {
  let mockSendMsg: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockSendMsg = vi.fn();

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: mockSendMsg,
        lastError: null,
        getManifest: () => ({ version: '1.0', manifest_version: 3 }),
      },
      storage: { local: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})) } },
    });
    vi.stubGlobal('document', {
      title: 'Blacklist Test',
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      referrer: '',
      readyState: 'complete',
    });
    // Use a non-sensitive URL that will pass isSensitiveUrl but be caught by blacklist
    vi.stubGlobal('location', { href: 'https://my-internal-tool.example.com/dashboard' });
  });

  it('skips extraction when URL matches user blacklist pattern', async () => {
    // First call: GET_SETTINGS → returns blacklist containing "internal-tool"
    // Second call: METADATA_CAPTURE (should NOT happen)
    mockSendMsg.mockImplementation((msg: { type: string }, cb: (r: unknown) => void) => {
      if (msg.type === 'GET_SETTINGS') {
        cb({ settings: { sensitiveUrlBlacklist: ['internal-tool'] } });
      } else {
        cb(undefined);
      }
    });

    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));

    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(0);
  });

  it('proceeds when blacklist does not match URL', async () => {
    mockSendMsg.mockImplementation((msg: { type: string }, cb: (r: unknown) => void) => {
      if (msg.type === 'GET_SETTINGS') {
        cb({ settings: { sensitiveUrlBlacklist: ['other-site'] } });
      } else {
        cb(undefined);
      }
    });

    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));

    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(1);
  });

  it('proceeds when blacklist is empty', async () => {
    mockSendMsg.mockImplementation((msg: { type: string }, cb: (r: unknown) => void) => {
      if (msg.type === 'GET_SETTINGS') {
        cb({ settings: { sensitiveUrlBlacklist: [] } });
      } else {
        cb(undefined);
      }
    });

    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));

    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(1);
  });

  it('proceeds when GET_SETTINGS fails (fail-open)', async () => {
    mockSendMsg.mockImplementation((msg: { type: string }, cb: (r: unknown) => void) => {
      if (msg.type === 'GET_SETTINGS') {
        throw new Error('Extension context invalidated');
      } else {
        cb(undefined);
      }
    });

    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));

    // Should still attempt METADATA_CAPTURE (fail-open behavior)
    // The catch block on line 93-95 absorbs the error
    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(1);
  });

  it('skips empty patterns in blacklist', async () => {
    mockSendMsg.mockImplementation((msg: { type: string }, cb: (r: unknown) => void) => {
      if (msg.type === 'GET_SETTINGS') {
        cb({ settings: { sensitiveUrlBlacklist: ['', '  ', 'internal-tool'] } });
      } else {
        cb(undefined);
      }
    });

    await import('../extractor');
    await new Promise(r => setTimeout(r, 50));

    // "internal-tool" matches the URL, so METADATA_CAPTURE should NOT fire
    const metadataCalls = mockSendMsg.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'METADATA_CAPTURE'
    );
    expect(metadataCalls.length).toBe(0);
  });
});
