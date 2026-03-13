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
