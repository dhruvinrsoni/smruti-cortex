# Copilot Instructions for SmrutiCortex

## Project Overview
SmrutiCortex is a Chrome Manifest V3 extension for ultra-fast, intelligent browser history search. It uses IndexedDB for local storage, a modular scorer system for ranking, and a service worker for background processing. The codebase is TypeScript-first and organized for maintainability and speed.

## Architecture & Key Components
- **src/background/**: Core background logic, including:
  - `database.ts`: IndexedDB schema and access
  - `indexing.ts`: Real-time history indexing
  - `messaging.ts`: Message passing between extension parts
  - `search/`: Modular scoring system (see `scorer-manager.ts`, `search-engine.ts`, and `scorers/`)
- **src/content_scripts/**: 
  - `extractor.ts`: Page metadata extraction
  - `quick-search.ts`: **Ultra-fast inline search overlay** (bypasses service worker wake-up delays)
- **src/core/**: Shared utilities, constants, logger, and settings
- **src/popup/**: UI for search popup (HTML, CSS, TS)
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
- **Content script-first for shortcuts**: The `quick-search.ts` runs directly in page context, providing instant keyboard shortcut response (no service worker wake-up)
- **Shadow DOM isolation**: Search overlay uses closed Shadow DOM for complete style isolation from page CSS
- **Port-based messaging**: Uses `chrome.runtime.connect()` for faster search-as-you-type (2-5ms vs 5-15ms one-shot)
- **Service worker pre-warming**: Ping on visibility change and first keypress to eliminate cold starts
- **requestIdleCallback pre-creation**: Overlay pre-created during browser idle time for instant appearance
- **CSS containment**: Uses `contain: layout style` and `content-visibility: auto` for faster rendering
- **Non-blocking initialization**: Logger and Settings use async init to avoid blocking popup load
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
