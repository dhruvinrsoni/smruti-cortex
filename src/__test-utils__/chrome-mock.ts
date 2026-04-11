/**
 * Composable Chrome API mock builder.
 *
 * Usage:
 *   vi.stubGlobal('chrome', chromeMock().withRuntime().withStorage().build());
 *   vi.stubGlobal('chrome', chromeMock().withProxy().build());  // catch-all
 */
import { vi } from 'vitest';

interface ChromeMockObj {
  [key: string]: unknown;
}

/**
 * Deep no-op proxy: any property chain returns a callable no-op.
 * Prevents TypeError on missing `.addListener` / nested chains.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function noOp(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy(function () {} as any, {
    get: () => noOp(),
    apply: () => undefined,
  });
}

/**
 * Wraps an explicit mock so any unspecified property returns noOp().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function proxied(obj: Record<string, any>): any {
  return new Proxy(obj, {
    get: (target, prop) =>
      prop in target ? target[prop as string] : noOp(),
  });
}

class ChromeMockBuilder {
  private obj: ChromeMockObj = {};
  private useProxy = false;

  /** Add chrome.runtime with common methods. */
  withRuntime(overrides: Record<string, unknown> = {}) {
    this.obj.runtime = {
      id: 'mock-extension-id',
      getManifest: vi.fn(() => ({
        name: 'SmrutiCortex',
        version: '8.1.0',
        manifest_version: 3,
      })),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onConnect: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      lastError: null,
      getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
      ...overrides,
    };
    return this;
  }

  /** Add chrome.storage.local with promise-based get/set/remove. */
  withStorage(overrides: Record<string, unknown> = {}) {
    this.obj.storage = {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      },
    };
    return this;
  }

  /** Add chrome.tabs with common methods. */
  withTabs(overrides: Record<string, unknown> = {}) {
    this.obj.tabs = {
      create: vi.fn(),
      update: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
      get: vi.fn(),
      ...overrides,
    };
    return this;
  }

  /** Add chrome.history with search. */
  withHistory(overrides: Record<string, unknown> = {}) {
    this.obj.history = {
      search: vi.fn(),
      ...overrides,
    };
    return this;
  }

  /** Wrap the entire object in a deep proxy so unknown paths don't throw. */
  withProxy() {
    this.useProxy = true;
    return this;
  }

  /** Merge custom properties. */
  with(extra: Record<string, unknown>) {
    Object.assign(this.obj, extra);
    return this;
  }

  /** Build the final mock object. */
  build(): ChromeMockObj {
    return this.useProxy ? proxied(this.obj) : this.obj;
  }
}

/** Create a new ChromeMockBuilder instance. */
export function chromeMock() {
  return new ChromeMockBuilder();
}

export { noOp, proxied };
