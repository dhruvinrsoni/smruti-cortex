/*
 * Skeleton tests for `service-worker` SEARCH_QUERY (popup path).
 * Created for user review before committing.
 */
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';

describe('service-worker: SEARCH_QUERY (popup)', () => {
  let runtimeListener: ((msg: any, sender: any, sendResponse: any) => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    runtimeListener = undefined;
    vi.mock('../../core/logger', () => ({
      Logger: {
        init: async () => {},
        forComponent: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {} }),
        getLevel: () => 'info',
        setLevel: async () => {},
      },
    }));

    // Import after resetting modules. The global `chrome` stub from
    // `src/__test-utils__/test-setup.ts` will capture listeners; tests
    // should call `globalThis.__chromeMocks.callOnMessage()` to invoke them.
    await import('../service-worker');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.todo('returns search results for a popup SEARCH_QUERY message');
  it.todo('handles runSearch errors and returns an ERROR response');
});
