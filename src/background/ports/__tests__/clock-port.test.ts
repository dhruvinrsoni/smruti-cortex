import { describe, it, expect, vi } from 'vitest';
import { SystemClock } from '../clock-port';
import type { IClockPort } from '../clock-port';

describe('SystemClock', () => {
  it('implements IClockPort', () => {
    const clock: IClockPort = SystemClock;
    expect(clock.now).toBeTypeOf('function');
    expect(clock.setTimeout).toBeTypeOf('function');
    expect(clock.clearTimeout).toBeTypeOf('function');
  });

  it('now() returns current timestamp', () => {
    const before = Date.now();
    const result = SystemClock.now();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('setTimeout schedules a callback', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    SystemClock.setTimeout(callback, 100);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('clearTimeout cancels a scheduled callback', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const id = SystemClock.setTimeout(callback, 100);
    SystemClock.clearTimeout(id);
    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
