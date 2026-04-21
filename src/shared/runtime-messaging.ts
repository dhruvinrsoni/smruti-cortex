/**
 * Wake-safe `chrome.runtime.sendMessage` helper shared by popup and
 * quick-search. Centralizing this keeps behavior consistent across
 * extension surfaces — especially important after hibernate-induced
 * service worker eviction, where ad-hoc wrappers diverged on things like
 * bfcache-error tolerance, timeouts, and retry semantics.
 *
 * Design principles:
 * - **Defaults are drop-in compatible** with the popup's existing wrapper:
 *   no timeout, no retries. Callers opt in to stricter behavior.
 * - **bfcache tolerance**: when a response is present we resolve with it
 *   even if `chrome.runtime.lastError` is also set. Chrome populates both
 *   during bfcache page transitions, and the response is authoritative.
 * - **No-runtime fallback**: when `chrome.runtime.sendMessage` is
 *   unavailable (extension context invalidated mid-call, tests), we
 *   resolve with an empty object so callers don't crash on `.results`.
 * - **Retries are for lastError-without-response**, not for responses
 *   that carry `{error: ...}` payloads. Those are legitimate service
 *   worker responses that the caller must interpret.
 */

export interface SendMessageWithRetryOptions {
  /** Total timeout per attempt in ms. `Infinity` (default) disables it. */
  timeoutMs?: number;
  /** Extra attempts beyond the first. `0` (default) = no retry. */
  retries?: number;
  /**
   * Delay between retries in ms. Can be a constant or a schedule array
   * indexed by the retry number (0-based). If the array is shorter than
   * `retries`, the last value is reused.
   */
  retryDelayMs?: number | number[];
}

interface RuntimeLike {
  sendMessage: (msg: unknown, cb: (resp: unknown) => void) => void;
  // Implementers expose `lastError` as a getter on the runtime namespace.
  readonly lastError?: { message?: string } | null;
}

/**
 * Returns the active runtime object (chrome or webextensions browser),
 * or `null` when neither is available.
 * Exposed for tests; most callers just use `sendMessageWithRetry`.
 */
export function getRuntime(): RuntimeLike | null {
  type GlobalShim = {
    chrome?: { runtime?: RuntimeLike };
    browser?: { runtime?: RuntimeLike };
  };
  const g = globalThis as unknown as GlobalShim;
  if (g.chrome?.runtime?.sendMessage) {return g.chrome.runtime;}
  if (g.browser?.runtime?.sendMessage) {return g.browser.runtime;}
  return null;
}

function resolveDelay(
  retryDelayMs: SendMessageWithRetryOptions['retryDelayMs'],
  attempt: number,
): number {
  if (retryDelayMs === undefined) {return 500;}
  if (typeof retryDelayMs === 'number') {return retryDelayMs;}
  if (retryDelayMs.length === 0) {return 0;}
  const idx = Math.min(attempt, retryDelayMs.length - 1);
  return retryDelayMs[idx];
}

/**
 * Send a message to the service worker with optional timeout and retry.
 *
 * Resolution semantics:
 * - Resolves with the response object when the SW replies.
 * - Resolves with `{}` when no extension runtime is available.
 * - Rejects only when all attempts fail with `lastError` and no response.
 */
export function sendMessageWithRetry<T = unknown>(
  msg: unknown,
  options: SendMessageWithRetryOptions = {},
): Promise<T> {
  const { timeoutMs = Infinity, retries = 0, retryDelayMs } = options;

  async function attempt(n: number): Promise<T> {
    const runtime = getRuntime();
    if (!runtime) {return {} as T;}

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const done = (fn: () => void) => {
        if (settled) {return;}
        settled = true;
        if (timer !== null) {clearTimeout(timer);}
        fn();
      };

      if (timeoutMs !== Infinity) {
        timer = setTimeout(() => {
          done(() => reject(new Error(`sendMessage timed out after ${timeoutMs}ms`)));
        }, timeoutMs);
      }

      try {
        runtime.sendMessage(msg, (resp: unknown) => {
          // bfcache tolerance: if we got a response, trust it even if
          // `lastError` is also set (Chrome populates both during
          // navigation). Only reject on lastError AND no response.
          if (resp !== undefined && resp !== null) {
            done(() => resolve(resp as T));
            return;
          }
          const err = runtime.lastError;
          if (err) {
            done(() => reject(new Error(err.message ?? 'Runtime error')));
            return;
          }
          done(() => resolve(resp as T));
        });
      } catch (e) {
        done(() => reject(e));
      }
    }).catch(async (err) => {
      if (n >= retries) {throw err;}
      const delay = resolveDelay(retryDelayMs, n);
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      return attempt(n + 1);
    });
  }

  return attempt(0);
}
