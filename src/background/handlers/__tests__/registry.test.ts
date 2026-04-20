import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandlerRegistry } from '../registry';
import type { SendResponse, MessageSender } from '../registry';

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('MessageHandlerRegistry', () => {
  let registry: MessageHandlerRegistry;
  const mockSender = {} as MessageSender;
  const mockSendResponse: SendResponse = vi.fn();

  beforeEach(() => {
    registry = new MessageHandlerRegistry();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('registers a handler for a message type', () => {
      const handler = vi.fn();
      registry.register('TEST', handler);
      expect(registry.has('TEST')).toBe(true);
    });

    it('warns when overwriting an existing handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registry.register('TEST', handler1);
      registry.register('TEST', handler2);
      expect(registry.has('TEST')).toBe(true);
    });
  });

  describe('registerAll', () => {
    it('registers multiple handlers at once', () => {
      const handlers = {
        TYPE_A: vi.fn(),
        TYPE_B: vi.fn(),
        TYPE_C: vi.fn(),
      };
      registry.registerAll(handlers);
      expect(registry.has('TYPE_A')).toBe(true);
      expect(registry.has('TYPE_B')).toBe(true);
      expect(registry.has('TYPE_C')).toBe(true);
      expect(registry.size).toBe(3);
    });
  });

  describe('has', () => {
    it('returns false for unregistered type', () => {
      expect(registry.has('UNKNOWN')).toBe(false);
    });

    it('returns true for registered type', () => {
      registry.register('KNOWN', vi.fn());
      expect(registry.has('KNOWN')).toBe(true);
    });
  });

  describe('dispatch', () => {
    it('dispatches to the correct handler and returns true', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      registry.register('ACTION', handler);

      const msg = { type: 'ACTION', payload: 'data' };
      const result = await registry.dispatch(msg, mockSender, mockSendResponse);

      expect(result).toBe(true);
      expect(handler).toHaveBeenCalledWith(msg, mockSender, mockSendResponse);
    });

    it('returns false for unknown message type', async () => {
      const result = await registry.dispatch(
        { type: 'NONEXISTENT' },
        mockSender,
        mockSendResponse,
      );
      expect(result).toBe(false);
    });

    it('propagates handler errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
      registry.register('FAIL', handler);

      await expect(
        registry.dispatch({ type: 'FAIL' }, mockSender, mockSendResponse),
      ).rejects.toThrow('handler failed');
    });
  });

  describe('registeredTypes', () => {
    it('returns empty array when no handlers registered', () => {
      expect(registry.registeredTypes).toEqual([]);
    });

    it('returns all registered type names', () => {
      registry.register('ALPHA', vi.fn());
      registry.register('BETA', vi.fn());
      expect(registry.registeredTypes).toEqual(
        expect.arrayContaining(['ALPHA', 'BETA']),
      );
      expect(registry.registeredTypes).toHaveLength(2);
    });
  });

  describe('size', () => {
    it('returns 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('reflects the number of registered handlers', () => {
      registry.register('A', vi.fn());
      registry.register('B', vi.fn());
      expect(registry.size).toBe(2);
    });
  });
});
