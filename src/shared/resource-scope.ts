/**
 * Generic try-with-resources for async work — the analogue of Java's
 * try-with-resources / C#'s `using` / Python's context managers, hand-rolled
 * because the project targets ES2020 (native `using` / `Symbol.dispose` needs
 * ES2022+ lib + a polyfill).
 *
 * Register cleanup callbacks (or disposables) as you acquire resources; the
 * scope guarantees they ALL run — in reverse (LIFO) order — on every exit path
 * of `withResources`: normal return, thrown error, or abort. Disposer errors
 * are swallowed so one failing cleanup never blocks the others.
 *
 * Primary use: every Ollama interaction wraps its body in `withResources` so
 * the single-flight slot, fetch/AbortController, timeout timer, and stream
 * reader are always torn down — Ollama is never left engaged and the slot is
 * never left stuck "occupied".
 */

/** Minimal disposable shape accepted by {@link ResourceScope.use}. */
export interface Disposable {
    dispose(): void | Promise<void>;
}

export class ResourceScope {
    private disposers: Array<() => void | Promise<void>> = [];
    private disposed = false;

    /** Register a cleanup callback. Runs in LIFO order on {@link disposeAll}. */
    add(dispose: () => void | Promise<void>): void {
        this.disposers.push(dispose);
    }

    /** Register a disposable and return it for convenient inline acquisition. */
    use<T extends Disposable>(resource: T): T {
        this.disposers.push(() => resource.dispose());
        return resource;
    }

    /**
     * Run every registered disposer in reverse order, swallowing individual
     * errors. Idempotent — a second call is a no-op.
     */
    async disposeAll(): Promise<void> {
        if (this.disposed) { return; }
        this.disposed = true;
        for (let i = this.disposers.length - 1; i >= 0; i--) {
            try {
                await this.disposers[i]();
            } catch {
                /* swallow — one failed cleanup must not block the rest */
            }
        }
        this.disposers = [];
    }
}

/**
 * Run `body` with a fresh {@link ResourceScope}, guaranteeing `disposeAll()`
 * runs afterwards regardless of how `body` settles (return / throw / reject).
 * The body's result (or error) is propagated unchanged.
 */
export async function withResources<T>(body: (scope: ResourceScope) => Promise<T>): Promise<T> {
    const scope = new ResourceScope();
    try {
        return await body(scope);
    } finally {
        await scope.disposeAll();
    }
}
