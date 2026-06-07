import { describe, it, expect, vi } from 'vitest';
import { ResourceScope, withResources } from '../resource-scope';

describe('ResourceScope', () => {
  it('disposes in reverse (LIFO) order', async () => {
    const order: number[] = [];
    const scope = new ResourceScope();
    scope.add(() => { order.push(1); });
    scope.add(() => { order.push(2); });
    scope.add(() => { order.push(3); });
    await scope.disposeAll();
    expect(order).toEqual([3, 2, 1]);
  });

  it('awaits async disposers', async () => {
    const order: string[] = [];
    const scope = new ResourceScope();
    scope.add(async () => { await new Promise(r => setTimeout(r, 5)); order.push('slow'); });
    scope.add(() => { order.push('fast'); });
    await scope.disposeAll();
    expect(order).toEqual(['fast', 'slow']);
  });

  it('swallows a disposer error without blocking the others', async () => {
    const ran: number[] = [];
    const scope = new ResourceScope();
    scope.add(() => { ran.push(1); });
    scope.add(() => { throw new Error('boom'); });
    scope.add(() => { ran.push(3); });
    await expect(scope.disposeAll()).resolves.toBeUndefined();
    expect(ran).toEqual([3, 1]); // 3 (LIFO first), throwing one swallowed, then 1
  });

  it('is idempotent — a second disposeAll is a no-op', async () => {
    const fn = vi.fn();
    const scope = new ResourceScope();
    scope.add(fn);
    await scope.disposeAll();
    await scope.disposeAll();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('use() registers a disposable and returns it', async () => {
    const disposed = vi.fn();
    const scope = new ResourceScope();
    const resource = scope.use({ value: 42, dispose: disposed });
    expect(resource.value).toBe(42);
    await scope.disposeAll();
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe('withResources', () => {
  it('returns the body result and disposes afterwards', async () => {
    const cleanup = vi.fn();
    const result = await withResources(async (scope) => {
      scope.add(cleanup);
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('runs disposers even when the body throws, and re-throws', async () => {
    const cleanup = vi.fn();
    await expect(
      withResources(async (scope) => {
        scope.add(cleanup);
        throw new Error('body failed');
      }),
    ).rejects.toThrow('body failed');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('disposes resources acquired before an early return', async () => {
    const order: string[] = [];
    await withResources(async (scope) => {
      scope.add(() => order.push('slot'));
      scope.add(() => order.push('timer'));
      return; // early return
    });
    expect(order).toEqual(['timer', 'slot']);
  });
});
