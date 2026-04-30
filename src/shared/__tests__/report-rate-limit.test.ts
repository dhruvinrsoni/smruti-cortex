import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Build an in-memory chrome.storage.local mock so we exercise the real
// async read/write flow rather than spying on Vitest fakes.
function mockLocalStorage(initial: Record<string, unknown> = {}) {
    let store: Record<string, unknown> = { ...initial };
    return {
        get: vi.fn((keys: string[] | string, cb: (items: Record<string, unknown>) => void) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            const out: Record<string, unknown> = {};
            for (const k of arr) { out[k] = store[k]; }
            cb(out);
        }),
        set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
            store = { ...store, ...items };
            cb?.();
        }),
        _peek: () => store,
        _seed: (next: Record<string, unknown>) => { store = { ...next }; },
    };
}

function installChromeMock(localStorage: ReturnType<typeof mockLocalStorage>) {
    vi.stubGlobal('chrome', {
        storage: { local: localStorage },
        runtime: { lastError: undefined },
    });
}

describe('report-rate-limit', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-30T00:00:00Z'));
        vi.resetModules();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    describe('pruneStamps (pure)', () => {
        it('drops stamps older than the window', async () => {
            installChromeMock(mockLocalStorage());
            const { pruneStamps, WINDOW_MS } = await import('../report-rate-limit');
            const now = 100_000_000;
            const stamps = [now - WINDOW_MS - 1, now - WINDOW_MS / 2, now - 1];
            expect(pruneStamps(stamps, now)).toEqual([now - WINDOW_MS / 2, now - 1]);
        });

        it('treats the cutoff exclusively (a stamp exactly WINDOW_MS old is dropped)', async () => {
            installChromeMock(mockLocalStorage());
            const { pruneStamps, WINDOW_MS } = await import('../report-rate-limit');
            const now = 200_000;
            // Equal to cutoff = now - WINDOW_MS → must be dropped (we keep > cutoff).
            expect(pruneStamps([now - WINDOW_MS], now)).toEqual([]);
            expect(pruneStamps([now - WINDOW_MS + 1], now)).toEqual([now - WINDOW_MS + 1]);
        });

        it('returns empty when input is empty', async () => {
            installChromeMock(mockLocalStorage());
            const { pruneStamps } = await import('../report-rate-limit');
            expect(pruneStamps([], 1000)).toEqual([]);
        });
    });

    describe('decideFromStamps (pure)', () => {
        it('allows the first press when no stamps exist', async () => {
            installChromeMock(mockLocalStorage());
            const { decideFromStamps, MAX_REPORTS_PER_WINDOW } = await import('../report-rate-limit');
            const decision = decideFromStamps([], 1000);
            expect(decision.allowed).toBe(true);
            expect(decision.used).toBe(0);
            expect(decision.remaining).toBe(MAX_REPORTS_PER_WINDOW - 1);
            expect(decision.retryAfterMs).toBe(0);
        });

        it('allows up to MAX_REPORTS_PER_WINDOW - 1 prior presses', async () => {
            installChromeMock(mockLocalStorage());
            const { decideFromStamps, MAX_REPORTS_PER_WINDOW } = await import('../report-rate-limit');
            const stamps = Array.from({ length: MAX_REPORTS_PER_WINDOW - 1 }, (_, i) => 1000 + i);
            const decision = decideFromStamps(stamps, 2000);
            expect(decision.allowed).toBe(true);
            expect(decision.used).toBe(MAX_REPORTS_PER_WINDOW - 1);
            expect(decision.remaining).toBe(0);
        });

        it('denies once MAX_REPORTS_PER_WINDOW presses are already in window', async () => {
            installChromeMock(mockLocalStorage());
            const { decideFromStamps, MAX_REPORTS_PER_WINDOW, WINDOW_MS } = await import('../report-rate-limit');
            const now = 5_000_000;
            const oldest = now - WINDOW_MS / 2;
            const stamps = Array.from({ length: MAX_REPORTS_PER_WINDOW }, (_, i) => oldest + i * 1000);
            const decision = decideFromStamps(stamps, now);
            expect(decision.allowed).toBe(false);
            expect(decision.used).toBe(MAX_REPORTS_PER_WINDOW);
            expect(decision.remaining).toBe(0);
            // retryAfterMs is the time until oldest stamp falls out of the window.
            expect(decision.retryAfterMs).toBe(oldest + WINDOW_MS - now);
        });

        it('returns retryAfterMs = 0 in the allow path even when stamps are non-empty', async () => {
            installChromeMock(mockLocalStorage());
            const { decideFromStamps } = await import('../report-rate-limit');
            const decision = decideFromStamps([1000, 2000], 3000);
            expect(decision.allowed).toBe(true);
            expect(decision.retryAfterMs).toBe(0);
        });
    });

    describe('checkAndRecord (storage-backed)', () => {
        it('records the press and returns allowed=true on first call', async () => {
            const local = mockLocalStorage();
            installChromeMock(local);
            const { checkAndRecord, __testing } = await import('../report-rate-limit');
            const now = Date.parse('2026-04-30T00:00:00Z');
            const decision = await checkAndRecord(now);
            expect(decision.allowed).toBe(true);
            expect(local._peek()[__testing.STORAGE_KEY]).toEqual([now]);
        });

        it('blocks the 6th press inside the window and does NOT append a stamp', async () => {
            const local = mockLocalStorage();
            installChromeMock(local);
            const { checkAndRecord, MAX_REPORTS_PER_WINDOW, __testing } = await import('../report-rate-limit');
            const start = Date.parse('2026-04-30T00:00:00Z');
            for (let i = 0; i < MAX_REPORTS_PER_WINDOW; i++) {
                const r = await checkAndRecord(start + i * 1000);
                expect(r.allowed).toBe(true);
            }
            const stamps = local._peek()[__testing.STORAGE_KEY] as number[];
            expect(stamps).toHaveLength(MAX_REPORTS_PER_WINDOW);

            const blocked = await checkAndRecord(start + MAX_REPORTS_PER_WINDOW * 1000);
            expect(blocked.allowed).toBe(false);
            expect(blocked.used).toBe(MAX_REPORTS_PER_WINDOW);
            expect(blocked.retryAfterMs).toBeGreaterThan(0);
            // Stamps must be unchanged when denied.
            expect(local._peek()[__testing.STORAGE_KEY]).toEqual(stamps);
        });

        it('frees a slot once the oldest stamp ages out of the window', async () => {
            const local = mockLocalStorage();
            installChromeMock(local);
            const { checkAndRecord, MAX_REPORTS_PER_WINDOW, WINDOW_MS, __testing } = await import('../report-rate-limit');
            const start = 10_000_000;
            for (let i = 0; i < MAX_REPORTS_PER_WINDOW; i++) {
                await checkAndRecord(start + i);
            }
            // Move "now" past the first stamp's expiry.
            const later = start + WINDOW_MS + 5;
            const decision = await checkAndRecord(later);
            expect(decision.allowed).toBe(true);
            const stamps = local._peek()[__testing.STORAGE_KEY] as number[];
            // The aged-out stamp(s) should have been pruned.
            expect(stamps.every((t) => t > later - WINDOW_MS)).toBe(true);
            expect(stamps).toContain(later);
        });

        it('persists pruned-only writes when a denied call still pruned dead stamps', async () => {
            const local = mockLocalStorage();
            installChromeMock(local);
            const { checkAndRecord, MAX_REPORTS_PER_WINDOW, WINDOW_MS, __testing } = await import('../report-rate-limit');
            const now = 50_000_000;
            // Seed 5 in-window + 1 dead stamp directly so we can verify
            // the deny path still cleans up.
            const inWindow = Array.from({ length: MAX_REPORTS_PER_WINDOW }, (_, i) => now - 1000 - i);
            const dead = now - WINDOW_MS - 100;
            local._seed({ [__testing.STORAGE_KEY]: [dead, ...inWindow] });

            const decision = await checkAndRecord(now);
            expect(decision.allowed).toBe(false);
            const persisted = local._peek()[__testing.STORAGE_KEY] as number[];
            expect(persisted).not.toContain(dead);
            expect(persisted).toHaveLength(MAX_REPORTS_PER_WINDOW);
        });

        it('fails open (allows) when chrome.storage is missing entirely', async () => {
            // Stub a chrome global with NO storage namespace.
            vi.stubGlobal('chrome', { runtime: { lastError: undefined } });
            const { checkAndRecord } = await import('../report-rate-limit');
            const decision = await checkAndRecord(123_456);
            // No storage = no record = always allow. This is the right
            // fail mode for a debug channel: never silently kill it.
            expect(decision.allowed).toBe(true);
        });
    });

    describe('peek (read-only)', () => {
        it('does not consume a slot', async () => {
            const local = mockLocalStorage();
            installChromeMock(local);
            const { checkAndRecord, peek, MAX_REPORTS_PER_WINDOW, __testing } = await import('../report-rate-limit');
            const now = 1_000_000;
            await checkAndRecord(now);
            const before = local._peek()[__testing.STORAGE_KEY] as number[];
            const decision = await peek(now + 100);
            expect(decision.used).toBe(1);
            // remaining = MAX - used - (allowed ? 1 : 0); i.e. how many slots
            // would be left *after* the hypothetical press peek is reporting on.
            expect(decision.remaining).toBe(MAX_REPORTS_PER_WINDOW - 1 - 1);
            const after = local._peek()[__testing.STORAGE_KEY] as number[];
            expect(after).toEqual(before);
        });
    });

    describe('reset', () => {
        it('wipes the stored array', async () => {
            const local = mockLocalStorage();
            installChromeMock(local);
            const { checkAndRecord, reset, __testing } = await import('../report-rate-limit');
            await checkAndRecord(1000);
            await reset();
            expect(local._peek()[__testing.STORAGE_KEY]).toEqual([]);
        });
    });

    describe('formatRetryAfter', () => {
        it('rounds up sub-minute durations to seconds, minimum 1s', async () => {
            installChromeMock(mockLocalStorage());
            const { formatRetryAfter } = await import('../report-rate-limit');
            expect(formatRetryAfter(0)).toBe('1s');
            expect(formatRetryAfter(500)).toBe('1s');
            expect(formatRetryAfter(1500)).toBe('2s');
            expect(formatRetryAfter(59_000)).toBe('59s');
        });

        it('formats minute-scale durations with proper plural', async () => {
            installChromeMock(mockLocalStorage());
            const { formatRetryAfter } = await import('../report-rate-limit');
            expect(formatRetryAfter(60_000)).toBe('1 minute');
            expect(formatRetryAfter(120_000)).toBe('2 minutes');
            expect(formatRetryAfter(59 * 60_000)).toBe('59 minutes');
        });

        it('formats hour-scale durations with proper plural', async () => {
            installChromeMock(mockLocalStorage());
            const { formatRetryAfter } = await import('../report-rate-limit');
            expect(formatRetryAfter(60 * 60_000)).toBe('1 hour');
            expect(formatRetryAfter(2 * 60 * 60_000)).toBe('2 hours');
            expect(formatRetryAfter(23.5 * 60 * 60_000)).toBe('24 hours');
        });
    });
});
