---
name: coverage-policy
description: Coverage thresholds, ratchet enforcement, exclusion rules, and test-writing obligations
metadata:
  project: smruti-cortex
  version: "9.2"
---

# Coverage Policy

Two complementary gates protect coverage in this repo:

| Gate | Source | Role |
|------|--------|------|
| **Hard floor** | `vitest.config.ts` `coverage.thresholds` | Fails `npm run coverage` if coverage drops below the project's current achievement level. |
| **Tiered ratchet** | `scripts/coverage-ratchet.mjs` + `coverage-thresholds.json` | Tier feedback (floor / target / goal) and optional per-file modulewise enforcement. |

## Vitest Hard Floor (current achievement level)

These mirror approximately where the repo sits today and stop noisy regressions:

| Metric     | Minimum |
|------------|---------|
| Lines      | 95%     |
| Branches   | 90%     |
| Functions  | 95%     |
| Statements | 95%     |

## Tiered Ratchet (long-term floors + visibility)

Coverage will drift down naturally as code grows; the ratchet is here to shout when a metric falls **off a cliff**, not when it dips by 0.10%. It uses absolute tiered floors:

| Tier   | Default | Meaning |
|--------|---------|---------|
| floor  | 70      | **FAIL below this.** Market practice; below this is unacceptable. |
| target | 80      | Industry standard; informational only. |
| goal   | 90      | Best practice; informational only. |

Defaults are baked into the script. To override or add per-directory floors, edit `coverage-thresholds.json` at the repo root:

```json
{
  "default": {
    "floor":  { "lines": 70, "branches": 70, "functions": 70, "statements": 70 },
    "target": { "lines": 80, "branches": 80, "functions": 80, "statements": 80 },
    "goal":   { "lines": 90, "branches": 90, "functions": 90, "statements": 90 }
  },
  "perDir": [
    { "path": "src/background/search/",
      "floor": { "lines": 90, "branches": 85, "functions": 90, "statements": 90 } }
  ]
}
```

Per-directory overrides only affect the `floor` tier (target/goal stay default) — keeps the config small.

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
npm run coverage                              # vitest + summary report
node scripts/coverage-ratchet.mjs             # totals against tiered floors
node scripts/coverage-ratchet.mjs --per-file  # also enforce per-file floors
node scripts/coverage-ratchet.mjs --json      # NDJSON for CI
```

The ratchet runs inside `npm run verify` (totals only) and is wired into the release pipeline.
