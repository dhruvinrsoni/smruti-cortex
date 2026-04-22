// Tests for report-chooser-utils.ts — shared report-button chooser constants.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { MASKING_OPTIONS, STAGE_TIMINGS, waitRemaining } from '../report-chooser-utils';

describe('MASKING_OPTIONS', () => {
    it('has exactly three entries', () => {
        expect(MASKING_OPTIONS).toHaveLength(3);
    });

    it('is ordered none → partial → full', () => {
        expect(MASKING_OPTIONS.map((o) => o.level)).toEqual(['none', 'partial', 'full']);
    });

    it('every entry has a non-empty label and description', () => {
        for (const opt of MASKING_OPTIONS) {
            expect(opt.label.length).toBeGreaterThan(0);
            expect(opt.description.length).toBeGreaterThan(0);
        }
    });

    it('partial is the recommended default (called out in its label)', () => {
        const partial = MASKING_OPTIONS.find((o) => o.level === 'partial')!;
        expect(partial.label.toLowerCase()).toContain('recommended');
    });
});

describe('STAGE_TIMINGS', () => {
    it('defines the four stages used by the staged flow', () => {
        expect(STAGE_TIMINGS).toMatchObject({
            minGen: expect.any(Number),
            minCopy: expect.any(Number),
            successHold: expect.any(Number),
            errorHold: expect.any(Number),
        });
    });

    it('all durations are positive', () => {
        expect(STAGE_TIMINGS.minGen).toBeGreaterThan(0);
        expect(STAGE_TIMINGS.minCopy).toBeGreaterThan(0);
        expect(STAGE_TIMINGS.successHold).toBeGreaterThan(0);
        expect(STAGE_TIMINGS.errorHold).toBeGreaterThan(0);
    });

    it('error hold is at least as long as success hold (reading takes longer)', () => {
        expect(STAGE_TIMINGS.errorHold).toBeGreaterThanOrEqual(STAGE_TIMINGS.successHold);
    });
});

describe('waitRemaining', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves after the remaining ms when not yet elapsed', async () => {
        vi.useFakeTimers();
        const start = performance.now();
        const promise = waitRemaining(start, 400);
        let resolved = false;
        promise.then(() => { resolved = true; });

        await vi.advanceTimersByTimeAsync(399);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(2);
        expect(resolved).toBe(true);
    });

    it('resolves immediately when the minimum has already elapsed', async () => {
        const start = performance.now() - 500;
        const before = performance.now();
        await waitRemaining(start, 400);
        const after = performance.now();
        expect(after - before).toBeLessThan(50);
    });

    it('resolves immediately for a zero minimum', async () => {
        const before = performance.now();
        await waitRemaining(performance.now(), 0);
        const after = performance.now();
        expect(after - before).toBeLessThan(50);
    });
});
