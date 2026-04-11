/**
 * Shared Logger mock for all test files.
 *
 * Usage:
 *   vi.mock('../../core/logger', () => mockLogger());
 *
 * The returned object mirrors the real Logger's static + ComponentLogger API
 * so modules that call `Logger.forComponent('X').info(...)` work transparently.
 */
import { vi } from 'vitest';

function createComponentLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
}

/**
 * Returns a factory-compatible mock for `vi.mock('…/logger', () => mockLogger())`.
 * Each call returns a fresh set of spies.
 */
export function mockLogger() {
  return {
    Logger: {
      init: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      getLevel: vi.fn().mockReturnValue('INFO'),
      setLevel: vi.fn(),
      setLevelInternal: vi.fn(),
      forComponent: vi.fn(() => createComponentLogger()),
      ComponentLogger: vi.fn().mockImplementation(() => createComponentLogger()),
    },
  };
}
