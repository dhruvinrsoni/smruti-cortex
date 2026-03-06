# SmrutiCortex

Chrome Manifest V3 extension for instant browser history search with optional local AI.
100% private, zero cloud. All data stays in IndexedDB on the user's machine.

## Tech Stack

- **Runtime:** Node 22 | TypeScript | esbuild (bundler) | Vitest (tests)
- **Extension:** Chrome MV3 service worker + content scripts + popup
- **Storage:** IndexedDB (pages index), chrome.storage.local (settings)
- **AI (optional):** Ollama -- keyword expansion (llama3.2:1b) + semantic embeddings (nomic-embed-text)

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run build:prod` | Production build to `dist/` |
| `npm run build:dev` | Development build (no minification) |
| `npm run lint` | ESLint check |
| `npm test` | Vitest test suite |
| `npm run clean` | Remove `dist/` |
| `npm run package` | Build + zip for Chrome Web Store |

## Project Structure

```
src/
  background/       Service worker, database, indexing, search engine
    search/         Vivek Search: scorers, tokenizer, diversity filter
  content_scripts/  Page extractor + quick-search overlay
  core/             Shared: logger, settings, constants, helpers
  popup/            Extension popup UI (HTML/CSS/TS)
```

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

## Key Conventions

- TypeScript everywhere; no new JS files
- Settings: single source of truth in `SETTINGS_SCHEMA` (`src/core/settings.ts`)
- Logging: use `Logger.forComponent('Name')`, never raw `console.log`
- Build: `npm run build:prod` = sync-version + clean + tsc + copy-static + esbuild
- Load in browser: `chrome://extensions` > Load unpacked > select `dist/`
