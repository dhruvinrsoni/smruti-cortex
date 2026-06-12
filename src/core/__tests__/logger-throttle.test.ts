import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, __resetThrottleState } from '../logger';

// Exercises the REAL ComponentLogger.throttled (no logger mock) with fake time.
describe('ComponentLogger.throttled', () => {
  beforeEach(() => {
    __resetThrottleState();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('emits the first call and drops repeats within the window', () => {
    const logger = Logger.forComponent('ThrottleComp');
    const debugSpy = vi.spyOn(logger, 'debug');

    logger.throttled('progress', 'debug', 'run', 'first', 1000);
    expect(debugSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(500);
    logger.throttled('progress', 'debug', 'run', 'dropped', 1000);
    expect(debugSpy).toHaveBeenCalledTimes(1); // within window → dropped

    vi.setSystemTime(1000);
    logger.throttled('progress', 'debug', 'run', 'after', 1000);
    expect(debugSpy).toHaveBeenCalledTimes(2); // window elapsed → emits
  });

  it('treats distinct keys independently', () => {
    const logger = Logger.forComponent('ThrottleComp');
    const debugSpy = vi.spyOn(logger, 'debug');
    logger.throttled('a', 'debug', 'run', 'x', 1000);
    logger.throttled('b', 'debug', 'run', 'y', 1000);
    expect(debugSpy).toHaveBeenCalledTimes(2);
  });

  it('shares one window across loggers of the same component', () => {
    const l1 = Logger.forComponent('SameComp');
    const l2 = Logger.forComponent('SameComp');
    const s1 = vi.spyOn(l1, 'debug');
    const s2 = vi.spyOn(l2, 'debug');
    l1.throttled('k', 'debug', 'run', '1', 1000);
    l2.throttled('k', 'debug', 'run', '2', 1000); // same component:key → dropped
    expect(s1).toHaveBeenCalledTimes(1);
    expect(s2).toHaveBeenCalledTimes(0);
  });

  it('forwards the chosen level, method, message and data', () => {
    const logger = Logger.forComponent('LevelComp');
    const warnSpy = vi.spyOn(logger, 'warn');
    logger.throttled('k', 'warn', 'method', 'msg', 1000, { a: 1 });
    expect(warnSpy).toHaveBeenCalledWith('method', 'msg', { a: 1 });
  });

  it('__resetThrottleState clears windows so the next call emits', () => {
    const logger = Logger.forComponent('ResetComp');
    const debugSpy = vi.spyOn(logger, 'debug');
    logger.throttled('k', 'debug', 'run', '1', 10_000);
    logger.throttled('k', 'debug', 'run', '2', 10_000); // dropped
    expect(debugSpy).toHaveBeenCalledTimes(1);
    __resetThrottleState();
    logger.throttled('k', 'debug', 'run', '3', 10_000); // emits again
    expect(debugSpy).toHaveBeenCalledTimes(2);
  });
});
