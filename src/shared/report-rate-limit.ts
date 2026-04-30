/**
 * Client-side rate limiter for the in-extension Report ranking-issue button.
 *
 * Why this exists — the extension is live in the Chrome Web Store, the
 * Report button files a GitHub issue (or generates a "file an issue" URL)
 * with one click, and there is no auth gate in front of it. Without a brake
 * a single user could stamp dozens of `ranking-bug` issues per hour and
 * drown the maintainer's queue.
 *
 * D1 (labels), D2/D3/D4 (server-side workflows) handle the *triage* side
 * of the problem; this module is the per-user *floodgate*. The two layers
 * are intentionally redundant — the workflows survive a misconfigured
 * client, and the floodgate survives a misconfigured server.
 *
 * Contract:
 *
 * - Sliding window: at most {@link MAX_REPORTS_PER_WINDOW} successful
 *   button presses per user per {@link WINDOW_MS}, measured from the
 *   timestamp of the oldest stored stamp. We always prune entries older
 *   than the window before deciding so a quiet user is never told they
 *   are rate-limited because of yesterday's reports.
 * - Storage: `chrome.storage.local` under a single key holding an array of
 *   millisecond timestamps. Local (not session) so the cap survives a
 *   browser restart — the maintainer's inbox doesn't reset at midnight,
 *   neither should the floodgate.
 * - All async operations resolve safely if the storage API is missing or
 *   throws; the rate limiter must never *itself* break the Report flow.
 *   It can fail open (allow) or fail closed (deny) — we choose **fail
 *   open** because a busted floodgate should not silently disable a
 *   debugging channel for a real reporter.
 *
 * The kill switch (`reportButtonEnabled` setting) is a separate, more
 * aggressive lever owned by the maintainer; this module assumes the
 * button is reachable and only counts presses.
 */

import { browserAPI } from '../core/helpers';
import { Logger, errorMeta } from '../core/logger';

const log = Logger.forComponent('ReportRateLimit');

const STORAGE_KEY = 'reportRateLimit_v1';

/**
 * Maximum number of Report-button presses allowed per rolling window.
 * Generous enough that a reporter chasing one specific bug across a few
 * different masking levels won't trip it; tight enough that a misconfigured
 * client (or bored user) cannot file an unbounded number per day.
 */
export const MAX_REPORTS_PER_WINDOW = 5;

/** Rolling window length, in milliseconds. 24h matches user mental model. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RateLimitDecision {
    /** True if the press is allowed under the current cap. */
    allowed: boolean;
    /**
     * Count of presses already recorded inside the current window
     * (excluding the press being decided about). 0..MAX_REPORTS_PER_WINDOW.
     */
    used: number;
    /**
     * Number of presses still available after this decision. Always
     * `MAX_REPORTS_PER_WINDOW - used - (allowed ? 1 : 0)`, clamped at 0.
     */
    remaining: number;
    /**
     * Wall-clock ms until the oldest in-window stamp expires and one slot
     * frees up. 0 when `allowed` is true OR when no stamps are stored.
     */
    retryAfterMs: number;
}

/**
 * Internal: pull the timestamp array from storage. Returns an empty
 * array on any failure path (storage missing, read error, malformed
 * payload). Failures are logged at debug — flooding INFO during a
 * Chrome update that briefly nukes session/local would be noisy and
 * the rate-limit failure mode is "fail open" anyway.
 */
async function readStamps(): Promise<number[]> {
    try {
        const local = browserAPI?.storage?.local;
        if (!local) { return []; }
        const result = await new Promise<Record<string, unknown>>((resolve) => {
            local.get([STORAGE_KEY], (r) => {
                if (browserAPI.runtime?.lastError) {
                    log.debug('readStamps', 'storage.local.get returned lastError', errorMeta(browserAPI.runtime.lastError));
                    resolve({});
                    return;
                }
                resolve(r || {});
            });
        });
        const raw = result[STORAGE_KEY];
        if (!Array.isArray(raw)) { return []; }
        return raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    } catch (err) {
        log.debug('readStamps', 'unexpected error reading rate-limit stamps', errorMeta(err));
        return [];
    }
}

/**
 * Internal: persist the (already-pruned) timestamp array. Errors are
 * swallowed — a write failure means we under-count, which favours the
 * user, which is the correct fail mode for a debug-channel floodgate.
 */
