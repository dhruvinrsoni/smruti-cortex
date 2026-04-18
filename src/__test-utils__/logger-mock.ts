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
    // Mirror the real implementation so callsites using errorMeta(err) inside
    // mocked modules still get a JSON-friendly { name, message, code? } shape.
    errorMeta: (err: unknown) => {
      if (err instanceof Error) {
        const meta: { name: string; message: string; code?: string | number } = {
          name: err.name,
          message: err.message,
        };
        const code = (err as Error & { code?: string | number }).code;
        if (code !== undefined) {
          meta.code = code;
        }
        return meta;
      }
      if (err && typeof err === 'object') {
        const anyErr = err as { name?: unknown; message?: unknown; code?: unknown };
        return {
          name: typeof anyErr.name === 'string' ? anyErr.name : 'non-Error',
          message: typeof anyErr.message === 'string' ? anyErr.message : String(err),
          ...(typeof anyErr.code === 'string' || typeof anyErr.code === 'number'
            ? { code: anyErr.code }
            : {}),
        };
      }
      return { name: 'non-Error', message: String(err) };
    },
  };
}
