// Tests for report-chooser-utils.ts — shared report-button chooser constants.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    MASKING_OPTIONS,
    STAGE_TIMINGS,
    waitRemaining,
    ensureReportButton,
    REPORT_BUTTON_CLASS,
} from '../report-chooser-utils';

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

describe('ensureReportButton — stable DOM node invariant', () => {
    function makeFactory() {
        const factory = vi.fn(() => {
            const btn = document.createElement('button');
            btn.className = REPORT_BUTTON_CLASS;
            btn.textContent = 'Report';
            return btn;
        });
        return factory;
    }

    it('exposes the shared class name', () => {
        expect(REPORT_BUTTON_CLASS).toBe('report-ranking-btn');
    });

    it('returns null and does NOT call factory when container is null', () => {
        const factory = makeFactory();
        const result = ensureReportButton(null, true, factory);
        expect(result).toBeNull();
        expect(factory).not.toHaveBeenCalled();
    });

    it('returns null and does NOT call factory when no button exists and hasResults is false', () => {
        const container = document.createElement('div');
        const factory = makeFactory();
        const result = ensureReportButton(container, false, factory);
        expect(result).toBeNull();
        expect(factory).not.toHaveBeenCalled();
        expect(container.querySelector(`.${REPORT_BUTTON_CLASS}`)).toBeNull();
    });

    it('creates the button once on first call with hasResults=true', () => {
        const container = document.createElement('div');
        const factory = makeFactory();
        const btn = ensureReportButton(container, true, factory);
        expect(btn).not.toBeNull();
        expect(factory).toHaveBeenCalledTimes(1);
        expect(container.querySelector(`.${REPORT_BUTTON_CLASS}`)).toBe(btn);
        expect(btn!.hidden).toBe(false);
    });

    // ── the core regression firewall ───────────────────────────────────────
    it('returns the SAME DOM node across show → hide → show cycles (identity preserved)', () => {
        const container = document.createElement('div');
        const factory = makeFactory();

        const first = ensureReportButton(container, true, factory);
        const hidden = ensureReportButton(container, false, factory);
        const reshown = ensureReportButton(container, true, factory);

        expect(first).not.toBeNull();
        expect(hidden).toBe(first);
        expect(reshown).toBe(first);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('toggles the hidden attribute on every call without detaching the node', () => {
        const container = document.createElement('div');
        const factory = makeFactory();

        const btn = ensureReportButton(container, true, factory)!;
        expect(btn.hidden).toBe(false);
        expect(btn.parentElement).toBe(container);

        ensureReportButton(container, false, factory);
        expect(btn.hidden).toBe(true);
        expect(btn.parentElement).toBe(container);

        ensureReportButton(container, true, factory);
        expect(btn.hidden).toBe(false);
        expect(btn.parentElement).toBe(container);
    });

    it('factory is only ever called once no matter how many cycles happen', () => {
        const container = document.createElement('div');
        const factory = makeFactory();

        ensureReportButton(container, true, factory);
        for (let i = 0; i < 10; i++) {
            ensureReportButton(container, i % 2 === 0, factory);
        }
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('preserves textContent writes across a hide/show cycle (proves writes land on the live node)', () => {
        // This is the specific invariant that makes the Playwright poll reliable:
        // text written during onPick while hidden is still observable after re-show.
        const container = document.createElement('div');
        const factory = makeFactory();
        const btn = ensureReportButton(container, true, factory)!;

        ensureReportButton(container, false, factory);
        btn.textContent = 'Generating…';

        ensureReportButton(container, true, factory);
        expect(btn.textContent).toBe('Generating…');
        expect(container.querySelector(`.${REPORT_BUTTON_CLASS}`)!.textContent).toBe('Generating…');
    });

    it('does not create a second button when the container already has one', () => {
        const container = document.createElement('div');
        const factory = makeFactory();

        ensureReportButton(container, true, factory);
        ensureReportButton(container, true, factory);
        ensureReportButton(container, true, factory);

        expect(container.querySelectorAll(`.${REPORT_BUTTON_CLASS}`)).toHaveLength(1);
        expect(factory).toHaveBeenCalledTimes(1);
    });
});
