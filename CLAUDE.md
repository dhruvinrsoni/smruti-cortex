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
| All test files | `src/**/__tests__/*.test.ts` |
| Vitest config | `vitest.config.ts` |
| Build scripts | `scripts/esbuild-*.mjs` |

---

## Common Commands

| Command | Purpose | Speed |
|---------|---------|-------|
| `npm test` | Run full test suite (980+ tests, 34 files) | ~28s |
| `npx vitest run --coverage --pool=forks` | Tests + v8 coverage report | ~30s |
| `npm run lint` | ESLint check | ~5s |
| `npm run build:prod` | Production build (minified) | ~30s |
| `npm run build:dev` | Dev build (source maps) | ~10s |
| `npm run package` | Build + zip for Chrome Web Store | ~35s |
| `node scripts/release.mjs <patch\|minor\|major>` | Full release: bump, changelog, tag, push, GitHub Release, zip | ~60s |
| `node scripts/store-prep.mjs` | Print Chrome Web Store submission text | instant |

**Note:** Pre-commit hook (`scripts/pre-commit-check.js`) runs build+test for product files. Skips for docs-only changes. Override with `FORCE_PRE_COMMIT=1`.

---

## Domain Skills (On-Demand Context)

Load `.github/skills/<name>/SKILL.md` for deep domain knowledge:

| Skill | Load when... |
|-------|-------------|
| `search-engine` | Changing scorers, tokenizer, or ranking logic |
| `ai-ollama` | Working on AI expansion, embeddings, circuit breaker |
| `ui-components` | Touching popup, quick-search overlay, Shadow DOM |
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
- **90%+ line coverage:** 980+ tests across 34 test files. See `.github/copilot/test-generation-instructions.md` for mock patterns.

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
5. Run `npm test` — all tests must pass (980+)
6. Run `npm run build:prod` — must succeed with zero errors
7. Commit: `git commit -m "fix: <concise description>"`
8. If shipping immediately: `node scripts/release.mjs patch`

### New Feature
1. Understand the request — check if existing code can be extended
2. Load the relevant **domain skill** from `.github/skills/`
3. Plan the implementation (use Plan agent for non-trivial changes)
4. Implement following existing patterns (Logger, SettingsManager, isolated scorers)
5. Write tests if touching core logic — target 90%+ coverage for new code
6. Run `npm test` and `npm run build:prod`
7. Commit: `git commit -m "feat: <concise description>"`
8. If shipping: `node scripts/release.mjs minor`

### Release + Chrome Web Store
```bash
node scripts/release.mjs <patch|minor|major>   # automated: bump, changelog, tag, push, GitHub Release, zip
node scripts/store-prep.mjs                     # prints: What's New, permissions, privacy summary
```
Then manually:
1. Go to https://chrome.google.com/webstore/devconsole
2. Upload `release/smruti-cortex-vX.Y.Z.zip`
3. Paste "What's New" text from store-prep output
4. Submit for review

### Security / Dependency Fix
1. Check `npm audit` output — identify the vulnerability
2. Update the dependency in `package.json`
3. Run `npm install` → `npm test` → `npm run build:prod`
4. Commit: `git commit -m "fix: update <pkg> to address <CVE/issue>"`
5. If shipping: `node scripts/release.mjs patch`

### Quick Patch (no deep context)
1. Grep for the error message or keyword in `src/`
2. Locate the issue using the file map above
3. Fix → `npm test` → commit → optionally release

### Semver
- `patch` — bug fixes, no API change
- `minor` — new features, backward compatible
- `major` — breaking changes
- No bump — `docs:`, `chore:`, `style:`, `test:` commits
