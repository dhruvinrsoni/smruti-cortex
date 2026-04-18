/*
 * Tests for `service-worker` IMPORT_INDEX handling.
 * These tests stub `chrome` before importing the module so listeners
 * are registered against the test stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('service-worker: IMPORT_INDEX', () => {
  let runtimeListener: ((msg: any, sender: any, sendResponse: any) => void) | undefined;

  beforeEach(async () => {
    // Ensure fresh module load and no cached state
    vi.resetModules();
    runtimeListener = undefined;

    const chromeStub: any = {
      runtime: {
        onMessage: { addListener: (fn: any) => { runtimeListener = fn; } },
        onConnect: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        lastError: null,
        getManifest: () => ({ version: '0.0.0', manifest_version: 3 }),
      },
      commands: { onCommand: { addListener: () => {} } },
      alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
      tabs: { onActivated: { addListener: () => {} }, onUpdated: { addListener: () => {} }, query: vi.fn().mockResolvedValue([]) },
      action: { openPopup: vi.fn().mockResolvedValue(undefined) },
    };

    vi.stubGlobal('chrome', chromeStub);

    // Mock logger to avoid noisy output and side-effects
    vi.mock('../../core/logger', () => ({
      Logger: {
        forComponent: () => ({
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          trace: () => {},
        }),
        getLevel: () => 'info',
        setLevel: async () => {},
      },
    }));

    // Import service worker AFTER stubbing globals and mocks so it registers listeners
    // against our test stub.
    await import('../service-worker');
  });

  afterEach(() => {
    // Clean up global stub and mocks
    try { delete (globalThis as any).chrome; } catch {}
    vi.resetAllMocks();
  });

  it('responds with error for non-array payload', () => {
    const sendResponse = vi.fn();
    expect(typeof runtimeListener).toBe('function');
    (runtimeListener as any)({ type: 'IMPORT_INDEX', items: { not: 'array' } }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'ERROR', message: 'Invalid import data: items must be an array' });
  });

  it('responds with error for oversized payload (>50000 items)', () => {
    const sendResponse = vi.fn();
    expect(typeof runtimeListener).toBe('function');
    const items = new Array(50001).fill({ url: 'https://example.com', title: 'x', lastVisit: Date.now() });
    (runtimeListener as any)({ type: 'IMPORT_INDEX', items }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalled();
    // Assert status is ERROR and message mentions the size limit
    const arg = sendResponse.mock.calls[0][0];
    expect(arg).toBeDefined();
    expect(arg.status).toBe('ERROR');
    expect(arg.message).toMatch(/exceeds limit/);
  });
});
