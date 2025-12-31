# Copilot Instructions for SmrutiCortex

## Project Overview
SmrutiCortex is a Chrome Manifest V3 extension for ultra-fast, intelligent browser history search. It uses IndexedDB for local storage, a modular scorer system for ranking, and a service worker for background processing. The codebase is TypeScript-first and organized for maintainability and speed.

## Architecture & Key Components
- **src/background/**: Core background logic
  - `database.ts`: IndexedDB schema, storage quota info
  - `indexing.ts`: Real-time history indexing, mergeMetadata
  - `resilience.ts`: Self-healing, health monitoring, auto-recovery
  - `messaging.ts`: Message passing between extension parts
  - `search/`: Modular scoring system
    - `search-engine.ts`: Core search with literal substring matching & strict mode
    - `scorer-manager.ts`: Manages multiple scoring algorithms
    - `diversity-filter.ts`: URL normalization & duplicate filtering
    - `scorers/`: Individual scoring algorithms (title, URL, recency, frequency, metadata)
- **src/content_scripts/**: 
  - `extractor.ts`: Page metadata extraction with sensitive-site blacklist
  - `quick-search.ts`: Ultra-fast inline search overlay (< 50ms, no service worker wake-up)
- **src/core/**: Shared utilities, constants, logger, settings
- **src/popup/**: Search UI (HTML, CSS, TS) with settings modal
- **manifest.json**: Chrome extension manifest (MV3)

## Two UI Implementations
SmrutiCortex has **two distinct user interfaces**:

### 1. **Inline Overlay** (Content Script-Based)
- **Trigger**: `Ctrl+Shift+S` keyboard shortcut on regular web pages
- **Implementation**: Content script (`quick-search.ts`) with closed Shadow DOM
- **Appearance**: Centered modal overlay floating on top of the current page
- **Performance**: Ultra-fast (< 50ms) - no service worker wake-up needed
- **Context**: Runs directly in page context, always active
- **Use case**: Primary interface for instant search on any webpage

### 2. **Extension Popup** (Traditional Popup)
- **Trigger**: Clicking toolbar icon OR `Ctrl+Shift+S` on special pages (chrome://, edge://, about:, extension pages)
- **Implementation**: Standard Chrome extension popup (`popup.html`)
- **Appearance**: Dropdown attached to toolbar icon (constrained 600x600px when popup, centered card when opened as tab)
- **Performance**: Slower (200-800ms) due to popup attachment overhead
- **Context**: Chrome extension context
- **Use case**: Fallback for pages where content scripts cannot run, settings access, bookmarking

**Note**: The same `popup.html` can be opened in three contexts:
1. As a popup (attached to toolbar) - 600x600px constrained
2. As a tab (via settings button) - centered card with backdrop
3. Via omnibox (`sc ` in address bar) - popup mode

## Performance Philosophy
- **Content script-first**: `quick-search.ts` runs in page context for instant keyboard shortcuts (< 50ms, no service worker wake-up)
- **Shadow DOM isolation**: Complete style isolation from page CSS
- **Port-based messaging**: `chrome.runtime.connect()` for faster search (2-5ms vs 5-15ms one-shot)
- **Self-healing architecture**: Auto-recovery, health monitoring every 60s
- **Service worker pre-warming**: Ping on visibility change to eliminate cold starts
- **requestIdleCallback**: Pre-create overlay during browser idle for instant appearance
- **Non-blocking init**: Logger and Settings use async init to avoid blocking popup load
- **Module-level listeners**: Command listeners registered at load time, before async init
- **Lazy loading**: Heavy imports are loaded on-demand, not at startup
- **Module-level listeners**: Command listeners registered at module load time, before async init

## Developer Workflow
- **Install dependencies:** `npm install`
- **Build extension:** `npm run build` (outputs to `dist/`)
- **Clean build artifacts:** `npm run clean`
- **Lint:** `npm run lint`
- **Test:** `npm run test` (if available)
- **Load in Chrome:** Use `chrome://extensions` > "Load unpacked" > select `dist/`

## Patterns & Conventions
- **TypeScript everywhere**; avoid JS in new code
- **Modular scoring:** Add new scorers in `src/assets/background/search/scorers/` and register in `index.ts`
- **Message passing:** Use `messaging.ts` for communication between popup, background, and content scripts
- **Settings/constants:** Centralized in `src/core/settings.ts` and `constants.ts`
- **Debug logging:** Use `logger.ts`; toggle via popup UI
- **Popup UI:** Keep UI logic in `popup.ts`, styles in `popup.css`, and structure in `popup.html`

## Integration Points
- **Browser APIs:** IndexedDB, chrome.history, chrome.runtime messaging
- **No backend/server**; all data is local

## Examples
- To add a new scoring algorithm: create a file in `scorers/`, export a scorer, and add it to `index.ts`
- To add a new popup feature: update `popup.ts` and `popup.html`, style in `popup.css`

## References
- See [README.md](../README.md) for features and install
- See [TESTING_and_DEBUG_GUIDE.md](../TESTING_and_DEBUG_GUIDE.md) for build, test, and debug steps
- See [project-structure.txt](../project-structure.txt) for file layout

---
**Keep instructions concise and up-to-date. Update this file if project structure or workflows change.**
