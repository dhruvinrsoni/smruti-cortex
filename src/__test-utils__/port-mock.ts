/**
 * Chrome Port mock for testing port-based messaging (quick-search overlay).
 *
 * Usage:
 *   const port = createMockPort('quick-search');
 *   port.postMessage({ type: 'SEARCH_QUERY', query: 'test' });
 */
import { vi } from 'vitest';

export interface MockPort {
  name: string;
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onMessage: {
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    _listeners: Array<(msg: unknown) => void>;
    /** Simulate receiving a message on this port. */
    fire: (msg: unknown) => void;
  };
  onDisconnect: {
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    _listeners: Array<() => void>;
    /** Simulate port disconnect. */
    fire: () => void;
  };
}

/** Create a mock Chrome Port with event simulation. */
export function createMockPort(name = 'quick-search'): MockPort {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];

  return {
    name,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((fn: (msg: unknown) => void) => messageListeners.push(fn)),
      removeListener: vi.fn((fn: (msg: unknown) => void) => {
        const idx = messageListeners.indexOf(fn);
        if (idx >= 0) {messageListeners.splice(idx, 1);}
      }),
      _listeners: messageListeners,
      fire: (msg: unknown) => messageListeners.forEach(fn => fn(msg)),
    },
    onDisconnect: {
      addListener: vi.fn((fn: () => void) => disconnectListeners.push(fn)),
      removeListener: vi.fn((fn: () => void) => {
        const idx = disconnectListeners.indexOf(fn);
        if (idx >= 0) {disconnectListeners.splice(idx, 1);}
      }),
      _listeners: disconnectListeners,
      fire: () => disconnectListeners.forEach(fn => fn()),
    },
  };
}