async function writeStamps(stamps: number[]): Promise<void> {
    try {
        const local = browserAPI?.storage?.local;
        if (!local) { return; }
        await new Promise<void>((resolve) => {
            local.set({ [STORAGE_KEY]: stamps }, () => {
                if (browserAPI.runtime?.lastError) {
                    log.debug('writeStamps', 'storage.local.set returned lastError', errorMeta(browserAPI.runtime.lastError));
                }
                resolve();
            });
        });
    } catch (err) {
        log.debug('writeStamps', 'unexpected error writing rate-limit stamps', errorMeta(err));
    }
}

/**
 * Drop any stamps older than `now - WINDOW_MS`. Pure helper kept
 * separately so unit tests can verify pruning without poking storage.
 */
export function pruneStamps(stamps: readonly number[], now: number): number[] {
    const cutoff = now - WINDOW_MS;
    return stamps.filter((t) => t > cutoff);
}

/**
 * Compute the decision *without* recording. Useful for the UI to
 * pre-disable the button or surface a tooltip ("3/5 reports used today")
 * without consuming a slot. Pure helper.
 */
export function decideFromStamps(stamps: readonly number[], now: number): RateLimitDecision {
    const pruned = pruneStamps(stamps, now);
    const used = pruned.length;
    const allowed = used < MAX_REPORTS_PER_WINDOW;
    const remaining = Math.max(0, MAX_REPORTS_PER_WINDOW - used - (allowed ? 1 : 0));
    const retryAfterMs = allowed
        ? 0
        : Math.max(0, (pruned[0] ?? now) + WINDOW_MS - now);
    return { allowed, used, remaining, retryAfterMs };
}

/**
 * Decide whether the next Report-button press is allowed, and if so
 * record the press. Single round-trip to storage in the allow path so
 * the click handler stays snappy.
 *
 * Returns the decision *as if* the press was happening now: `used` is
 * the count *before* this press, and `remaining` already accounts for
 * the slot consumed by an `allowed: true` decision.
 */
export async function checkAndRecord(now: number = Date.now()): Promise<RateLimitDecision> {
    const stamps = await readStamps();
    const pruned = pruneStamps(stamps, now);
    const decision = decideFromStamps(pruned, now);
    if (decision.allowed) {
        // Append the new stamp; keep sorted ascending so retryAfterMs
        // computation can rely on stamps[0] being the oldest in-window.
        const next = [...pruned, now].sort((a, b) => a - b);
        await writeStamps(next);
    } else if (pruned.length !== stamps.length) {
        // We pruned but didn't consume; still write back so we don't
        // re-prune the same dead entries on every check.
        await writeStamps(pruned);
    }
    return decision;
}

/**
 * Read-only inspection — does NOT consume a slot. Use from the UI to
 * decide whether to dim the button or render a "limit reached" tooltip
 * pre-click.
 */
export async function peek(now: number = Date.now()): Promise<RateLimitDecision> {
    const stamps = await readStamps();
    return decideFromStamps(pruneStamps(stamps, now), now);
}

/**
 * Wipe all stored stamps. Maintainer-side escape hatch only — not wired
 * into any UI. Useful for E2E test setup and for the debug page.
 */
export async function reset(): Promise<void> {
    await writeStamps([]);
}

/**
 * Format a `retryAfterMs` value into a short human-readable string for
 * use in toasts. Always rounds *up* — telling a user "0 minutes left"
 * is worse than telling them "1 minute left".
 */
export function formatRetryAfter(retryAfterMs: number): string {
    const ms = Math.max(0, retryAfterMs);
    if (ms < 60_000) {
        const s = Math.max(1, Math.ceil(ms / 1000));
        return `${s}s`;
    }
    if (ms < 60 * 60_000) {
        const m = Math.max(1, Math.ceil(ms / 60_000));
        return `${m} minute${m === 1 ? '' : 's'}`;
    }
    const h = Math.max(1, Math.ceil(ms / (60 * 60_000)));
    return `${h} hour${h === 1 ? '' : 's'}`;
}

/** Test-only access to the storage key so tests can wipe between runs. */
export const __testing = {
    STORAGE_KEY,
} as const;
