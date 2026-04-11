/**
 * Shared test lifecycle helpers.
 *
 * Usage:
 *   import { useCleanSlate } from '../__test-utils__';
 *   useCleanSlate();  // registers beforeEach + afterEach
 */
import { beforeEach, afterEach, vi } from 'vitest';

/**
 * Registers beforeEach/afterEach hooks that clear all mocks and restore globals.
 * Call at the top level of your test file (outside `describe`).
 */
export function useCleanSlate(options: { resetModules?: boolean } = {}) {
  beforeEach(() => {
    vi.clearAllMocks();
    if (options.resetModules) {
      vi.resetModules();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
}
