import { describe, it, expect, vi } from 'vitest';
import {
  UNDO_WINDOW_MS,
  DESTRUCTIVE_OPS,
  describeOp,
  isSnapshotRestorable,
  runWithUndo,
} from '../safety-utils';

describe('safety-utils — op registry', () => {
  it('UNDO_WINDOW_MS is a sane window', () => {
    expect(UNDO_WINDOW_MS).toBeGreaterThanOrEqual(5000);
  });

  it('clear and factoryReset are defined, undoable, and have consequences', () => {
    for (const id of ['clear', 'factoryReset'] as const) {
      const op = describeOp(id);
      expect(op.id).toBe(id);
      expect(op.undoable).toBe(true);
      expect(op.consequences.length).toBeGreaterThan(0);
      expect(op.confirmLabel.length).toBeGreaterThan(0);
    }
    expect(Object.keys(DESTRUCTIVE_OPS)).toEqual(['clear', 'factoryReset']);
  });

  it('isSnapshotRestorable accepts arrays only', () => {
    expect(isSnapshotRestorable([])).toBe(true);
    expect(isSnapshotRestorable([1, 2])).toBe(true);
    expect(isSnapshotRestorable(null)).toBe(false);
    expect(isSnapshotRestorable({})).toBe(false);
    expect(isSnapshotRestorable(undefined)).toBe(false);
  });
});

describe('safety-utils — runWithUndo', () => {
  it('snapshots before running, then offers undo on success', async () => {
    const order: string[] = [];
    const snap = ['a'];
    const restore = vi.fn().mockResolvedValue(undefined);
    let undoFn: (() => void) | null = null;

    const ok = await runWithUndo<string[]>({
      snapshot: async () => { order.push('snapshot'); return snap; },
      run: async () => { order.push('run'); return true; },
      restore,
      offerUndo: (undo) => { order.push('offer'); undoFn = undo; },
    });

    expect(ok).toBe(true);
    expect(order).toEqual(['snapshot', 'run', 'offer']);
    expect(restore).not.toHaveBeenCalled();
    undoFn?.();
    expect(restore).toHaveBeenCalledWith(snap);
  });

  it('does not offer undo when the op fails', async () => {
    const offerUndo = vi.fn();
    const ok = await runWithUndo<string[]>({
      snapshot: async () => ['x'],
      run: async () => false,
      restore: vi.fn(),
      offerUndo,
    });
    expect(ok).toBe(false);
    expect(offerUndo).not.toHaveBeenCalled();
  });

  it('does not offer undo when no snapshot could be captured', async () => {
    const offerUndo = vi.fn();
    const ok = await runWithUndo<string[]>({
      snapshot: async () => null,
      run: async () => true,
      restore: vi.fn(),
      offerUndo,
    });
    expect(ok).toBe(true);
    expect(offerUndo).not.toHaveBeenCalled();
  });

  it('treats a thrown snapshot as no-snapshot (op still runs, no undo offered)', async () => {
    const offerUndo = vi.fn();
    const run = vi.fn(async () => true);
    const ok = await runWithUndo<string[]>({
      snapshot: async () => { throw new Error('export failed'); },
      run,
      restore: vi.fn(),
      offerUndo,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);
    expect(offerUndo).not.toHaveBeenCalled();
  });
});
