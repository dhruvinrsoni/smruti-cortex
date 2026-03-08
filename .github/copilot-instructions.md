# SmrutiCortex — Copilot Instructions

> Full project context, file map, and efficiency rules: see `CLAUDE.md`.

## Skills (On-Demand Context)

Load the relevant skill file from `.github/skills/<name>/SKILL.md` for detailed instructions.

| Skill | When to load | Description |
|-------|-------------|-------------|
| `search-engine` | Modifying search, scoring, ranking | Vivek Search algorithm, 9-scorer pipeline, tokenizer |
| `ai-ollama` | AI features, embeddings, Ollama | Keyword expansion, semantic search, circuit breaker |
| `workflows-ci` | CI/CD, Docker, GitHub Actions | Build/security/performance workflows, Dockerfile |
| `ui-components` | Popup, quick-search, UI changes | Shadow DOM overlay, two-phase search, port messaging |
| `testing` | Writing or fixing tests | Vitest config, chrome API mocks, test patterns |
| `settings` | Settings, storage, preferences | SettingsManager schema, validation, storage layer |
| `test-generation` | Generating tests for any file | Full test rules, mock patterns, coverage table |

Test generation instructions: `.github/copilot/test-generation-instructions.md`

## Copilot Agents

| Agent | Usage | Description |
|-------|-------|-------------|
| `test-coverage-agent` | `@test-coverage-agent create tests for <path>` | Generates Vitest tests following test-generation instructions |

Agent definitions: `.github/copilot/agents/`

## Key Conventions

- TypeScript everywhere; no new JS files
- Settings: single source of truth in `SETTINGS_SCHEMA` (`src/core/settings.ts`)
- Logging: use `Logger.forComponent('Name')`, never raw `console.log`
- Build: `npm run build:prod` = sync-version + clean + tsc + copy-static + esbuild
- Load in browser: `chrome://extensions` > Load unpacked > select `dist/`
