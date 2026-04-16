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
| IndexedDB layer | `src/background/database.ts` |
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

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm test` | Run full unit test suite (1,233+ tests, 46 files) | ~60s |
| `npx playwright test` | Run E2E tests (45 tests, 7 specs, requires `npm run build:prod` first) | ~60s |
| `npm run test:e2e:slowmo` | E2E tests in slow-mo (sets `SLOW_MO` reliably on Windows) | ~5min |
| `npx vitest run --coverage --pool=forks` | Unit tests + v8 coverage report | ~30s |
| `npm run lint` | ESLint check | ~5s |
| `npm run build:prod` | Production build (minified) | ~30s |
| `npm run build:dev` | Dev build (source maps) | ~10s |
| `npm run package` | Build + zip for Chrome Web Store | ~35s |
| `npm run verify` | Full codebase verification (runs ALL steps, reports at end) | ~8min |
| `npm run verify -- --no-e2e` | Same as verify but skips E2E tests | ~2min |
| `npm run preflight` | Pre-release check: verify + prod release validations | ~10min |
| `npm run release:patch` | Full release pipeline (patch bump) | ~60s |
| `npm run release:minor` | Full release pipeline (minor bump) | ~60s |
| `npm run release:major` | Full release pipeline (major bump) | ~60s |
| `npm run release:patch:dry` | Dry-run: preview a patch release without pushing | ~30s |
| `npm version patch\|minor\|major` | Quick version bump only (syncs manifest.json, commits, tags) | instant |
| `npm run store-prep` | Print Chrome Web Store submission text | instant |

**Note:** Pre-commit hook (`scripts/pre-commit-check.js`) runs build+test+coverage for product files. Skips for docs-only changes. Override with `FORCE_PRE_COMMIT=1`.

---

## Scripts Quick Reference

Quick-reference for the build/release scripts. Useful if you come back after 6 months.

### `npm run verify` (`scripts/verify.mjs`)
**What:** Runs lint → build:dev → build:prod → unit tests with coverage → E2E tests.
**Key behavior:** Runs ALL steps even if one fails, then shows a summary table at the end so you can fix everything in one go. Pass `--no-e2e` to skip the 5-minute E2E suite.
**When to use:** After big changes, before merging, or whenever you want full confidence.

### `npm run preflight` (`scripts/preflight.mjs`)
**What:** Runs `npm run verify` first, then adds production release checks:
- **Version sync** — confirms `package.json` and `manifest.json` have the same version (they can drift if you manually edit one)
- **Manifest MV3 validation** — confirms `manifest_version: 3`, name/description present, required permissions (`history`, `storage`, `activeTab`, `tabs`) are declared
- **dist/ integrity** — no underscore directories (Chrome MV3 rejects `_` dirs), all 6 critical output files exist
- **Package zip** — creates the `release/smruti-cortex-vX.Y.Z.zip` ready to upload
- **Git status** — warns if working tree is dirty or you're not on `main`
- **Store prep preview** — prints the "What's New" text, permission justifications, and privacy summary
**When to use:** Right before running `release.mjs`. This is your "are we cleared for takeoff?" check.

### `npm run release:patch/minor/major` (`scripts/release.mjs`)
**What:** Fully automated release pipeline:
1. Validates: must be on `main`, clean tree, `gh` CLI installed
2. Bumps version in `package.json` (e.g. 9.0.0 → 9.1.0)
3. Syncs version to `manifest.json` via `sync-version.mjs`
4. Generates changelog from git commit history (grouped by `feat:`, `fix:`, etc.)
5. Runs tests and prod build (aborts and reverts if either fails)
6. Commits `package.json` + `manifest.json` + `CHANGELOG.md`
7. Creates git tag `vX.Y.Z`
8. Pushes commit and tag to origin
9. Creates GitHub Release with changelog notes
10. Packages zip for Chrome Web Store upload

**Convenience scripts:**
- `npm run release:patch` / `release:minor` / `release:major` — real release
- `npm run release:patch:dry` / `release:minor:dry` / `release:major:dry` — preview without pushing

You can also call `node scripts/release.mjs <type> [--dry-run]` directly.

### `npm run store-prep` (`scripts/store-prep.mjs`)
**What:** Generates copy-paste text for Chrome Web Store submission:
- "What's New" text (≤500 chars, extracted from `CHANGELOG.md`)
- Permission justifications (one-liner for each permission explaining why it's needed)
- Privacy summary (all data local, no telemetry, etc.)
- Upload path for the zip file
**When to use:** After `release.mjs`, when you're filling out the Chrome Web Store submission form.

### `scripts/sync-version.mjs` + npm version lifecycle hooks
**What:** Copies the version string from `package.json` → `manifest.json`. `package.json` is the single source of truth for version numbers.

**Two paths keep versions in sync (Tier 3 with Tier 2 fallback):**
- **Tier 3 (npm lifecycle):** Running `npm version patch/minor/major` triggers the `version` hook in `package.json`, which calls `sync-version.mjs` and stages `manifest.json` — both files are committed together automatically by npm.
- **Tier 2 (build-time fallback):** `sync-version.mjs` also runs at the start of every `npm run build` and `npm run build:prod`, so even if `npm version` is bypassed, the next build catches any drift.

**Quick bump (no full release):** `npm version patch` — bumps both files, commits, and tags. Does NOT push, build, or create a GitHub Release. Use `npm run release:*` for the full pipeline.

### Pre-commit hook (`scripts/pre-commit-check.js`)
**What:** Runs automatically on every `git commit`:
1. Detects staged files — skips if only docs/config changed
2. ESLint auto-fix on staged `.ts` files
3. Build (dev) — blocking
4. Build (prod) — blocking
5. Unit tests with coverage — non-blocking (warns but doesn't block)
**Override:** `FORCE_PRE_COMMIT=1 git commit ...` to force checks even for docs-only changes.

---

## Domain Skills (On-Demand Context)

Load `.github/skills/<name>/SKILL.md` for deep domain knowledge:

| Skill | Load when... |
|-------|-------------|
| `search-engine` | Changing scorers, tokenizer, or ranking logic |
| `ai-ollama` | Working on AI expansion, embeddings, circuit breaker |
| `ui-components` | Touching popup, quick-search overlay, Shadow DOM |
| `command-palette` | Adding/changing palette commands, prefix modes, web search engines |
| `testing` | Writing or fixing tests |
| `settings` | Changing any setting key, default, or validation |
| `workflows-ci` | Modifying GitHub Actions or Docker |
| `test-generation` | Generating new test files (full rules + mock patterns) |
| `maintenance` | Bug fixes, releases, Chrome Web Store submissions |

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
- **Build is slow:** `npm run build:prod` takes ~30s + pre-commit hook adds another run on commit. Verify logic via `npm test` first.
- **Chrome APIs require mocking:** jsdom has no `chrome.*`. Every test that touches Chrome APIs must mock them. See `.github/skills/testing/SKILL.md` patterns.
- **90%+ line coverage:** 1,233+ unit tests across 46 test files + 45 Playwright E2E tests across 7 spec files. See `.github/copilot/test-generation-instructions.md` for mock patterns.
- **Shared test utilities:** `src/__test-utils__/` provides composable Chrome API mocks, Logger/Settings mocks, data factories, and lifecycle helpers — use these instead of inline mocks.
- **E2E tests need a build:** Playwright loads the built extension from `dist/`. Run `npm run build:prod` before `npx playwright test`. See `docs/E2E_TESTING.md` for fixture architecture and troubleshooting.
- **Underscore-dir guardrail:** Chrome MV3 forbids directories starting with `_` in extensions. `tsconfig.json` excludes `src/**/__test-utils__/**` and `scripts/copy-static.mjs` post-build sweep removes any that leak through.

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

---

## Maintenance Workflows (Claude Code Playbook)

This section is the primary workflow reference for Claude Code sessions. Load `.github/skills/maintenance/SKILL.md` for rollback procedures, manual testing checklists, and Chrome Web Store rejection handling.

### Bug Fix
1. Read the bug report — understand the symptom
2. Use the **Critical File Map** above to locate the relevant source file
3. Load the appropriate **domain skill** if the bug is in a complex area (search, AI, settings)
4. Make the **minimal fix** in `src/` — no refactoring, no unrelated changes
5. Run `npm test` — all 1,233+ unit tests must pass
6. Run `npm run build:prod` — must succeed with zero errors
7. Commit: `git commit -m "fix: <concise description>"`
8. If shipping immediately: `npm run release:patch`

### New Feature
1. Understand the request — check if existing code can be extended
2. Load the relevant **domain skill** from `.github/skills/`
3. Plan the implementation (use Plan agent for non-trivial changes)
4. Implement following existing patterns (Logger, SettingsManager, isolated scorers)
5. Write tests if touching core logic — target 90%+ coverage for new code
6. Run `npm test` and `npm run build:prod`
7. Commit: `git commit -m "feat: <concise description>"`
8. If shipping: `npm run release:minor`

### Release + Chrome Web Store
```bash
npm run release:patch   # or release:minor / release:major
npm run store-prep      # prints: What's New, permissions, privacy summary
```
Then:
1. Create/update `docs/store-submissions/vX.Y.Z-chrome-web-store.md` with full submission fields
2. Commit the submission doc: `git commit -m "docs: add Chrome Web Store submission record for vX.Y.Z"`
3. Upload the submission doc as a GitHub release attachment alongside the zip
4. Go to https://chrome.google.com/webstore/devconsole
5. Upload `release/smruti-cortex-vX.Y.Z.zip`
6. Fill all fields using the submission doc as reference
7. Submit for review

### Security / Dependency Fix
1. Check `npm audit` output — identify the vulnerability
2. Update the dependency in `package.json`
3. Run `npm install` → `npm test` → `npm run build:prod`
4. Commit: `git commit -m "fix: update <pkg> to address <CVE/issue>"`
5. If shipping: `npm run release:patch`

### Quick Patch (no deep context)
1. Grep for the error message or keyword in `src/`
2. Locate the issue using the file map above
3. Fix → `npm test` → commit → optionally release

### Semver
- `patch` — bug fixes, no API change
- `minor` — new features, backward compatible
- `major` — breaking changes
- No bump — `docs:`, `chore:`, `style:`, `test:` commits
