/**
 * result.ts — Discriminated union for explicit error handling.
 *
 * Replaces ad-hoc throw/return-null/status:'ERROR' patterns with a single,
 * composable type that makes the success/failure path visible in the type system.
 *
 * Usage:
 *   const r = ok(42);           // Result<number, never>
 *   const e = err('not found'); // Result<never, string>
 *   r.isOk   // true
 *   e.isErr  // true
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
  readonly isOk: true;
  readonly isErr: false;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
  readonly isOk: false;
  readonly isErr: true;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value, isOk: true, isErr: false };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error, isOk: false, isErr: true };
}

/** Apply `fn` to the value if Ok, pass through Err unchanged. */
export function map<T, U, E>(result: Result<T, E>, fn: (val: T) => U): Result<U, E> {
  if (result.ok) {return ok(fn(result.value));}
  return result as Err<E>;
}

/** Apply `fn` to the error if Err, pass through Ok unchanged. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (e: E) => F): Result<T, F> {
  if (result.ok) {return result;}
  return err(fn((result as Err<E>).error));
}

/** Chain a fallible operation: if Ok, run `fn` which itself returns a Result. */
export function andThen<T, U, E>(result: Result<T, E>, fn: (val: T) => Result<U, E>): Result<U, E> {
  if (result.ok) {return fn(result.value);}
  return result as Err<E>;
}

/** Extract value or use a default. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  if (result.ok) {return result.value;}
  return fallback;
}

/** Extract value or compute a default from the error. */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (e: E) => T): T {
  if (result.ok) {return result.value;}
  return fn((result as Err<E>).error);
}

/** Pattern-match on Ok/Err. */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: { ok: (val: T) => U; err: (e: E) => U },
): U {
  if (result.ok) {return handlers.ok(result.value);}
  return handlers.err((result as Err<E>).error);
}

/** Wrap a throwing function into a Result. */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/** Wrap an async throwing function into a Result. */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Collect an array of Results into a single Result.
 * Returns Ok with all values if every element is Ok,
 * or the first Err encountered.
 */
export function collectResults<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) {return r as Err<E>;}
    values.push(r.value);
  }
  return ok(values);
}
