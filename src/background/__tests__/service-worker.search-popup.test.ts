/*
 * Skeleton tests for `service-worker` SEARCH_QUERY (popup path).
 * Created for user review before committing.
 */
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';

// Mutable mock used by tests; declare at module scope so the vi.mock
// factory can reference it (vitest hoists vi.mock calls to top).
let runSearchMock: any = vi.fn();

vi.mock('../search/search-engine', () => ({
  runSearch: (...args: any[]) => runSearchMock(...args),
  getLastAIStatus: () => ({ status: 'none' }),
}));

describe('service-worker: SEARCH_QUERY (popup)', () => {

  beforeEach(async () => {
    // Reset mock behavior for each test case.
    runSearchMock.mockReset();
    runSearchMock.mockResolvedValue([
      { id: '1', title: 'Result 1', url: 'https://example.com/1' },
    ]);

    vi.mock('../../core/logger', () => ({
      Logger: {
        init: async () => {},
        forComponent: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} }),
        getLevel: () => 'info',
        setLevel: async () => {},
      },
    }));

    // Ensure the service-worker initialization gate passes in tests.
    vi.mock('../resilience', () => ({
      ensureReady: async () => true,
      clearAndRebuild: async () => ({ success: true, itemCount: 0, message: 'ok' }),
      handleQuotaExceeded: async () => {},
    }));

    // Import after resetting modules. The global `chrome` stub from
    // `src/__test-utils__/test-setup.ts` will capture listeners; tests
    // should call `globalThis.__chromeMocks.callOnMessage()` to invoke them.
    await import('../service-worker');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });


  it('returns search results for a popup SEARCH_QUERY message', async () => {
    const sendResponse = vi.fn();
    const respPromise = new Promise((resolve) => {
      sendResponse.mockImplementation((resp: any) => resolve(resp));
    });

    (globalThis as any).__chromeMocks.callOnMessage({ type: 'SEARCH_QUERY', query: 'hello' }, {}, sendResponse);

    const resp: any = await respPromise;
    expect(runSearchMock).toHaveBeenCalledWith('hello', { skipAI: false });
    expect(resp).toHaveProperty('results');
    expect(Array.isArray(resp.results)).toBe(true);
    expect(resp.results[0]).toMatchObject({ title: 'Result 1', url: 'https://example.com/1' });
    expect(resp.query).toBe('hello');
    expect(resp.aiStatus).toEqual({ status: 'none' });
    expect(resp.skipAI).toBe(false);
  });

  it('handles runSearch errors and returns an ERROR response', async () => {
    runSearchMock.mockRejectedValue(new Error('boom'));

    const sendResponse = vi.fn();
    const respPromise = new Promise((resolve) => {
      sendResponse.mockImplementation((resp: any) => resolve(resp));
    });

    (globalThis as any).__chromeMocks.callOnMessage({ type: 'SEARCH_QUERY', query: 'hello' }, {}, sendResponse);

    const resp: any = await respPromise;
    // The top-level onMessage handler wraps many cases and will send
    // `{ error: '<message>' }` for unexpected failures in the async IIFE.
    expect(resp).toHaveProperty('error', 'boom');
  });
});
