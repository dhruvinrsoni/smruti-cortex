# CLAUDE.md — SmrutiCortex Project Context

Project-specific instructions for Claude Code. Loaded automatically when working in this repo.

---

## Project

Chrome MV3 extension for instant browser history search with optional local AI.
**Stack:** TypeScript · esbuild · Vitest · Chrome MV3 service worker · Ollama (optional, local)
**All data stays on device.** Zero telemetry. Zero cloud.

---

## Critical File Map

Navigate here first — don't broad-search when the location is known:

| What | Where |
|------|-------|
| Extension entry point | `src/background/service-worker.ts` |
| Search orchestrator | `src/background/search/search-engine.ts` |
| All 9 scorers | `src/background/search/scorers/` |
| Tokenizer | `src/background/search/tokenizer.ts` |
| Settings schema | `src/core/settings.ts` (single source of truth) |
| IndexedDB layer | `src/background/database.ts` (incl. `upsertRecentVisit` fast path) |
| Recent-view freshness | `src/background/handlers/recent-merge.ts` + `src/shared/recent-history-cache.ts` (see `indexing` skill) |
| Ollama client | `src/background/ollama-service.ts` |
| Command palette registry | `src/shared/command-registry.ts` (all palette commands, tiers, modes) |
| Web search module | `src/shared/web-search.ts` (`??` prefix engines, URL builders) |
| Palette toast formatting | `src/shared/palette-messages.ts` |
| CSP-safe img error handler | `src/shared/hide-img-on-error.ts` |
| All unit test files | `src/**/__tests__/*.test.ts` |
| E2E test specs | `e2e/*.spec.ts` (7 Playwright specs, 45 tests) |
| E2E fixture | `e2e/fixtures/extension.ts` (browser context, SW setup, `withSlowMo` wrapper) |
| E2E testing guide | `docs/E2E_TESTING.md` |
| Shared test utilities | `src/__test-utils__/` (chrome mock builder, logger mock, settings mock, factories, lifecycle) |
| Popup pure logic | `src/popup/popup-utils.ts` (extracted from popup.ts for testability) |
| Quick-search pure logic | `src/content_scripts/quick-search-utils.ts` (extracted from quick-search.ts for testability) |
| Vitest config | `vitest.config.ts` |
| Playwright config | `playwright.config.ts` |
| Build scripts | `scripts/esbuild-*.mjs` |
| Store submission docs | `docs/store-submissions/vX.Y.Z-chrome-web-store.md` |

---

## Common Commands

11 top-level npm verbs route 17 documented invocations. Naming policy: single-word verbs first (`build`, `dev`, `verify`, `coverage`, `e2e`); space-separated subcommands when a verb has sub-modes (`test watch`, `lint strict`, `ship patch`, `store check`); zero colons.

**Develop:**

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm run build` | Production build (minified, the canonical build) | ~30s |
| `npm run dev` | Watch mode (esbuild, rebuild on file save) | continuous |
| `npm run package` | Build + zip into `release/zips/` | ~35s |

**Test:**

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm test` | Unit tests one-shot (1,252+ tests, 47 files) | ~60s |
| `npm run test watch` | Unit tests in watch mode | continuous |
| `npm run coverage` | Unit tests + v8 coverage report | ~30s |
| `npm run e2e` | Build + Playwright E2E tests (45 tests, 7 specs) | ~90s |
| `npm run lint` | ESLint check (errors block, warnings inform) | ~5s |
| `npm run lint strict` | ESLint zero-warning check (manual cleanup use) | ~5s |

