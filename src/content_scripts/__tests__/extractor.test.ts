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

describe('extractor IIFE — sensitive URL early return', () => {
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
    await (vi.dynamicImportSettled?.() ?? new Promise(r => setTimeout(r, 50)));
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
