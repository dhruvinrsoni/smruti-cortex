// Tests for favicon-cache.ts — testing via getFaviconWithCache (which calls shouldSkipFavicon internally)
// Note: shouldSkipFavicon is a local function, tested indirectly via getFaviconWithCache

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/logger', () => ({
  Logger: {
    info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
    forComponent: () => ({
      info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
}));

// Mock indexedDB so openFaviconDatabase doesn't fail in jsdom
const mockObjectStore = {
  get: vi.fn(() => ({ onsuccess: null, onerror: null, result: undefined })),
  put: vi.fn(() => ({ onsuccess: null, onerror: null })),
  createIndex: vi.fn(),
};
const mockTransaction = {
  objectStore: vi.fn(() => mockObjectStore),
};
const mockIDBDatabase = {
  objectStoreNames: { contains: vi.fn(() => true) },
  transaction: vi.fn(() => mockTransaction),
  createObjectStore: vi.fn(() => mockObjectStore),
};

// Set up fake IDB that returns null cache (cache miss) for all gets
vi.stubGlobal('indexedDB', {
  open: vi.fn((name: string, version: number) => {
    const req: Record<string, unknown> = {};
    setTimeout(() => {
      if (typeof req.onsuccess === 'function') {
        (req.onsuccess as (e: { target: { result: unknown } }) => void)({ target: { result: mockIDBDatabase } });
      }
    }, 0);
    req.result = mockIDBDatabase;
    return req;
  }),
});

// Patch mockObjectStore.get to simulate cache miss (result = undefined)
beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockObjectStore.get.mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = {};
    setTimeout(() => {
      req.result = undefined;
      if (typeof req.onsuccess === 'function') {
        (req.onsuccess as (e: { target: { result: unknown } }) => void)({ target: { result: undefined } });
      }
    }, 0);
    return req;
  });
});

import { getFaviconWithCache } from '../favicon-cache';

describe('getFaviconWithCache — shouldSkipFavicon coverage', () => {
  it('returns null for localhost (skip hostname)', async () => {
    const result = await getFaviconWithCache('localhost');
    expect(result).toBeNull();
  });

  it('returns null for 127.0.0.1', async () => {
    const result = await getFaviconWithCache('127.0.0.1');
    expect(result).toBeNull();
  });

  it('returns null for ::1 (IPv6 loopback)', async () => {
    const result = await getFaviconWithCache('::1');
    expect(result).toBeNull();
  });

  it('returns null for IPv4 address pattern', async () => {
    const result = await getFaviconWithCache('192.168.1.1');
    expect(result).toBeNull();
  });

  it('returns null for .local domain', async () => {
    const result = await getFaviconWithCache('server.local');
    expect(result).toBeNull();
  });

  it('returns null for .internal domain', async () => {
    const result = await getFaviconWithCache('db.internal');
    expect(result).toBeNull();
  });

  it('returns null for .localhost domain', async () => {
    const result = await getFaviconWithCache('app.localhost');
    expect(result).toBeNull();
  });

  it('returns null for chrome newtab', async () => {
    const result = await getFaviconWithCache('newtab');
    expect(result).toBeNull();
  });

  it('returns null for chrome extensions', async () => {
    const result = await getFaviconWithCache('extensions');
    expect(result).toBeNull();
  });

  it('returns null for bracketed IPv6', async () => {
    const result = await getFaviconWithCache('[::1]');
    expect(result).toBeNull();
  });

  it('returns null for empty hostname', async () => {
    const result = await getFaviconWithCache('');
    expect(result).toBeNull();
  });
});
