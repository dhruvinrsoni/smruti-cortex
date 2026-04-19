import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('traced utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not call Logger.trace when tracing is disabled (sync)', async () => {
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: vi.fn(), getLevel: vi.fn(() => 0) },
      LogLevel: { TRACE: 4 },
    }));

    const { traced } = await import('../traced');
    const fn = (a: number, b: number) => a + b;
    const wrapped = traced('Comp', 'add', fn);
    expect(wrapped(1, 2)).toBe(3);

    const { Logger } = await import('../../core/logger');
    expect(Logger.trace).not.toHaveBeenCalled();
  });

  it('calls Logger.trace ENTER and EXIT for sync function when enabled', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
      LogLevel: { TRACE: 4 },
    }));

    const { traced } = await import('../traced');
    const fn = (x: number) => x * 2;
    const wrapped = traced('Comp', 'double', fn, { logResult: true });
    const out = wrapped(5);
    expect(out).toBe(10);

    expect(traceMock).toHaveBeenCalled();
    // first call should be ENTER
    expect(traceMock.mock.calls[0][0]).toBe('Comp');
    expect(traceMock.mock.calls[0][1]).toBe('double');
    expect(traceMock.mock.calls[0][2]).toBe('ENTER');
    // find an EXIT call
    const exitCall = traceMock.mock.calls.find(c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'));
    expect(exitCall).toBeDefined();
  });

  it('handles Promise-returning functions (async) and logs EXIT', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
      LogLevel: { TRACE: 4 },
    }));

    const { traced } = await import('../traced');
    const fn = async (n: number) => n + 1;
    const wrapped = traced('Comp', 'inc', fn);
    const res = await wrapped(2);
    expect(res).toBe(3);

    const enter = traceMock.mock.calls.find(c => c[2] === 'ENTER');
    const exit = traceMock.mock.calls.find(c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'));
    expect(enter).toBeDefined();
    expect(exit).toBeDefined();
  });

  it('decorator logs for class methods when enabled', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
      LogLevel: { TRACE: 4 },
    }));

    const { Traced } = await import('../traced');

    class Foo {
      @Traced({ logResult: true })
      bar(x: number) {
        return x + 2;
      }
    }

    const f = new Foo();
    expect(f.bar(3)).toBe(5);
    expect(traceMock).toHaveBeenCalled();
  });

  it('decorator does not log when disabled', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 0) },
      LogLevel: { TRACE: 4 },
    }));

    const { Traced } = await import('../traced');
    class Foo {
      @Traced()
      baz() {
        return 'ok';
      }
    }

    const f = new Foo();
    expect(f.baz()).toBe('ok');
    expect(traceMock).not.toHaveBeenCalled();
  });

  it('sync function THROW logs THROW and rethrows', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
      LogLevel: { TRACE: 4 },
    }));

    const { traced } = await import('../traced');
    const fn = () => { throw new Error('boom'); };
    const wrapped = traced('Comp', 'boom', fn);
    expect(() => wrapped()).toThrow('boom');

    const throwCall = traceMock.mock.calls.find(c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'));
    expect(throwCall).toBeDefined();
  });

  it('async reject logs THROW and rejects', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
      LogLevel: { TRACE: 4 },
    }));

    const { traced } = await import('../traced');
    const fn = async () => { throw new Error('async boom'); };
    const wrapped = traced('Comp', 'arej', fn);
    await expect(wrapped()).rejects.toThrow('async boom');

    const throwCall = traceMock.mock.calls.find(c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'));
    expect(throwCall).toBeDefined();
  });

  it('summariseArgs includes count indicator when many args', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
      LogLevel: { TRACE: 4 },
    }));

    const { traced } = await import('../traced');
    const fn = (a: any, b: any, c: any, d: any, e: any) => 'ok';
    const wrapped = traced('Comp', 'many', fn);
    wrapped(1,2,3,4,5);

    const enterCall = traceMock.mock.calls.find(c => c[2] === 'ENTER');
    expect(enterCall).toBeDefined();
    const data = enterCall![3];
    expect(data).toBeDefined();
    expect(String(data.args)).toContain('(+');
  });

  it('truncates large results when logResult true', async () => {
    const traceMock = vi.fn();
    vi.doMock('../../core/logger', () => ({
      Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
      LogLevel: { TRACE: 4 },
    }));

    const { traced } = await import('../traced');
    const big = 'a'.repeat(500);
    const fn = () => big;
    const wrapped = traced('Comp', 'big', fn, { logResult: true });
    const out = wrapped();
    expect(out).toBe(big);

    const exitCall = traceMock.mock.calls.find(c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'));
    expect(exitCall).toBeDefined();
    const data = exitCall![3];
    expect(String(data.result).length).toBeLessThan(250);
    expect(String(data.result)).toContain('…');
  });

  // =========================================================================
  // isTraceEnabled — guard & catch branches
  // =========================================================================

  describe('isTraceEnabled edge cases', () => {
    it('returns false when Logger.getLevel is not a function', async () => {
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: vi.fn(), getLevel: 'not-a-fn' },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      const fn = vi.fn(() => 42);
      expect(traced('C', 'm', fn)()).toBe(42);
      const { Logger } = await import('../../core/logger');
      expect(Logger.trace).not.toHaveBeenCalled();
    });

    it('returns false when LogLevel.TRACE is not a number', async () => {
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: vi.fn(), getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 'nope' },
      }));
      const { traced } = await import('../traced');
      expect(traced('C', 'm', () => 99)()).toBe(99);
    });

    it('catches and returns false when getLevel() throws', async () => {
      vi.doMock('../../core/logger', () => ({
        Logger: {
          trace: vi.fn(),
          getLevel: vi.fn(() => { throw new Error('broken'); }),
        },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      expect(traced('C', 'm', () => 'safe')()).toBe('safe');
    });
  });

  // =========================================================================
  // summariseArgs — truncation, stringify failures, undefined json
  // =========================================================================

  describe('summariseArgs edge cases', () => {
    it('truncates a single arg whose JSON exceeds maxPerArg', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      traced('C', 'm', (a: unknown) => a)('x'.repeat(200));
      const enterData = traceMock.mock.calls.find(c => c[2] === 'ENTER')![3];
      expect(enterData.args).toContain('…');
      expect(enterData.args.length).toBeLessThan(200);
    });

    it('falls back to String(a) when JSON.stringify throws (circular ref)', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      traced('C', 'm', (a: unknown) => 'ok')(circular);
      const enterData = traceMock.mock.calls.find(c => c[2] === 'ENTER')![3];
      expect(enterData.args).toContain('[object Object]');
    });

    it('handles undefined arg (json is undefined from stringify)', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      traced('C', 'm', (a: unknown) => a)(undefined);
      const enterCall = traceMock.mock.calls.find(c => c[2] === 'ENTER');
      expect(enterCall).toBeDefined();
      expect(enterCall![3].args).toBeDefined();
    });
  });

  // =========================================================================
  // summariseResult — undefined json, stringify failure
  // =========================================================================

  describe('summariseResult edge cases', () => {
    it('returns typeof val when JSON.stringify yields undefined (function)', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      traced('C', 'm', () => (() => {}), { logResult: true })();
      const exitData = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'),
      )![3];
      expect(exitData.result).toBe('function');
    });

    it('returns typeof val when JSON.stringify throws (circular result)', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      const circ: Record<string, unknown> = {};
      circ.self = circ;
      traced('C', 'm', () => circ, { logResult: true })();
      const exitData = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'),
      )![3];
      expect(exitData.result).toBe('object');
    });
  });

  // =========================================================================
  // @Traced() decorator — async paths, sync throw, options, Unknown fallback
  // =========================================================================

  describe('@Traced() decorator — additional paths', () => {
    it('logs ENTER/EXIT with result for async methods', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced({ logResult: true })
        async fetch() { return 'data'; }
      }
      expect(await new Svc().fetch()).toBe('data');
      const exit = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'),
      );
      expect(exit).toBeDefined();
      expect(exit![3].result).toContain('data');
    });

    it('logs THROW for async method rejection', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced()
        async fail() { throw new Error('deco-async-fail'); }
      }
      await expect(new Svc().fail()).rejects.toThrow('deco-async-fail');
      const throwCall = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'),
      );
      expect(throwCall![3].error).toBe('deco-async-fail');
    });

    it('logs THROW for sync method throw', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced()
        explode(): never { throw new Error('deco-sync-throw'); }
      }
      expect(() => new Svc().explode()).toThrow('deco-sync-throw');
      const throwCall = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'),
      );
      expect(throwCall![3].error).toBe('deco-sync-throw');
    });

    it('falls back to "Unknown" when constructor.name is absent', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Tmp {
        @Traced()
        greet() { return 'hi'; }
      }
      const method = new Tmp().greet;
      method.call(Object.create(null));
      expect(traceMock.mock.calls[0][0]).toBe('Unknown');
    });

    it('async method with default logResult omits result data', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced()
        async load() { return 'val'; }
      }
      expect(await new Svc().load()).toBe('val');
      const exit = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'),
      );
      expect(exit![3]).toBeUndefined();
    });

    it('omits args data when logArgs is false', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced({ logArgs: false })
        work(x: number) { return x; }
      }
      new Svc().work(42);
      const enterCall = traceMock.mock.calls.find(c => c[2] === 'ENTER');
      expect(enterCall![3]).toBeUndefined();
    });

    it('omits args data when called with no arguments', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced()
        ping() { return 'pong'; }
      }
      new Svc().ping();
      const enterCall = traceMock.mock.calls.find(c => c[2] === 'ENTER');
      expect(enterCall![3]).toBeUndefined();
    });
  });

  // =========================================================================
  // traced() wrapper — logArgs false, zero args, async logResult
  // =========================================================================

  describe('traced() wrapper — additional paths', () => {
    it('omits args data when logArgs is false', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      traced('C', 'm', (x: number) => x, { logArgs: false })(42);
      const enterCall = traceMock.mock.calls.find(c => c[2] === 'ENTER');
      expect(enterCall![3]).toBeUndefined();
    });

    it('omits args data when called with zero arguments', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      traced('C', 'm', () => 'ok')();
      const enterCall = traceMock.mock.calls.find(c => c[2] === 'ENTER');
      expect(enterCall![3]).toBeUndefined();
    });

    it('logs result in async EXIT when logResult is true', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      await traced('C', 'm', async () => 'async-val', { logResult: true })();
      const exitCall = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('EXIT'),
      );
      expect(exitCall![3].result).toContain('async-val');
    });
  });

  // =========================================================================
  // Non-Error thrown values — String(err) fallback in all four throw paths
  // =========================================================================

  describe('non-Error thrown values', () => {
    it('traced() sync converts non-Error throw to string', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      const wrapped = traced('C', 'm', () => { throw 'string-err'; });
      expect(() => wrapped()).toThrow('string-err');
      const throwCall = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'),
      );
      expect(throwCall![3].error).toBe('string-err');
    });

    it('traced() async converts non-Error rejection to string', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { traced } = await import('../traced');
      const wrapped = traced('C', 'm', async () => { throw 'async-str-err'; });
      await expect(wrapped()).rejects.toBe('async-str-err');
      const throwCall = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'),
      );
      expect(throwCall![3].error).toBe('async-str-err');
    });

    it('@Traced() sync converts non-Error throw to string', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced()
        boom(): never { throw 'deco-str-err'; }
      }
      expect(() => new Svc().boom()).toThrow('deco-str-err');
      const throwCall = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'),
      );
      expect(throwCall![3].error).toBe('deco-str-err');
    });

    it('@Traced() async converts non-Error rejection to string', async () => {
      const traceMock = vi.fn();
      vi.doMock('../../core/logger', () => ({
        Logger: { trace: traceMock, getLevel: vi.fn(() => 4) },
        LogLevel: { TRACE: 4 },
      }));
      const { Traced } = await import('../traced');
      class Svc {
        @Traced()
        async boom(): Promise<never> { throw 'deco-async-str'; }
      }
      await expect(new Svc().boom()).rejects.toBe('deco-async-str');
      const throwCall = traceMock.mock.calls.find(
        c => typeof c[2] === 'string' && (c[2] as string).startsWith('THROW'),
      );
      expect(throwCall![3].error).toBe('deco-async-str');
    });
  });
});
