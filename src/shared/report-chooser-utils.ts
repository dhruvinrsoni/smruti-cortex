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

/**
 * Class name used by both popup and quick-search to locate the Report button.
 * Kept here so tests and production both agree on the selector.
 */
export const REPORT_BUTTON_CLASS = 'report-ranking-btn';

/**
 * Ensure the Report button inside `container` is a stable DOM node across
 * renders: create it once on first need via `factory`, then toggle its
 * `hidden` attribute instead of removing/recreating it.
 *
 * Why this matters — the Report chooser's `onPick` closure captures the
 * button reference at click time to drive the staged flow
 * (`Generating… → Copying… → Copied!`). If a concurrent `renderResults()`
 * call removed that button and appended a fresh one, the closure would
 * write to a detached node while Playwright (or the user) polled the live
 * replacement. Keeping the same node alive makes the flow deterministic.
 *
 * Contract:
 * - Returns the same `HTMLButtonElement` for every call where `container`
 *   already has a `.${REPORT_BUTTON_CLASS}` child (identity preserved).
 * - Toggles `btn.hidden = !hasResults` on every call.
 * - When no button exists yet and `hasResults === false`, returns `null`
 *   and does NOT call `factory` — no DOM churn for empty-state renders.
 * - When no button exists yet and `hasResults === true`, calls `factory()`
 *   (caller must fully configure the returned button — class, listeners,
 *   styles), appends it, and returns it.
 *
 * @param container The footer element that hosts the button.
 * @param hasResults Whether the result list currently has entries.
 * @param factory Called once, only on first creation, to build the button.
 * @returns The stable button, or `null` if none was created yet.
 */
export function ensureReportButton(
    container: HTMLElement | null,
    hasResults: boolean,
    factory: () => HTMLButtonElement,
): HTMLButtonElement | null {
    if (!container) { return null; }
    let btn = container.querySelector(`.${REPORT_BUTTON_CLASS}`) as HTMLButtonElement | null;
    if (btn) {
        btn.hidden = !hasResults;
        return btn;
    }
    if (!hasResults) { return null; }
    btn = factory();
    btn.hidden = false;
    container.appendChild(btn);
    return btn;
}
