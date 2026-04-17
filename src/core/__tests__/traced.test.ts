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
});
