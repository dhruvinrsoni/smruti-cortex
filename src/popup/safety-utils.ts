// safety-utils.ts — pure helpers for the destructive-op guardrails (confirm + undo).
//
// No DOM, no chrome — just the op registry, copy, and the undo orchestration. The
// DOM (styled dialog + undo toast) lives in confirm-undo.ts; the wiring lives in
// popup.ts. Keeping this pure makes the safety logic fully unit-testable.

/** How long the "Undo" affordance stays available after a destructive op. */
export const UNDO_WINDOW_MS = 10_000;

export type DestructiveOpId = 'clear' | 'factoryReset';

export interface DestructiveOp {
  id: DestructiveOpId;
  title: string;
  /** Plain-language bullet list of what will happen. */
  consequences: string[];
  /** Label for the confirm button. */
  confirmLabel: string;
  /** Whether an index snapshot → undo is meaningful for this op. */
  undoable: boolean;
}

export const DESTRUCTIVE_OPS: Record<DestructiveOpId, DestructiveOp> = {
  clear: {
    id: 'clear',
    title: 'Clear index and rebuild?',
    consequences: [
      'Deletes your browsing-history index',
      'Immediately rebuilds it from browser history',
      'Your settings are NOT changed',
    ],
    confirmLabel: 'Clear & rebuild',
    undoable: true,
  },
  factoryReset: {
    id: 'factoryReset',
    title: 'Factory reset the extension?',
    consequences: [
      'Resets ALL settings to defaults',
      'Clears ALL indexed data and caches',
      'Rebuilds the index from your browser history',
    ],
    confirmLabel: 'Factory reset',
    undoable: true,
  },
};

export function describeOp(id: DestructiveOpId): DestructiveOp {
  return DESTRUCTIVE_OPS[id];
}

/** A snapshot is restorable only if it is a (possibly empty) array of items. */
export function isSnapshotRestorable(items: unknown): items is unknown[] {
  return Array.isArray(items);
}

export interface UndoableDeps<T> {
  /** Capture state before the op. Return null if a snapshot can't be taken. */
  snapshot: () => Promise<T | null>;
  /** Perform the destructive op. Resolve true on success. */
  run: () => Promise<boolean>;
  /** Restore a previously-captured snapshot (the undo action). */
  restore: (snap: T) => Promise<void>;
  /** Present the undo affordance to the user (e.g. a toast with an Undo button). */
  offerUndo: (undo: () => void) => void;
}

/**
 * Snapshot → run → offer undo. The undo affordance is only offered when the op
 * succeeded AND a snapshot was captured (otherwise there is nothing safe to undo).
 * A failing snapshot never blocks the op — recovery is best-effort.
 *
 * @returns whatever `run()` resolved (success boolean).
 */
export async function runWithUndo<T>(deps: UndoableDeps<T>): Promise<boolean> {
  let snap: T | null = null;
  try {
    snap = await deps.snapshot();
  } catch {
    snap = null;
  }

  const ok = await deps.run();

  if (ok && snap !== null) {
    const captured = snap;
    deps.offerUndo(() => {
      void deps.restore(captured);
    });
  }
  return ok;
}
