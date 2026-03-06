---
name: ui-components
description: Popup UI, quick-search overlay, Shadow DOM, two-phase search, port messaging
metadata:
  project: smruti-cortex
  version: "8.0"
---

# UI Components

## Two User Interfaces

### 1. Quick-Search Overlay (Content Script)

- **Trigger:** `Ctrl+Shift+S` on any regular web page
- **File:** `src/content_scripts/quick-search.ts`
- **Rendering:** Closed Shadow DOM injected into page (complete CSS isolation)
- **Performance:** < 50ms appearance (no service worker wake-up needed)
- **Search:** Port-based messaging (`chrome.runtime.connect()`) for 2-5ms latency
- **Debounce:** 150ms (`DEBOUNCE_MS`) before firing search

### 2. Extension Popup

- **Trigger:** Click toolbar icon, or `Ctrl+Shift+S` on special pages (chrome://, edge://)
- **Files:** `src/popup/popup.ts`, `popup.html`, `popup.css`
- **Contexts:** Opens as popup (600x600px), as tab (centered card), or via omnibox (`sc `)
- **Performance:** 200-800ms (popup attachment overhead)

Both UIs share rendering logic via `src/shared/search-ui-base.ts`.

## Key Files

| File | Purpose |
|------|---------|
| `src/content_scripts/quick-search.ts` | Overlay: Shadow DOM, keyboard nav, two-phase search |
| `src/popup/popup.ts` | Popup: search, settings modal, bookmarking |
| `src/popup/popup.html` | Popup HTML structure |
| `src/popup/popup.css` | Popup styles |
| `src/shared/search-ui-base.ts` | Shared: result rendering, HTML escaping, debounce utility |
| `src/content_scripts/extractor.ts` | Page metadata extraction (runs on page load) |

## Two-Phase Search Pattern

When AI is enabled, both UIs implement this:

```
User types -> 150ms debounce
  Phase 1: performSearch(query, skipAI=true)   // instant keyword results
  Phase 2: performSearch(query, skipAI=false)  // AI-expanded results (500ms+ delay)
```

Phase 1 results display immediately. Phase 2 replaces them when ready.
A spinner shows during Phase 2 (AI processing).

## Port-Based Messaging

Quick-search uses persistent ports for search (faster than one-shot `sendMessage`):

```typescript
searchPort = chrome.runtime.connect({ name: 'search' });
searchPort.postMessage({ query, skipAI: true });
searchPort.onMessage.addListener((response) => { /* render results */ });
```

Popup uses `chrome.runtime.sendMessage()` with `type: 'SEARCH_QUERY'`.

## Shadow DOM Isolation

Quick-search creates a closed Shadow DOM to prevent page CSS from affecting the overlay:

```typescript
const shadowHost = document.createElement('div');
const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
// All overlay HTML/CSS lives inside shadowRoot
```

## Settings Modal (Popup)

- Tab-based UI using `data-tab` attributes on `.settings-section` divs
- Tab bar buttons: `<button class="settings-tab" data-tab="tabname">`
- To add a setting to existing tab: add `data-tab="tabname"` to section
- To create new tab: add button in `.settings-tabs` + tag sections

## Key Patterns

- **Result rendering:** `renderResults()` in search-ui-base.ts (shared between popup/overlay)
- **Keyboard navigation:** Arrow keys move selection, Enter opens, Escape closes
- **Context recovery:** Auto-reconnect when extension context invalidates (e.g., extension update)
- **Pre-warming:** Service worker is pinged on visibility change to avoid cold starts
