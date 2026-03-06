---
name: settings
description: SettingsManager architecture, schema-driven validation, storage layer
metadata:
  project: smruti-cortex
  version: "8.0"
---

# Settings

## Architecture

Settings use a **schema-driven single source of truth** pattern.
Adding a new setting = one entry in `SETTINGS_SCHEMA`. That's it.

## Key Files

| File | Purpose |
|------|---------|
| `src/core/settings.ts` | `SettingsManager` class, `AppSettings` interface, `SETTINGS_SCHEMA` |
| `src/background/database.ts` | Low-level `getSetting()` / `setSetting()` via chrome.storage.local |
| `src/popup/popup.ts` | Settings modal UI (reads/writes via SettingsManager) |

## SettingsManager (`src/core/settings.ts`)

- **Singleton:** Static class, initialized once at service worker startup
- **Init:** `await SettingsManager.init()` -- loads from chrome.storage.local, falls back to defaults
- **Read:** `SettingsManager.getSetting('ollamaEnabled')` -- synchronous after init
- **Write:** `SettingsManager.updateSetting('ollamaEnabled', true)` -- persists to storage
- **Bulk:** `SettingsManager.getSettings()` returns full `AppSettings` object

## SETTINGS_SCHEMA

Each setting is defined with:

```typescript
interface SettingSchema<T> {
  default: T;                    // Default value
  validate?: (value: any) => boolean;  // Optional validation
  transform?: (value: any) => T;       // Optional type coercion
}
```

## Current Settings

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `displayMode` | `'list' \| 'cards'` | `'list'` | Result display mode |
| `logLevel` | number | 2 | Logger verbosity |
| `highlightMatches` | boolean | true | Highlight matching text |
| `focusDelayMs` | number | 450 | Auto-focus delay to results |
| `selectAllOnFocus` | boolean | false | Select all on Tab-return |
| `ollamaEnabled` | boolean | false | AI keyword expansion |
| `ollamaEndpoint` | string | `http://localhost:11434` | Ollama API URL |
| `ollamaModel` | string | `llama3.2:1b` | Keyword expansion model |
| `ollamaTimeout` | number | 30000 | Ollama call timeout (ms) |
| `aiSearchDelayMs` | number | 500 | Phase 2 debounce (ms) |
| `embeddingsEnabled` | boolean | false | Semantic search |
| `embeddingModel` | string | `nomic-embed-text:latest` | Embedding model |
| `loadFavicons` | boolean | true | Fetch favicons |
| `sensitiveUrlBlacklist` | string[] | [] | Domains to skip extraction |
| `indexBookmarks` | boolean | true | Include bookmarks in index |
| `showDuplicateUrls` | boolean | false | Show URL variants |
| `showNonMatchingResults` | boolean | false | Show non-matching results |
| `sortBy` | string | `'best-match'` | Sort order |
| `defaultResultCount` | number | 50 | Initial results on popup open |
| `theme` | string | `'auto'` | UI theme |
| `maxResults` | number | 100 | Max search results |

## Adding a New Setting

1. Add the field to `AppSettings` interface in `src/core/settings.ts`
2. Add an entry to `SETTINGS_SCHEMA` with `default` (and optional `validate`/`transform`)
3. Use `SettingsManager.getSetting('myNewSetting')` in code
4. If user-facing: add UI control in popup settings modal (`popup.html` + `popup.ts`)

## Storage Layer

- Settings persist in `chrome.storage.local` (survives extension updates)
- IndexedDB stores the pages index (separate from settings)
- `database.ts` provides `getSetting<T>(key, default)` and `setSetting<T>(key, value)` for raw access
