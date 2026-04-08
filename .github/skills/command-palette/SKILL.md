---
name: command-palette
description: Prefix-based command palette architecture, command registry, web search module
metadata:
  project: smruti-cortex
  version: "8.2"
---

# Command Palette

## Architecture

The command palette transforms the quick-search overlay (and optionally popup) into a prefix-based browser control surface. Typing a prefix character activates a mode instead of searching history.

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/command-registry.ts` | All palette commands, tier definitions, matching, execution helpers |
| `src/shared/web-search.ts` | `??` prefix: engine definitions, URL builders, prefix parsing |
| `src/shared/palette-messages.ts` | Toast formatting for diagnostic messages from palette commands |
| `src/core/settings.ts` | 8 palette-related settings in `SETTINGS_SCHEMA` |
| `src/content_scripts/quick-search.ts` | Palette UI rendering and execution in overlay |
| `src/popup/popup.ts` | Palette UI rendering and execution in popup |
| `src/background/service-worker.ts` | Message handlers for advanced browser commands |
| `src/popup/popup.html` | Settings tab for palette config, per-mode toggles |

## Prefix Modes

| Prefix | Mode | Tier | Description |
|--------|------|------|-------------|
| `/` | Commands | everyday | Toggle settings, page actions, navigation |
| `>` | Power | power | Admin: rebuild index, clear data, diagnostics, factory reset |
| `@` | Tabs | -- | Switch between open tabs and recently closed |
| `#` | Bookmarks | -- | Search and open bookmarks with folder paths |
| `??` | Web Search | -- | Google, YouTube, GitHub, GCP, Jira, Confluence |
| `?` | Help | -- | Shows all available prefix modes |

## Command Registry (`src/shared/command-registry.ts`)

### PaletteCommand Interface

Each command is defined with:

```typescript
interface PaletteCommand {
  id: string;
  label: string;
  icon: string;
  hint?: string;
  category: string;
  tier: 'everyday' | 'power';
  shortcut?: string;
  dangerous?: boolean;
  messageType?: string;          // SW message to send
  settingsKey?: keyof AppSettings; // setting to toggle
  url?: string;                  // URL to open
  requiresPermission?: string;   // optional permission gate
}
```

### Key Exports

- `ALL_COMMANDS` -- array of all registered commands
- `getAvailableCommands(settings, tier)` -- filters by tier and permission state
- `preparePaletteCommandList(commands, query)` -- fuzzy-match and sort
- `getPowerSettingsPatch(cmd)` -- derive settings patch for toggle commands
- `getCycleValueFromCommand(cmd, current)` -- cycle through multi-value settings
- `saveRecentCommand(id)` / `getRecentCommands()` -- recent command persistence

### Adding a New Command

1. Add entry to `ALL_COMMANDS` array in `command-registry.ts`
2. Set `tier: 'everyday'` or `tier: 'power'`
3. If it sends a message to the service worker: set `messageType`
4. If it toggles a setting: set `settingsKey`
5. If it needs optional permissions: set `requiresPermission` and add the SW handler
6. The UI (quick-search and popup) automatically picks it up from the registry

## Web Search (`src/shared/web-search.ts`)

### Engine Prefixes

| Prefix | Engine | URL Pattern |
|--------|--------|-------------|
| `g` | Google | `google.com/search?q=` |
| `y` | YouTube | `youtube.com/results?search_query=` |
| `gh` | GitHub | `github.com/search?q=` |
| `gc` | GCP Console | `console.cloud.google.com/search?q=` |
| `j` | Jira | `{jiraSiteUrl}/secure/QuickSearch.jspa?searchString=` |
| `c` | Confluence | `{confluenceSiteUrl}/dosearchsite.action?queryString=` |

### Key Functions

- `parseWebSearchQuery(raw)` -- extracts prefix and query from user input
- `buildWebSearchUrl(parsed, settings)` -- builds full URL with engine resolution
- `getWebSearchPrefixHintLines()` -- returns hint lines for help display

## Settings (8 keys)

| Setting | Type | Default |
|---------|------|---------|
| `commandPaletteEnabled` | boolean | `true` |
| `commandPaletteModes` | string[] | `['/', '>', '@', '#', '??']` |
| `commandPaletteInPopup` | boolean | `false` |
| `commandPaletteOnboarded` | boolean | `false` |
| `webSearchEngine` | string | `'google'` |
| `jiraSiteUrl` | string | `''` |
| `confluenceSiteUrl` | string | `''` |
| `advancedBrowserCommands` | boolean | `false` |

## Advanced Browser Commands

Gated behind `advancedBrowserCommands` setting + optional permissions prompt.

- Tab management: close other tabs, close tabs left/right, close all, discard, sort, close duplicates
- Window management: move tab to new window, merge all windows
- Tab groups: group/ungroup tab, name group, color group, collapse/expand, close group
- Browsing data: clear cache, cookies, last hour
- Misc: scroll to top/bottom, pin/unpin, mute/unmute, Top Sites

All handlers are in `src/background/service-worker.ts` as `chrome.runtime.onMessage` cases.

## Testing

| Test File | Coverage |
|-----------|----------|
| `src/shared/__tests__/command-registry-core.test.ts` | Core registry: matching, tiers, cycle values |
| `src/shared/__tests__/command-registry-advanced-browser.test.ts` | Advanced browser commands availability |
| `src/shared/__tests__/web-search.test.ts` | URL building, prefix parsing, engine resolution |
| `src/shared/__tests__/palette-messages.test.ts` | Toast formatting, message type detection |
| `src/background/__tests__/service-worker.test.ts` | All SW message handlers including advanced commands |
