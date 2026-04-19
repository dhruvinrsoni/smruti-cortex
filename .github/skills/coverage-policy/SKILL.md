---
name: coverage-policy
description: Coverage thresholds, ratchet enforcement, exclusion rules, and test-writing obligations
metadata:
  project: smruti-cortex
  version: "9.1"
---

# Coverage Policy

## Thresholds (Hard Floor)

| Metric     | Minimum |
|------------|---------|
| Lines      | 95%     |
| Branches   | 90%     |
| Functions  | 95%     |
| Statements | 95%     |

These are enforced by `vitest.config.ts` `coverage.thresholds` and the ratchet script.

## Ratchet Rule

Coverage can go **up** but never **down**. The file `coverage-baseline.json` at repo root records the current floor for each metric.

- `node scripts/coverage-ratchet.mjs` — compares current coverage to baseline. Exits 1 on regression.
- `node scripts/coverage-ratchet.mjs --update` — tightens the baseline to current values. Only run after adding tests.
- The ratchet runs inside `npm run verify` and the pre-commit hook.

**NEVER lower values in `coverage-baseline.json` without a documented justification in the commit message.**

## Exclusion Policy

Files excluded from coverage are listed in `vitest.config.ts` `coverage.exclude`. Current exclusions:

| File | Justification |
|------|---------------|
| `src/popup/popup.ts` | Monolithic UI IIFE with no exports; tested by Playwright E2E |
| `src/content_scripts/quick-search.ts` | Shadow DOM IIFE with no exports; tested by Playwright E2E |
| `src/core/scorer-types.ts` | Type definitions only (zero runtime code) |
| `src/background/schema.ts` | Type definitions only (zero runtime code) |

**NEVER add a file to `coverage.exclude` without adding a row to this table AND recording the justification in the commit message.**

## Characterization-Test-First Pattern

Before refactoring any file:
1. Write characterization tests that lock the current behavior (inputs → outputs, side effects).
2. Commit the tests separately: `test(<scope>): characterize <module> behavior`.
3. Only then refactor — the characterization tests must keep passing.

## Test Writing Obligations

- Every new production file must have a corresponding test file.
- Every bug fix must include a regression test.
- Target 95%+ line coverage on new code.
- Use the AAA pattern (Arrange / Act / Assert) in every test.
- Mock Chrome APIs and external I/O via shared test utilities in `src/__test-utils__/`.

## Commands

```bash
npm run coverage                            # run tests + generate coverage
node scripts/coverage-ratchet.mjs           # check against baseline
node scripts/coverage-ratchet.mjs --update  # tighten baseline
```
