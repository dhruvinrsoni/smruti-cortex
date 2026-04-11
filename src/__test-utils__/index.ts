/**
 * SmrutiCortex Test Utilities
 *
 * Shared, DRY test infrastructure for all test files.
 * Import what you need:
 *
 *   import { mockLogger, mockSettings, chromeMock, makeItem } from '../__test-utils__';
 */

export { mockLogger } from './logger-mock';
export { mockSettings } from './settings-mock';
export { chromeMock, noOp, proxied } from './chrome-mock';
export { makeItem, makeResult, makeResultEntry, makeSnapshot } from './factories';
export { useCleanSlate } from './lifecycle';
export { createMockPort, type MockPort } from './port-mock';
