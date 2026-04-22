// report-chooser-utils.ts — Single source of truth for the Report button chooser.
//
// Both the popup (`updateReportButton`) and the quick-search overlay
// (`updateOverlayReportButton`) build their masking chooser from these
// constants, so label changes, stage timings, and level order only need to
// be edited in one place.
//
// Gradient contract (none / partial / full) is locked by the tests in
// `src/shared/__tests__/data-masker.test.ts` and
// `src/background/__tests__/ranking-report.test.ts`. Do not soften any of
// the descriptions below without re-reading that contract first.

import type { MaskingLevel } from './data-masker';

export interface MaskingOption {
    level: MaskingLevel;
    label: string;
    description: string;
}

/**
 * Three-option list shown in the chooser modal. Order matters — the UI
 * renders them top-to-bottom and tests assert the `none → partial → full`
 * sequence.
 */
export const MASKING_OPTIONS: readonly MaskingOption[] = [
    {
        level: 'none',
        label: 'No masking',
        description: 'Raw titles, URLs, and query. Safest only for local debugging.',
    },
    {
        level: 'partial',
        label: 'Partial (recommended)',
        description: 'Redacts non-matching words and company-specific domain parts. Query stays readable for reproduction.',
    },
    {
        level: 'full',
        label: 'Strictest',
        description: 'Hashes query, titles, and domains. Keeps numbers and scorer breakdown for debugging.',
    },
];

/**
 * Minimum visible durations for each stage of the staged report flow.
 *
 * The service-worker round-trip often finishes in <100ms, which is too fast
 * for the user to perceive what happened. We pad each stage with a minimum
 * duration via {@link waitRemaining} so the `Generating…` / `Copying…` /
 * `Copied!` transitions are always visible.
 *
 * `errorHold` is longer than `successHold` so users have time to read the
 * failure message before it reverts.
 */
export const STAGE_TIMINGS = {
    minGen: 400,
    minCopy: 250,
    successHold: 1800,
    errorHold: 2500,
} as const;

/**
 * Wait just long enough so that `(now - startMs) >= minMs`.
 * Resolves immediately when the minimum has already elapsed.
 *
 * Pure helper — separated from the DOM-bound callers so it can be
 * exercised with fake timers in unit tests.
 */
export function waitRemaining(startMs: number, minMs: number): Promise<void> {
    const elapsed = performance.now() - startMs;
    const remaining = minMs - elapsed;
    if (remaining <= 0) {
        return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, remaining));
}
