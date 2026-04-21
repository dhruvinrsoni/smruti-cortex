/**
 * Unit tests for the shared wake-safe sendMessage helper.
 *
 * Covers: bfcache tolerance, timeout handling, retries-on-lastError,
 * no-runtime fallback, custom retry schedules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntime, sendMessageWithRetry } from '../runtime-messaging';

interface TestRuntime {
  sendMessage: ReturnType<typeof vi.fn>;
  lastError: { message?: string } | null;
}

function installChrome(runtime: TestRuntime | null): void {
  (globalThis as unknown as { chrome?: { runtime: TestRuntime | null } }).chrome =
    runtime ? { runtime } : undefined;
}

function removeChrome(): void {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  delete (globalThis as unknown as { browser?: unknown }).browser;
}

function createRuntime(): TestRuntime {
  return {
    sendMessage: vi.fn(),
    lastError: null,
  };
}

describe('runtime-messaging', () => {
  beforeEach(() => { removeChrome(); });
  afterEach(() => {
    removeChrome();
    vi.useRealTimers();
  });

  describe('getRuntime', () => {
    it('returns chrome.runtime when available', () => {
      const r = createRuntime();
      installChrome(r);
      expect(getRuntime()).toBe(r);
    });

    it('falls back to browser.runtime when chrome is absent', () => {
      const r = createRuntime();
      (globalThis as unknown as { browser: { runtime: TestRuntime } }).browser = { runtime: r };
      expect(getRuntime()).toBe(r);
    });

    it('returns null when neither runtime is available', () => {
      expect(getRuntime()).toBeNull();
    });
  });

  describe('sendMessageWithRetry', () => {
    it('resolves with the response when SW replies', async () => {
      const r = createRuntime();
      r.sendMessage.mockImplementation((_msg, cb) => cb({ ok: true, value: 42 }));
      installChrome(r);
      await expect(sendMessageWithRetry({ type: 'PING' })).resolves.toEqual({
        ok: true,
        value: 42,
      });
      expect(r.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('returns empty object when no runtime is available', async () => {
      await expect(sendMessageWithRetry({ type: 'PING' })).resolves.toEqual({});
    });

    it('rejects when lastError is set and response is absent', async () => {
      const r = createRuntime();
      r.sendMessage.mockImplementation((_msg, cb) => {
        r.lastError = { message: 'port closed' };
        cb(undefined);
      });
      installChrome(r);
      await expect(sendMessageWithRetry({ type: 'PING' })).rejects.toThrow('port closed');
    });

    it('tolerates bfcache lastError when a response is present', async () => {
      const r = createRuntime();
      r.sendMessage.mockImplementation((_msg, cb) => {
        r.lastError = { message: 'The message port closed before a response was received.' };
        cb({ results: [{ id: 'x' }] });
      });
      installChrome(r);
      await expect(sendMessageWithRetry({ type: 'SEARCH_QUERY' })).resolves.toEqual({
        results: [{ id: 'x' }],
      });
    });

    it('retries with constant delay and eventually succeeds', async () => {
      vi.useFakeTimers();
      const r = createRuntime();
      let calls = 0;
      r.sendMessage.mockImplementation((_msg, cb) => {
        calls++;
        if (calls < 3) {
          r.lastError = { message: 'transient' };
          cb(undefined);
        } else {
          r.lastError = null;
          cb({ ok: true });
        }
      });
      installChrome(r);
      const promise = sendMessageWithRetry({ type: 'PING' }, { retries: 3, retryDelayMs: 50 });
      await vi.advanceTimersByTimeAsync(200);
      await expect(promise).resolves.toEqual({ ok: true });
      expect(r.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('uses per-attempt delay schedule when retryDelayMs is an array', async () => {
      vi.useFakeTimers();
      const r = createRuntime();
      const attemptTimes: number[] = [];
      const start = Date.now();
      r.sendMessage.mockImplementation((_msg, cb) => {
        attemptTimes.push(Date.now() - start);
        r.lastError = { message: 'fail' };
        cb(undefined);
      });
      installChrome(r);
      const promise = sendMessageWithRetry(
        { type: 'PING' },
        { retries: 3, retryDelayMs: [100, 200, 400] },
      ).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(1_000);
      await promise;
      expect(r.sendMessage).toHaveBeenCalledTimes(4);
      // First call immediate, then cumulative delays 100, 100+200, 100+200+400.
      expect(attemptTimes[0]).toBe(0);
      expect(attemptTimes[1]).toBe(100);
      expect(attemptTimes[2]).toBe(300);
      expect(attemptTimes[3]).toBe(700);
    });

    it('reuses last schedule entry when retries exceed array length', async () => {
      vi.useFakeTimers();
      const r = createRuntime();
      r.sendMessage.mockImplementation((_msg, cb) => {
        r.lastError = { message: 'fail' };
        cb(undefined);
      });
      installChrome(r);
      const promise = sendMessageWithRetry(
        { type: 'PING' },
        { retries: 5, retryDelayMs: [10, 20] },
      ).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(500);
      await promise;
      expect(r.sendMessage).toHaveBeenCalledTimes(6);
    });

    it('rejects with a timeout error when SW never responds', async () => {
      vi.useFakeTimers();
      const r = createRuntime();
      r.sendMessage.mockImplementation(() => { /* never calls cb */ });
      installChrome(r);
      const promise = sendMessageWithRetry(
        { type: 'PING' },
        { timeoutMs: 1000 },
      );
      const caught = promise.catch((e) => e as Error);
      await vi.advanceTimersByTimeAsync(1_100);
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/timed out after 1000ms/);
    });

    it('retries on timeout when retries > 0', async () => {
      vi.useFakeTimers();
      const r = createRuntime();
      let calls = 0;
      r.sendMessage.mockImplementation((_msg, cb) => {
        calls++;
        if (calls < 2) {return;}
        cb({ ok: true });
      });
      installChrome(r);
      const promise = sendMessageWithRetry(
        { type: 'PING' },
        { timeoutMs: 100, retries: 1, retryDelayMs: 10 },
      );
      await vi.advanceTimersByTimeAsync(500);
      await expect(promise).resolves.toEqual({ ok: true });
      expect(r.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('rejects when the runtime synchronously throws', async () => {
      const r = createRuntime();
      r.sendMessage.mockImplementation(() => { throw new Error('ctx invalid'); });
      installChrome(r);
      await expect(sendMessageWithRetry({ type: 'PING' })).rejects.toThrow('ctx invalid');
    });

    it('defaults to no retry and no timeout', async () => {
      const r = createRuntime();
      r.sendMessage.mockImplementation((_msg, cb) => {
        r.lastError = { message: 'boom' };
        cb(undefined);
      });
      installChrome(r);
      await expect(sendMessageWithRetry({ type: 'PING' })).rejects.toThrow('boom');
      expect(r.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
