// traced.ts — AOP-inspired function enter/exit tracing
//
// Provides two mechanisms for automatic TRACE-level logging of function
// lifecycle (ENTER / EXIT / THROW) with duration measurement:
//
//   1. @Traced()          — decorator for class methods
//   2. traced(c, m, fn)   — wrapper for standalone / exported functions
//
// Both are gated behind LogLevel.TRACE. When the current log level is
// below TRACE the original function executes with zero overhead — no
// timestamp capture, no string formatting, no logger call.
//
// Output follows the existing Spring Boot-style format:
//   2026-04-14T10:30:00.123 [TRACE] [Component.method] - ENTER | data={...}
//   2026-04-14T10:30:00.456 [TRACE] [Component.method] - EXIT (333ms)
//   2026-04-14T10:30:00.456 [TRACE] [Component.method] - THROW (12ms) | data={...}
//
// API contract: stable. Extend via TracedOptions — never remove fields.

import { Logger, LogLevel } from './logger';

// ---------------------------------------------------------------------------
// Public API — options
// ---------------------------------------------------------------------------

export interface TracedOptions {
    /** Log a truncated summary of arguments on ENTER (default: true). */
    logArgs?: boolean;
    /** Log a summary of the return value on EXIT (default: false). */
    logResult?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isTraceEnabled(): boolean {
    try {
        return typeof Logger?.getLevel === 'function'
            && typeof LogLevel?.TRACE === 'number'
            && Logger.getLevel() >= LogLevel.TRACE;
    } catch {
        return false;
    }
}

function summariseArgs(args: unknown[], maxPerArg = 100, maxArgs = 3): string {
    const sliced = args.slice(0, maxArgs);
    const parts = sliced.map(a => {
        try {
            const json = JSON.stringify(a);
            return json && json.length > maxPerArg ? json.substring(0, maxPerArg) + '\u2026' : json;
        } catch {
            return String(a);
        }
    });
    if (args.length > maxArgs) {
        parts.push(`\u2026(+${args.length - maxArgs})`);
    }
    return `[${parts.join(',')}]`;
}

function summariseResult(val: unknown, max = 200): string {
    try {
        const json = JSON.stringify(val);
        if (json === undefined) { return typeof val; }
        return json.length > max ? json.substring(0, max) + '\u2026' : json;
    } catch {
        return typeof val;
    }
}

// ---------------------------------------------------------------------------
// @Traced() — Method decorator for classes
// ---------------------------------------------------------------------------

/**
 * Class-method decorator that logs ENTER / EXIT / THROW at TRACE level.
 *
 * Usage:
 *   class Foo {
 *       \@Traced()
 *       async bar(x: number): Promise<string> { ... }
 *   }
 *
 * The component name is derived from `constructor.name` at call time.
 */
export function Traced(options?: TracedOptions): MethodDecorator {
    const logArgs = options?.logArgs ?? true;
    const logResult = options?.logResult ?? false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (_target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): void {
        const methodName = String(propertyKey);
        const original = descriptor.value;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        descriptor.value = function (this: any, ...args: any[]) {
            if (!isTraceEnabled()) {
                return original.apply(this, args);
            }

            const component = this?.constructor?.name ?? 'Unknown';
            const enterData = logArgs && args.length > 0
                ? { args: summariseArgs(args) }
                : undefined;

            Logger.trace(component, methodName, 'ENTER', enterData);
            const t0 = performance.now();

            let result: unknown;
            try {
                result = original.apply(this, args);
            } catch (err) {
                const ms = (performance.now() - t0).toFixed(1);
                const errMsg = err instanceof Error ? err.message : String(err);
                Logger.trace(component, methodName, `THROW (${ms}ms)`, { error: errMsg });
                throw err;
            }

            if (result instanceof Promise) {
                return result.then(
                    (val: unknown) => {
                        const ms = (performance.now() - t0).toFixed(1);
                        const exitData = logResult ? { result: summariseResult(val) } : undefined;
                        Logger.trace(component, methodName, `EXIT (${ms}ms)`, exitData);
                        return val;
                    },
                    (err: unknown) => {
                        const ms = (performance.now() - t0).toFixed(1);
                        const errMsg = err instanceof Error ? err.message : String(err);
                        Logger.trace(component, methodName, `THROW (${ms}ms)`, { error: errMsg });
                        throw err;
                    }
                );
            }

            const ms = (performance.now() - t0).toFixed(1);
            const exitData = logResult ? { result: summariseResult(result) } : undefined;
            Logger.trace(component, methodName, `EXIT (${ms}ms)`, exitData);
            return result;
        };
    };
}

// ---------------------------------------------------------------------------
// traced() — Wrapper for standalone / exported functions
// ---------------------------------------------------------------------------

/**
 * Wrap any function (sync or async) with TRACE-level enter/exit logging.
 *
 * Usage:
 *   const openDatabase = traced('Database', 'openDatabase',
 *       async function openDatabaseImpl(): Promise<IDBDatabase> { ... }
 *   );
 *
 * The returned function has the same signature and behavior as the original.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function traced<T extends (...args: any[]) => any>(
    component: string,
    method: string,
    fn: T,
    options?: TracedOptions,
): T {
    const logArgs = options?.logArgs ?? true;
    const logResult = options?.logResult ?? false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapper = function (this: any, ...args: any[]): any {
        if (!isTraceEnabled()) {
            return fn.apply(this, args);
        }

        const enterData = logArgs && args.length > 0
            ? { args: summariseArgs(args) }
            : undefined;

        Logger.trace(component, method, 'ENTER', enterData);
        const t0 = performance.now();

        let result: unknown;
        try {
            result = fn.apply(this, args);
        } catch (err) {
            const ms = (performance.now() - t0).toFixed(1);
            const errMsg = err instanceof Error ? err.message : String(err);
            Logger.trace(component, method, `THROW (${ms}ms)`, { error: errMsg });
            throw err;
        }

        if (result instanceof Promise) {
            return result.then(
                (val: unknown) => {
                    const ms = (performance.now() - t0).toFixed(1);
                    const exitData = logResult ? { result: summariseResult(val) } : undefined;
                    Logger.trace(component, method, `EXIT (${ms}ms)`, exitData);
                    return val;
                },
                (err: unknown) => {
                    const ms = (performance.now() - t0).toFixed(1);
                    const errMsg = err instanceof Error ? err.message : String(err);
                    Logger.trace(component, method, `THROW (${ms}ms)`, { error: errMsg });
                    throw err;
                }
            );
        }

        const ms = (performance.now() - t0).toFixed(1);
        const exitData = logResult ? { result: summariseResult(result) } : undefined;
        Logger.trace(component, method, `EXIT (${ms}ms)`, exitData);
        return result;
    } as unknown as T;

    return wrapper;
}
