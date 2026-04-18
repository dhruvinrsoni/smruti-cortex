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
      // Mock resilience helpers so initialization checks pass during tests
      vi.mock('../resilience', () => ({
        ensureReady: async () => true,
        clearAndRebuild: async () => ({ success: true, itemCount: 0, message: 'ok' }),
        checkHealth: async () => ({ healthy: true }),
        selfHeal: async () => true,
        startHealthMonitoring: () => {},
        recoverFromCorruption: async () => true,
        handleQuotaExceeded: async () => {},
      }));

    // Mock logger to avoid noisy output and side-effects
    vi.mock('../../core/logger', () => ({
      Logger: {
        init: async () => {},
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

    // Import service worker AFTER resetting modules. The global `chrome` stub
    // from test-setup.ts is used; service-worker will register its listeners
    // against that stub. Tests should invoke listeners via
    // `globalThis.__chromeMocks.callOnMessage(...)`.
    await import('../service-worker');
  });

  afterEach(() => {
    // Clean up mocks only; keep the test-setup global chrome stub in place
    vi.resetAllMocks();
  });

  it('responds with error for non-array payload', async () => {
    const sendResponse = vi.fn();
    const respPromise = new Promise<any>((resolve) => sendResponse.mockImplementation((...args: any[]) => resolve(args)));

    // Invoke the registered onMessage listener via the test harness
    (globalThis as any).__chromeMocks.callOnMessage({ type: 'IMPORT_INDEX', items: { not: 'array' } }, {}, sendResponse);

    const calledArgs = await respPromise;
    expect(sendResponse).toHaveBeenCalled();
    expect(calledArgs[0]).toEqual({ status: 'ERROR', message: 'Invalid import data: items must be an array' });
  });

  it('responds with error for oversized payload (>50000 items)', async () => {
    const sendResponse = vi.fn();
    const respPromise = new Promise<any>((resolve) => sendResponse.mockImplementation((...args: any[]) => resolve(args)));

    const items = new Array(50001).fill({ url: 'https://example.com', title: 'x', lastVisit: Date.now() });
    (globalThis as any).__chromeMocks.callOnMessage({ type: 'IMPORT_INDEX', items }, {}, sendResponse);

    const calledArgs = await respPromise;
    expect(sendResponse).toHaveBeenCalled();
    // Assert status is ERROR and message mentions the size limit
    const arg = calledArgs[0];
    expect(arg).toBeDefined();
    expect(arg.status).toBe('ERROR');
    expect(arg.message).toMatch(/exceeds limit/);
  });
});
