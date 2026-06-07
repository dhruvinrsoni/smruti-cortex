import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';
import { createMockPort, type MockPort } from '../../__test-utils__/port-mock';

vi.mock('../../core/logger', () => mockLogger());

import { handleAnswerPort, mapAnswerError } from '../lifecycle/answer-stream-port';
import type { AnswerProvider, AnswerStreamOptions, AnswerStreamResult } from '../../shared/answer-prompt';

const flush = () => new Promise<void>(r => setTimeout(r, 50));

function provider(streamAnswer: AnswerProvider['streamAnswer']): AnswerProvider {
  return { id: 'fake', isAvailable: async () => true, streamAnswer };
}

/** Filter the port's postMessage calls to those of a given frame type. */
function frames(port: MockPort, type: string): Array<Record<string, unknown>> {
  return port.postMessage.mock.calls
    .map(c => c[0] as Record<string, unknown>)
    .filter(m => m.type === type);
}

describe('mapAnswerError', () => {
  it.each([
    ['Circuit breaker open — too many recent failures', 'circuit-open'],
    ['Another Ollama request in progress — try again shortly', 'busy'],
    ['Memory pressure: 600MB used (limit: 512MB)', 'busy'],
    ['Empty prompt', 'empty'],
    ["Model 'llama3.2:3b' not found. Available: ...", 'model-missing'],
    ['fetch failed', 'unavailable'],
    [undefined, 'unavailable'],
  ])('maps "%s" → %s', (input, expected) => {
    expect(mapAnswerError(input as string | undefined)).toBe(expected);
  });
});

describe('handleAnswerPort', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('streams ANSWER_TOKEN frames then ANSWER_DONE on success', async () => {
    const port = createMockPort('ai-answer');
    handleAnswerPort(port as unknown as chrome.runtime.Port, provider(async (_p, opts) => {
      opts.onToken('Hel');
      opts.onToken('lo');
      return { text: 'Hello', success: true, durationMs: 1 } as AnswerStreamResult;
    }));

    port.onMessage.fire({ type: 'ANSWER_START', requestId: 1, terms: 'hi' });
    await flush();

    expect(frames(port, 'ANSWER_TOKEN').map(f => f.token)).toEqual(['Hel', 'lo']);
    expect(frames(port, 'ANSWER_DONE')).toHaveLength(1);
    expect(frames(port, 'ANSWER_DONE')[0].requestId).toBe(1);
  });

  it('emits ANSWER_ERROR with a mapped reason on failure', async () => {
    const port = createMockPort('ai-answer');
    handleAnswerPort(port as unknown as chrome.runtime.Port, provider(async () => (
      { text: '', success: false, durationMs: 1, error: 'Circuit breaker open' }
    )));

    port.onMessage.fire({ type: 'ANSWER_START', requestId: 7, terms: 'hi' });
    await flush();

    const errs = frames(port, 'ANSWER_ERROR');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ requestId: 7, reason: 'circuit-open' });
  });

  it('reports "warming" when an abort was not user-initiated (timeout, model warming up)', async () => {
    const port = createMockPort('ai-answer');
    handleAnswerPort(port as unknown as chrome.runtime.Port, provider(async () => (
      { text: '', success: false, durationMs: 1, aborted: true }
    )));

    port.onMessage.fire({ type: 'ANSWER_START', requestId: 2, terms: 'hi' });
    await flush();

    expect(frames(port, 'ANSWER_ERROR')[0]).toMatchObject({ reason: 'warming' });
  });

  it('stays silent after ANSWER_CANCEL (no DONE/ERROR)', async () => {
    const port = createMockPort('ai-answer');
    let seenSignal: AbortSignal | undefined;
    handleAnswerPort(port as unknown as chrome.runtime.Port, provider(async (_p, opts: AnswerStreamOptions) => {
      seenSignal = opts.abortSignal;
      opts.onToken('partial');
      await new Promise(r => setTimeout(r, 20));
      return { text: 'partial', success: false, aborted: true, durationMs: 1 };
    }));

    port.onMessage.fire({ type: 'ANSWER_START', requestId: 3, terms: 'hi' });
    port.onMessage.fire({ type: 'ANSWER_CANCEL', requestId: 3 });
    await flush();

    expect(seenSignal?.aborted).toBe(true);
    expect(frames(port, 'ANSWER_TOKEN').map(f => f.token)).toEqual(['partial']);
    expect(frames(port, 'ANSWER_DONE')).toHaveLength(0);
    expect(frames(port, 'ANSWER_ERROR')).toHaveLength(0);
  });

  it('aborts the in-flight request on port disconnect', async () => {
    const port = createMockPort('ai-answer');
    let seenSignal: AbortSignal | undefined;
    handleAnswerPort(port as unknown as chrome.runtime.Port, provider(async (_p, opts) => {
      seenSignal = opts.abortSignal;
      await new Promise(r => setTimeout(r, 20));
      return { text: '', success: true, durationMs: 1 };
    }));

    port.onMessage.fire({ type: 'ANSWER_START', requestId: 4, terms: 'hi' });
    port.onDisconnect.fire();
    await flush();

    expect(seenSignal?.aborted).toBe(true);
  });

  it('supersedes an earlier in-flight request when a new START arrives', async () => {
    const port = createMockPort('ai-answer');
    const signals: AbortSignal[] = [];
    handleAnswerPort(port as unknown as chrome.runtime.Port, provider(async (_p, opts) => {
      if (opts.abortSignal) { signals.push(opts.abortSignal); }
      await new Promise(r => setTimeout(r, 20));
      return { text: 'x', success: !opts.abortSignal?.aborted, aborted: opts.abortSignal?.aborted, durationMs: 1 };
    }));

    port.onMessage.fire({ type: 'ANSWER_START', requestId: 10, terms: 'first' });
    port.onMessage.fire({ type: 'ANSWER_START', requestId: 11, terms: 'second' });
    await flush();

    expect(signals[0]?.aborted).toBe(true);   // first was superseded/aborted
    expect(signals[1]?.aborted).toBe(false);  // second ran to completion
    expect(frames(port, 'ANSWER_DONE')).toHaveLength(1);
    expect(frames(port, 'ANSWER_DONE')[0].requestId).toBe(11);
  });

  it('ignores frames without a numeric requestId', async () => {
    const port = createMockPort('ai-answer');
    const streamAnswer = vi.fn(async () => ({ text: '', success: true, durationMs: 1 }));
    handleAnswerPort(port as unknown as chrome.runtime.Port, provider(streamAnswer));

    port.onMessage.fire({ type: 'ANSWER_START', terms: 'hi' });
    await flush();

    expect(streamAnswer).not.toHaveBeenCalled();
  });
});
