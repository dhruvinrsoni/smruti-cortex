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
| `npm test` | Run all 131 tests | ~15s |
| `npx vitest run --coverage` | Tests + v8 coverage report | ~20s |
| `npm run lint` | ESLint check | ~5s |
| `npm run build:prod` | Production build (minified) | ~30s |
| `npm run build:dev` | Dev build (source maps) | ~10s |
| `npm run package` | Build + zip for Chrome Web Store | ~35s |

**Note:** Husky runs `build:prod` on every `git commit` (pre-commit hook). This is intentional and cannot be skipped without `--no-verify`.

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
- **Tests run fast:** `npm test` finishes in ~15s. Always run after code changes before committing.
- **Build is slow:** `npm run build:prod` takes ~30s + husky adds another run on commit. Don't trigger unnecessarily — verify logic via `npm test` first.
- **Chrome APIs require mocking:** jsdom has no `chrome.*`. Every test that touches Chrome APIs must mock them. See `.github/skills/testing/SKILL.md` patterns.
- **38 source files, 7 test files:** Most source files are untested. See `.github/copilot/test-generation-instructions.md` for the full coverage priority table.

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