**Ship:**

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm run verify` | Full verification (lint + build + tests + coverage + E2E) | ~4min |
| `npm run ship check` | Verify + release-only audit phases (npm audit, store check, LICENSE, privacy URL, prev tag) | ~6min |
| `npm run ship patch` | Full release pipeline (patch bump) | ~60s |
| `npm run ship minor` | Full release pipeline (minor bump) | ~60s |
| `npm run ship major` | Full release pipeline (major bump) | ~60s |
| `npm run store check` | Verify CWS submission readiness (manifest ↔ Section 4 perm parity, zip, CHANGELOG) | instant |
| `npm run store init` | Scaffold a new `docs/store-submissions/vX.Y.Z-chrome-web-store.md` | instant |
| `npm run store unpack` | Strip `_metadata/` from a CWS-downloaded extension folder for "Load Unpacked" | instant |

**Tips:**
- Append `-- --dry-run` to any `ship patch|minor|major` command to preview without pushing.
- Append `-- --no-e2e` to `verify` to skip E2E tests, or `-- --e2e-slowmo` for visual debugging.
- Append `-- --no-network` to `ship check` to skip network-dependent phases (privacy URL).
- Pre-commit hook runs build+test+coverage automatically. Override with `FORCE_PRE_COMMIT=1`.

---

## Script Briefs

One-paragraph description of every script in `scripts/`. Quick-reference for when you come back after 6 months.

**`scripts/release.mjs`** — invoked by `npm run ship <patch|minor|major|check>`. Validates prerequisites (clean tree, on main, gh CLI authenticated). Runs `ship check` as the gate. Bumps `package.json`, syncs manifest, regenerates CHANGELOG, scaffolds submission doc via `store init`. Re-builds with new version baked in, packages zip into `release/zips/`. Single git commit + tag + push, creates the GitHub Release with the zip attached. Prints next-steps (CWS dashboard URL, submission doc path). When called with `check`, skips the bump/build/tag/push pipeline and just runs the `verify.mjs --release` gate.

**`scripts/verify.mjs`** — invoked by `npm run verify` or `npm run ship check` (via release.mjs). Default mode: lint + build + unit tests + coverage + coverage ratchet + E2E. `--release` mode adds: bundle benchmark, version sync, MV3 manifest_version, dist integrity (no underscore dirs, critical files present), git tree clean + on main/master branch, plus the release-only phases — `npm audit --audit-level=high`, inline `npm run store check`, LICENSE present, privacy URL HTTP 200, previous-version git tag exists. Continues on individual failures so one run reports the full picture. Flags: `--no-e2e`, `--e2e-slowmo`, `--no-network`, `--release`.

**`scripts/store-check.mjs`** — invoked by `npm run store check` and `npm run store init`. Check mode: verifies a release is CWS-ready (submission doc exists with real Submitted date, zip exists in `release/zips/`, CHANGELOG entry present, public CWS listing version matches, public "What's New" not stale, **manifest permissions ↔ Section 4 justification parity** — the perm-gap audit). Init mode: scaffolds `docs/store-submissions/vX.Y.Z-chrome-web-store.md` from previous version's doc, computes permission delta vs `git show v<prev>:manifest.json`, injects a `PERMISSION DELTA` banner with fill-in-the-blank `#### perm` template lines.

**`scripts/pre-commit-check.js`** — git hook (not in npm scripts surface). Smart-skips for non-product file commits. Runs lint auto-fix on staged TS files, then prod build, then full test suite. Hard-fails the commit when `manifest.json` permission arrays change but no `docs/store-submissions/*.md` is staged in the same commit — the perm-parity gate. `FORCE_PRE_COMMIT=1` bypasses (with a loud warning when a perm change is detected).

**`scripts/test.mjs`** — tiny dispatcher for `npm run test [watch]`. Default (no arg) invokes `vitest run` (one-shot, CI-safe). `watch` invokes `vitest` (watch mode). Flags after `--` are forwarded. Coverage and E2E are top-level verbs (`npm run coverage`, `npm run e2e`), not subcommands of `test`.

**`scripts/lint.mjs`** — dispatcher for `npm run lint [strict]`. Default invokes eslint with `--report-unused-disable-directives`. `strict` adds `--max-warnings 0`. Flags after `--` are forwarded.

**`scripts/store.mjs`** — dispatcher for `npm run store [check|init|unpack]`. Routes to existing handlers (`store-check.mjs`, `store-check.mjs --init`, `strip-metadata.mjs`).

**`scripts/sync-version.mjs`** — copies `package.json` version into `manifest.json`. Called at the start of every `build` chain by release.mjs.

**`scripts/copy-static.mjs`** — copies non-bundled assets (manifest.json, popup.html/css, icons, error-guard.js) from source tree into `dist/`. Called by build chain. Also strips any underscore-prefixed dirs that would break Chrome MV3 "Load Unpacked".

**`scripts/esbuild-dev.mjs`** / **`scripts/esbuild-prod.mjs`** — esbuild bundling configs. Dev = source maps + watch (used by `npm run dev`); prod = minified (used by `npm run build`).

**`scripts/package.mjs`** — zips `dist/` into `release/zips/smruti-cortex-vX.Y.Z.zip`. Called after `build` by `npm run package`.

**`scripts/coverage-ratchet.mjs`** — absolute tiered coverage floors (70 / 80 / 90 by default). Fails only when a metric falls below the floor; target/goal tiers are informational. Optional `coverage-thresholds.json` overrides the defaults and adds per-directory floor overrides. Called inside verify.mjs.

