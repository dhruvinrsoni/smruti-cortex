import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

vi.mock('../../core/logger', () => mockLogger());

import { acquireOllamaSlot, releaseOllamaSlot, acquireOllamaSlotAsync } from '../ollama-service';

// The single-flight semaphore is module-global; each test balances its own
// acquire/release, and afterEach drains defensively (release on an empty slot is a no-op).
describe('Ollama slot — foreground-priority acquire', () => {
  afterEach(() => {
    releaseOllamaSlot();
    releaseOllamaSlot();
  });

  it('acquires instantly when the slot is free', async () => {
    expect(await acquireOllamaSlotAsync(0)).toBe(true);
    releaseOllamaSlot();
  });

  it('fails instantly (waitMs=0) when the slot is busy', async () => {
    expect(acquireOllamaSlot()).toBe(true); // occupy
    expect(await acquireOllamaSlotAsync(0)).toBe(false);
    releaseOllamaSlot();
  });

  it('waits and acquires once the slot is released within the window', async () => {
    expect(acquireOllamaSlot()).toBe(true); // background holds it
    const pending = acquireOllamaSlotAsync(1000); // foreground waits
    setTimeout(() => releaseOllamaSlot(), 30); // background yields
    expect(await pending).toBe(true);
    releaseOllamaSlot();
  });

  it('times out and returns false when nothing releases', async () => {
    expect(acquireOllamaSlot()).toBe(true);
    expect(await acquireOllamaSlotAsync(60)).toBe(false);
    releaseOllamaSlot();
  });

  it('returns false promptly when the abort signal fires while waiting', async () => {
    expect(acquireOllamaSlot()).toBe(true);
    const ac = new AbortController();
    const pending = acquireOllamaSlotAsync(5000, ac.signal);
    ac.abort();
    expect(await pending).toBe(false);
    releaseOllamaSlot();
  });

  it('returns false when the signal is already aborted', async () => {
    expect(acquireOllamaSlot()).toBe(true);
    const ac = new AbortController();
    ac.abort();
    expect(await acquireOllamaSlotAsync(5000, ac.signal)).toBe(false);
    releaseOllamaSlot();
  });

  it('does not leak waiters: after a timed-out wait, a fresh acquire still works', async () => {
    expect(acquireOllamaSlot()).toBe(true);
    expect(await acquireOllamaSlotAsync(40)).toBe(false); // times out, cleans up its waiter
    releaseOllamaSlot(); // free the slot
    expect(acquireOllamaSlot()).toBe(true); // slot is acquirable again, no stale waiter grabbed it
    releaseOllamaSlot();
  });
});
