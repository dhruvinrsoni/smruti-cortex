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

## Toolbar Chips (registry-driven)

Both UIs iterate `TOOLBAR_TOGGLE_DEFS` from `src/shared/toolbar-toggles.ts` to build the chip row above the input:

- **Popup:** `renderToggleBar()` / `syncToggleBar()` in `popup.ts` bind clicks to `SettingsManager.setSetting()`.
- **Quick-search:** `renderQSToggleBar()` / `syncQSToggleBar()` in `quick-search.ts` bind clicks to `SETTINGS_CHANGED` messages.

### Disabled chip pattern — `requires`

Some settings only make sense when another setting is on. Example: `embeddingsEnabled` (Semantic search) needs `ollamaEnabled` (AI / Ollama) because semantic scoring is backed by Ollama embeddings.

To express that, add a `requires` field to the chip definition:

```ts
{
  key: 'embeddingsEnabled',
  type: 'boolean',
  icon: '🧠',
  label: 'Semantic',
  tooltipOn: 'Semantic search ON (embeddings boost ranking)',
  tooltipOff: 'Semantic search OFF',
  requires: 'ollamaEnabled',
  disabledTooltip: 'Turn on AI (Ollama) first to use Semantic search',
  disabledToast: 'Enable AI first — Semantic needs Ollama for embeddings.',
}
```

Behavior the renderers implement (mirror in both `popup.ts` and `quick-search.ts`):

1. **Sync:** `evaluateChipDisabled(def, settings)` returns true when `requires` is set and falsy. Apply `.toggle-chip.disabled` + `aria-disabled="true"` and use `disabledTooltip` as the title. Do not apply `.active` while disabled.
2. **Click:** if disabled, call `showToast(def.disabledToast, 'warning')` and return early — do NOT flip `def.key`.
3. **Recovery:** when the prerequisite flips, `applyPopupSettingSideEffects` / `applySettingSideEffects` call `sync*ToggleBar()`, so the chip re-enables automatically.

### Opt-in chips

Don't add a new chip to `DEFAULT_TOOLBAR_TOGGLES` unless it's useful to every user. Opt-in chips (like Semantic) show up in Settings → Toolbar so power users can pin them. Tests: `src/shared/__tests__/toolbar-toggles.test.ts` locks both the registry shape and the opt-in invariant; `e2e/semantic-chip.spec.ts` exercises the full disabled-click-toast-enable flow.

## Report Chooser Modal (shared dialog)

The Report button in the popup footer and the quick-search overlay footer both open the **same** three-option masking chooser before generating and copying the ranking-bug report. Keeping the markup, labels, and timings in one place means the two surfaces never drift.

### Single source of truth

| File | Owns |
|------|------|
| `src/shared/report-chooser-utils.ts` | `MASKING_OPTIONS` (3-entry list, ordered `none → partial → full`), `STAGE_TIMINGS` (minGen / minCopy / successHold / errorHold), `waitRemaining(startMs, minMs)` helper |
| `src/shared/report-chooser-modal.ts` | `buildReportChooser(document, callbacks, styles?)` — pure DOM builder that returns `{ root, dialog, optionButtons, cancelButton, defaultFocusButton, dispose }`. Does NOT attach to the DOM; the caller picks the mount point. Escape, backdrop click, and Cancel all dispose and call `onCancel`. Clicking an option disposes and calls `onPick(level)` exactly once. |
| `src/shared/data-masker.ts` | The three-level masking contract (table at the top of the file). The chooser's `MaskingLevel` labels MUST match this contract. |

### Call sites (both run the same staged flow)

- **Popup** — `showReportChooser({ onPick, onCancel })` in `popup.ts` mounts the handle to `document.body` and focuses `handle.defaultFocusButton` (the "Partial" row). Click handler on `.report-ranking-btn` opens the chooser, then runs `Generating… → Copying… → Copied!` / `Filed & Copied!` / `Error` with `STAGE_TIMINGS` minimum durations.
- **Quick-search overlay** — `showOverlayReportChooser` + `runOverlayReportFlow(btn, level)` in `quick-search.ts` mount the handle to `shadowRoot.querySelector('.container')` (absolute positioning, scoped backdrop) using the shadow-friendly `--bg-container` / `--text-primary` / `--text-secondary` CSS tokens. Same staged flow, same minimum durations.

### Staged visual cue

Both UIs call `waitRemaining(tStart, minMs)` after each SW round-trip so fast responses still produce a perceivable UI transition. Pulse keyframes are injected once per surface (`ensureReportPulseStyle()` in each file) and the `.report-ranking-btn.pulsing` class toggles during the generating/copying phases.

### Clipboard

The report body is copied to the clipboard on **every** success path (both `api` and `url` methods), so the user always walks away with the text to paste. If the method is `url`, the existing `showReportConfirmation` dialog also opens with the GitHub issue URL.

### Tests

- `src/shared/__tests__/report-chooser-utils.test.ts` — locks option ordering, timing invariants, `waitRemaining` behavior under fake timers.
- `src/shared/__tests__/report-chooser-modal.test.ts` — locks DOM structure, focus default, pick / cancel / Escape / backdrop-click, listener cleanup on dispose.
- `e2e/report-button.spec.ts` — end-to-end: open popup, search, click Report, assert the 3-option modal renders, pick "Strictest", verify the staged button text transitions, and assert the clipboard contents reflect the `full` masking level (no raw query, no raw tokens).

### When to edit

- **Change a label or description:** edit `MASKING_OPTIONS` only. Both UIs, both unit tests, and the E2E spec re-read from it.
- **Change a stage duration:** edit `STAGE_TIMINGS` only.
- **Change masking output for a level:** edit `src/shared/data-masker.ts` + `src/background/ranking-report.ts` together. The gradient-lock tests in `ranking-report.test.ts` will fail loudly if the change breaks the contract.