**`scripts/benchmark-performance.mjs`** — bundle size threshold checker. Called inside `verify.mjs --release`.

**`scripts/strip-metadata.mjs`** — strips `_metadata/` and other underscore entries from a CWS-downloaded extension folder. Recovery tool, called via `npm run store unpack`.

**`scripts/e2e-slowmo.mjs`** — runs Playwright with SLOW_MO env var for visual debugging. Called via `npm run verify -- --e2e-slowmo`.

### Version Syncing

`package.json` is the single source of truth for version numbers. `scripts/sync-version.mjs` runs at the start of every `npm run build`, catching any drift in `manifest.json`. Releases drive version bumps through `npm run ship <patch|minor|major>`, which also updates `manifest.json` via the same sync script — there is no `npm version` lifecycle hook.

### Pre-commit hook (`scripts/pre-commit-check.js`)

Runs automatically on every `git commit`:
1. Detects staged files — skips if only docs/config changed
2. Hard-fails if `manifest.json` permissions changed without a matching `docs/store-submissions/*.md` staged
3. ESLint auto-fix on staged `.ts` files
4. Build (prod) — blocking
5. Unit tests with coverage — non-blocking (warns but doesn't block)

Override: `FORCE_PRE_COMMIT=1 git commit ...` to force checks even for docs-only changes.

---

## Domain Skills (On-Demand Context)

Load `.github/skills/<name>/SKILL.md` for deep domain knowledge:

| Skill | Load when... |
|-------|-------------|
| `search-engine` | Changing scorers, tokenizer, or ranking logic |
| `indexing` | Touching the Recent-view freshness path (`onVisited` fast path, bulk reconciliation, live-merge fallback, warm cache) |
| `ai-ollama` | Working on AI expansion, embeddings, circuit breaker |
| `ui-components` | Touching popup, quick-search overlay, Shadow DOM |
| `command-palette` | Adding/changing palette commands, prefix modes, web search engines |
| `testing` | Writing or fixing tests |
| `settings` | Changing any setting key, default, or validation |
| `workflows-ci` | Modifying GitHub Actions (3 active workflows: health-check, lint-report, ranking-reports) |
| `test-generation` | Generating new test files (full rules + mock patterns) |
| `maintenance` | Bug fixes, releases, Chrome Web Store submissions |
| `coverage-policy` | **MANDATORY** before any test/coverage work — thresholds, ratchet, exclusion rules |
| `solid-design` | **MANDATORY** before any refactor — ports, Result type, bounded contexts |
| `atomic-commits` | **MANDATORY** before committing — verified, one-logical-change commits |

Full test generation agent: `.github/copilot/agents/test-coverage-agent.md`

---

## Efficiency Rules (Repo-Adapted)

### Model / Agent Selection

- **Direct (no agent):** Reading 1-2 known files, single targeted search, making code edits
- **Explore agent:** Understanding how a subsystem works, multi-file pattern discovery
- **Plan agent:** Before implementing non-trivial changes — scorers, settings, search pipeline

### Discovery Strategy

Prefer in this order:
1. **Glob** for file finding: `src/background/search/scorers/*.ts`, `src/**/__tests__/*.test.ts`
2. **Grep `files_with_matches`** to locate which files contain a symbol before reading
3. **Read** with `offset`+`limit` when the relevant region is known from Grep line numbers
4. **Explore agent** only when answer spans many files or requires iteration

### This Repo Specifically

- **Scorers are isolated:** Each scorer in `src/background/search/scorers/` is independent. A change to `title-scorer.ts` won't affect `url-scorer.ts`.
- **Settings schema is truth:** Never hardcode a setting key. Always reference `SETTINGS_SCHEMA` in `src/core/settings.ts`.
- **Logger everywhere:** Use `Logger.forComponent('Name')` — never raw `console.log`.
- **Tests run fast:** `npm test` finishes in ~28s. Always run after code changes before committing.
- **Build is slow:** `npm run build` takes ~30s + pre-commit hook adds another run on commit. Verify logic via `npm test` first.
- **Chrome APIs require mocking:** jsdom has no `chrome.*`. Every test that touches Chrome APIs must mock them. See `.github/skills/testing/SKILL.md` patterns.
- **90%+ line coverage:** 1,233+ unit tests across 46 test files + 45 Playwright E2E tests across 7 spec files. See `.github/copilot/test-generation-instructions.md` for mock patterns.
- **Shared test utilities:** `src/__test-utils__/` provides composable Chrome API mocks, Logger/Settings mocks, data factories, and lifecycle helpers — use these instead of inline mocks.
- **E2E tests need a build:** Playwright loads the built extension from `dist/`. Use `npm run e2e` (which builds first) instead of bare `npx playwright test`. See `docs/E2E_TESTING.md` for fixture architecture and troubleshooting.
- **Underscore-dir guardrail:** Chrome MV3 forbids directories starting with `_` in extensions. `tsconfig.json` excludes `src/**/__test-utils__/**` and `scripts/copy-static.mjs` post-build sweep removes any that leak through.
- **Lint policy:** `npm run lint` — errors block, warnings are advisory (exit 0). Test files have `no-explicit-any` and `no-non-null-assertion` turned off via `.eslintrc.cjs` overrides. `npm run lint strict` (`--max-warnings 0`) exists for manual cleanup sprints but is **not** wired into verify / ship check / release — no obligation to maintain zero warnings.

### Parallelization

Run in parallel when independent:
- Multiple file reads (use one message with multiple Read calls)
- Multiple Grep/Glob searches
- Multiple Explore agents for different subsystems

---

## Key Conventions

- **TypeScript only** — no new `.js` files in `src/`
- **No `any` without justification** — ESLint warns; fix it
- **Single source of truth** — settings live in `SETTINGS_SCHEMA`, not scattered constants
- **Logger pattern** — `const log = Logger.forComponent('MyModule');`
- **Test location** — `src/<area>/__tests__/<filename>.test.ts` (co-located)
- **No hardcoded versions** — `scripts/sync-version.mjs` syncs `package.json` → `manifest.json`
- **Commit convention** — `fix:`, `feat:`, `docs:`, `chore:`, `refactor:`, `test:` prefixes (used by release script for changelog)
- **Manifest permission discipline** — see the next section. Every change to `manifest.json`'s `permissions` or `optional_permissions` MUST travel with a Section 4 update in the latest `docs/store-submissions/vX.Y.Z-chrome-web-store.md` in the **same commit**.

---

## Manifest Permission Discipline

Why this exists: in v9.2.0 we added the `idle` permission to `manifest.json` and shipped the package without adding its Section 4 justification to the submission doc. Chrome Web Store reviewers reject unexplained permissions. This discipline is the formal rule that prevents that class of slip from recurring.

### The Rule

Any commit that modifies `manifest.json`'s `permissions` array or `optional_permissions` array MUST also stage at least one file under `docs/store-submissions/*.md` in the same commit. The `#### \`<perm>\`` block(s) under Section 4 of the latest submission doc must be added (for new perms) or removed (for retired perms) to match the manifest.

### Enforcement (defense in depth)

| Layer | Where | What it does |
|-------|-------|--------------|
| Scaffolder | `npm run store init` | Computes the perm delta vs the previous version's manifest via `git show v<prev>:manifest.json` and injects a `PERMISSION DELTA` banner with fill-in-the-blank `+ \`<perm>\` *(new in vX.Y.Z)* — TODO: write justification.` lines into the new doc's preamble. |
| Pre-commit hook | `scripts/pre-commit-check.js` | Hard-fails the commit (exit 1, no build runs) when `manifest.json` perm arrays change vs HEAD and no `docs/store-submissions/*.md` file is staged in the same commit. |
| Store check | `npm run store check` | Audits manifest ↔ Section 4 parity. Reports `[fail]` with a per-perm breakdown of `MISSING` and `STALE` justifications. Used in CI and before every CWS upload. Also runs inline as part of `npm run ship check`. |

### Escape Hatch (NOT recommended)

`FORCE_PRE_COMMIT=1 git commit ...` bypasses the pre-commit gate. The hook prints a loud warning when bypassed AND a perm change is detected. Use only for emergency fixes — `npm run store check` will still fail until parity is restored, and Chrome Web Store will reject the upload.

### What "matching submission doc" means

For a release that has already shipped: edit that release's `docs/store-submissions/vX.Y.Z-chrome-web-store.md`.

For an in-flight release before tagging: edit the most recently created submission doc (whatever version `--init` last scaffolded).

When in doubt: edit the file with the highest version number under `docs/store-submissions/`. The `store check` audit always reads the file matching the current version reported by git tags.

---

## Maintenance Workflows (Claude Code Playbook)

This section is the primary workflow reference for Claude Code sessions. Load `.github/skills/maintenance/SKILL.md` for rollback procedures, manual testing checklists, and Chrome Web Store rejection handling.

### Bug Fix
1. Read the bug report — understand the symptom
2. Use the **Critical File Map** above to locate the relevant source file
3. Load the appropriate **domain skill** if the bug is in a complex area (search, AI, settings)
4. Make the **minimal fix** in `src/` — no refactoring, no unrelated changes
5. Run `npm test` — all 1,252+ unit tests must pass
6. Run `npm run build` — must succeed with zero errors
7. Commit: `git commit -m "fix: <concise description>"`
8. If shipping immediately: `npm run ship patch`

### New Feature
1. Understand the request — check if existing code can be extended
2. Load the relevant **domain skill** from `.github/skills/`
3. Plan the implementation (use Plan agent for non-trivial changes)
4. Implement following existing patterns (Logger, SettingsManager, isolated scorers)
4b. **If `manifest.json` permission changed:** stage the matching `docs/store-submissions/vX.Y.Z-chrome-web-store.md` Section 4 update in the SAME commit (see *Manifest Permission Discipline* above). The pre-commit hook will hard-fail the commit otherwise.
5. Write tests if touching core logic — target 90%+ coverage for new code
6. Run `npm test` and `npm run build`
7. Commit: `git commit -m "feat: <concise description>"`
8. If shipping: `npm run ship minor`

### Release + Chrome Web Store
```bash
npm run ship check                   # release readiness gate (audit + parity + LICENSE + privacy URL + prev tag)
npm run ship patch                   # or ship minor / ship major: bump, changelog, tag, push, GitHub Release, zip
npm run store check                  # final parity audit before CWS upload
```
Then:
1. Create/update `docs/store-submissions/vX.Y.Z-chrome-web-store.md` with full submission fields
2. Commit the submission doc: `git commit -m "docs: add Chrome Web Store submission record for vX.Y.Z"`
3. Upload the submission doc as a GitHub release attachment alongside the zip
4. Go to https://chrome.google.com/webstore/devconsole
5. Upload `release/zips/smruti-cortex-vX.Y.Z.zip`
6. Fill all fields using the submission doc as reference
7. Submit for review

### Security / Dependency Fix
1. Check `npm audit` output — identify the vulnerability
2. Update the dependency in `package.json`
3. Run `npm install` → `npm test` → `npm run build`
4. Commit: `git commit -m "fix: update <pkg> to address <CVE/issue>"`
5. If shipping: `npm run ship patch`

### Quick Patch (no deep context)
1. Grep for the error message or keyword in `src/`
2. Locate the issue using the file map above
3. Fix → `npm test` → commit → optionally release

### Semver
- `patch` — bug fixes, no API change
- `minor` — new features, backward compatible
- `major` — breaking changes
- No bump — `docs:`, `chore:`, `style:`, `test:` commits

---

## Test & Refactor Constitution

Hard rules that apply to **every** code change — human or AI. These are non-negotiable.

### Coverage
- **vitest hard floor**: 80 / 80 / 80 / 80 (lines / branches / functions / statements) — set well below current achievement (~96 / ~89 / ~95 / ~95) so routine commits don't fight a tightening gate. Catches only catastrophic regressions. Lowered from 95/90/95/95 in v9.3.0; raise back only if you want to enforce coverage growth.
- **Tiered ratchet** (`scripts/coverage-ratchet.mjs`): absolute floors of 70 / 80 / 90 (floor / target / goal). Only the **floor** can fail a build; target/goal tiers are informational. Override or add per-directory floors via `coverage-thresholds.json`. The ratchet is the active quality bar; vitest's gate is the safety net underneath it.
- Run `npm run coverage` before every commit. Run `node scripts/coverage-ratchet.mjs` (or `--per-file` for modulewise) to verify the tiers.
- See `.github/skills/coverage-policy/SKILL.md` for exclusion rules and characterization-test-first pattern.

### SOLID Architecture
- `service-worker.ts` is a thin bootstrap (<200 lines). Business logic lives in `handlers/`.
- Handlers depend on **port interfaces** (`src/background/ports/`), never on concrete implementations.
- Use `Result<T, E>` from `src/core/result.ts` for fallible operations — do not throw for expected failures.
- See `.github/skills/solid-design/SKILL.md` for the full architecture guide.

### Commit Discipline
- One logical change per commit. Always review `git diff --staged` before committing.
- Run `npm run coverage` + ratchet check before every commit.
- See `.github/skills/atomic-commits/SKILL.md` for the complete protocol.
