# Changelog

All notable changes to SmrutiCortex are documented here.

## [9.1.0] — 2026-04-16

Reliability, observability, and release-infrastructure release. **No new permissions, no new user-facing features that require reviewer attention.** Chrome Web Store submission record: [`docs/store-submissions/v9.1.0-chrome-web-store.md`](docs/store-submissions/v9.1.0-chrome-web-store.md).

### Features
- **AOP-inspired tracing framework** — New `@Traced` decorator and `traced()` function wrapper for end-to-end observability; applied to embedding, search, cache, and database modules
- **Self-healing hardening** — Unified Troubleshooter consolidates extension self-recovery paths
- **`verify.mjs`** — Run-all-and-report script combining lint, tests, coverage, build, and E2E in a single invocation
- **Coverage in pre-commit** — Coverage threshold gated in pre-commit hook and `verify`/`preflight` scripts
- **Release convenience scripts** — Tier 3 version sync hooks and helper scripts for common release paths
- **Bundle-size benchmark as release gate** — Preflight blocks release if bundle size regresses past configured thresholds

### Bug Fixes
- **Service-worker cold start** — Register `chrome.runtime.onMessage` listener synchronously so the very first message after SW hibernation is received reliably
- **Quick-search blank overlay** — Fix regression caused by stale port and port rate-limiting edge cases; also eliminates popup `lastError: message port closed` warnings
- **Favicon resilience** — Use fallback SVG for tab favicons with empty URLs in quick-search; harden against empty favicons, unchecked `lastError`, and context invalidation during favicon fetch
- **Embedding processor** — Skip redundant restart when already completed
- **Embedding semantics** — Correct 0-dimension embedding handling (no longer treated as valid); reduce AI/embedding log noise; remove session-cap busy-wait
- **E2E speed** — Run E2E at full speed by default; slow-mo is now explicit opt-in
- **Lint** — Remove unused variables flagged by ESLint

### Code Quality / Infrastructure
- **`lint:strict` script** — Zero-warning lint invocation for CI; ESLint rules relaxed appropriately for test files
- **`.gitattributes`** — Enforces LF line endings, eliminating phantom diffs across Windows/macOS contributors
- **Build pipeline consolidation** — Inlined `clean` / `sync-version` / `tsc` steps into the build pipelines; removed redundant `release:*:dry` / `test:coverage` / base `release` npm scripts; removed Docker npm scripts
- **E2E slow-mo aliases collapsed** into a smaller, clearer npm script surface
- **Benchmark + screenshots-index + e2e-slowmo scripts** — All now support `--help` with usage docs
- **Test update** — Omnibox `sendMessage` assertion updated to expect `lastError` callback

### Testing
- **1,233 unit tests across 46 files + 45 E2E tests across 7 specs** — Unchanged totals from v9.0.0; existing tests updated to cover the reliability fixes above

### Docs
- Documented E2E fast vs slow-mo modes, verify flags, and troubleshooting
- Added screenshots for AI embedding completion and semantic search results

---

## [9.0.0] — 2026-04-13

### Features
- **Command palette** — Prefix-based modes transform the search overlay into a universal browser control surface (`/` commands, `>` power, `@` tabs, `#` bookmarks, `??` web search, `?` help)
- **Advanced browser commands** — ~45 opt-in commands for tab/window management, tab groups, browsing-data cleanup, and Top Sites; gated behind optional permissions (`tabGroups`, `browsingData`, `topSites`)
- **Web search mode (`??`)** — Search Google, YouTube, GitHub, GCP console, Jira, and Confluence directly from the palette with per-engine prefix shortcuts
- **Palette discovery (`?`)** — Help mode listing all available prefix modes with descriptions
- **Palette in popup** — Optional setting to enable prefix modes in the popup (useful on restricted `chrome://` pages)
- **Jira & Confluence integration** — Configurable site URLs for `?? j` and `?? c` quick search
- **Palette diagnostic toasts** — Formatted toast messages for palette command execution feedback
- **Popup & quick-search resizing** — User-resizable popup and quick-search overlay with drag handles, persisted size, and double-click reset
- **Unified scroll toggle** — New `unifiedScroll` setting to switch between split and unified scrolling in the popup
- **Settings UI modernization** — Toggle switches, segmented controls, pill chips, searchable model dropdown

### Bug Fixes
- **CSP compliance** — Replace all `fav.onerror` / `closeBtn.onclick` IDL handlers with `addEventListener` to comply with Chrome MV3 `script-src 'self'`; move global error handler from inline script to external `error-guard.js`
- **XSS prevention** — Escape user-derived strings in popup `innerHTML` assignments
- **Search rate limiting** — Rate-limit search requests on the port handler; add bookmark walk depth guard
- **Input validation** — Validate and sanitize all service-worker message handler inputs
- **Scorer isolation** — Per-scorer `try/catch` in search loop prevents one scorer failure from breaking all results
- **Error boundaries** — Wrap `renderResults` and `renderAIStatus` in popup and quick-search with error boundaries; add global `window.onerror` / `window.onunhandledrejection` guardrails
- **Unhandled rejections** — Add global error handler for unhandled promise rejections in service worker; fix `checkHealth()` and `startHealthMonitoring()` promise chains in resilience module
- **IndexedDB resilience** — Graceful degradation when IndexedDB or embedding hydration fails
- **Ollama hardening** — Cap keyword expander timeout at 120s, wire circuit breaker, add response body size cap on fetch calls
- **Memory pressure** — Strip embeddings from in-memory item cache; null `item.embedding` after `saveIndexedItem`; add session embedding counter fallback for memory pressure guard
- **Logger safety** — Serialize and truncate data in logger buffer entries
- **Storage efficiency** — Use `store.count()` in `getStorageQuotaInfo` to avoid loading full index
- **Fingerprinting** — Reduce extension fingerprinting surface; add remote Ollama endpoint warning
- **Settings side effects** — Apply theme, toolbar, and history side effects immediately on toggle chip click, palette command execution, and `SETTINGS_CHANGED` handler (popup and quick-search)
- **Context recovery** — Skip futile context recovery on extension reload; show reconnect UI immediately
- **Settings tab bar** — Convert vertical scroll to horizontal on settings tab bar overflow
- **Text selection** — Allow text selection on toast notifications and Recently Visited section
- **Recent history** — Always show recent history results; toggle only controls Recently Visited section; restore display cap from 3 to 5
- **Quick-search parity** — Command palette arrow keys and Tab navigation match quick-search overlay behaviour
- **Footer typography** — Larger command palette footer hint text in popup
- **Deprecation** — Deprecate `getIndexedItemsBatches` (returns all batches at once, replaced by streaming)
- **Message port closed** — Add `lastError` callbacks to fire-and-forget `sendMessage` calls in popup and quick-search to suppress Chrome warnings
- **Bookmarks lastError** — Check `chrome.runtime.lastError` in bookmarks `getTree` callback to properly reject on error
- **Listener leak** — Fix `visibilitychange` listener leak in quick-search by hoisting handler to module scope with cleanup
- **Tour keydown leak** — Move `removeEventListener('keydown')` to cleanup function so listener is always removed
- **Silent catch logging** — Replace all 60+ silent `.catch(() => {})` in popup, quick-search, and tour with meaningful `logger.debug` / `logger.warn` calls for debuggability

### Code Quality
- **Dead code removal** — Remove unused exports (`createContextLogger`, `incrementSessionEmbeddingCount`, `INJECTED_FLAG`), unused imports, unused variables, and duplicate test file (`background/__tests__/diversity-filter.test.ts`)
- **Dependency cleanup** — Uninstall unused `webextension-polyfill` and `ts-node` packages
- **Lint warning reduction** — Fix 13 `no-unused-vars` warnings (dead imports, unused params prefixed with `_`, removed dead functions)
- **Build guardrail** — Add two-layer defense against Chrome MV3 underscore-dir restriction: `tsconfig.json` exclude + post-build sweep in `scripts/copy-static.mjs`
- **Dual release path resolution** — Disable CI `release` job (set `if: false`) since `scripts/release.mjs` is the single source of truth for GitHub Releases

### Testing
- **1,233 unit tests across 46 files** — Up from 1,098 tests / 43 files in v8.1.0
- **45 E2E tests across 7 Playwright specs** — New infrastructure for end-to-end browser automation testing
- **E2E CI workflow** — GitHub Actions workflow with xvfb for headless Chromium testing
- Added `command-registry-core.test.ts` (21 tests) and `command-registry-advanced-browser.test.ts` (6 tests)
- Added `web-search.test.ts` (15 tests), `palette-messages.test.ts` (4 tests), `hide-img-on-error.test.ts` (2 tests)
- Added `toolbar-toggles.test.ts` (7 tests), `tour.test.ts` (13 tests), `recent-interactions.test.ts` (11 tests), `recent-searches.test.ts` (10 tests)
- Expanded service-worker tests (50 → 95) with full coverage of advanced browser commands and omnibox palette
- Pre-commit hook now runs `eslint --fix` auto-correction before build

### License
- **BSL 1.1** — Changed license from Apache-2.0 to Business Source License 1.1. Additional Use Grant: non-commercial, personal, educational, or evaluation use. Change Date: April 1, 2030 (converts back to Apache-2.0). Licensor: Dhruvin Rupesh Soni.

### Other
- New shared modules: `command-registry.ts`, `web-search.ts`, `palette-messages.ts`, `hide-img-on-error.ts`
- New settings: `commandPaletteEnabled`, `commandPaletteModes`, `commandPaletteInPopup`, `webSearchEngine`, `jiraSiteUrl`, `confluenceSiteUrl`, `advancedBrowserCommands`, `unifiedScroll`
- New manifest permissions: `sessions`, `windows` (required); `tabGroups`, `browsingData`, `topSites` (optional)
- Settings tab for Command Palette configuration with per-mode toggles
- Documentation synced across CLAUDE.md, maintenance SKILL.md, and CHANGELOG

---

## [8.1.0] — 2026-03-25

### Features
- **In-extension onboarding tour** — Spotlight-driven guided walkthrough for new users with step-by-step UX highlights
- **Toggle chip bar** — Quick-toggle chips in popup and quick-search overlay for frequently used settings (e.g. AI, bookmarks, duplicates)
- **Toolbar settings tab** — New "Toolbar" tab in settings to configure which toggle chips appear
- **Toast notifications** — Non-intrusive toast messages for index operations with type system (success/error/info) and configurable duration
- **Recent searches** — Separate toggles for recent history and recent searches with display cap
- **Recently interacted entries** — Track and surface clicked/copied results for quick re-access
- **Dark/light/auto theme toggle** — Theme preference in popup settings with system-auto detection
- **Index export/import** — Full data portability via export/import in the Data Management settings tab
- **Clear input button** — Minimal red X button in popup and quick-search for quick query clearing
- **Zero-reload extension updates** — `scripting` + `activeTab` permissions to re-inject content scripts after update without page reload
- **Smart pre-commit hook** — Skips full build/test for docs-only commits, runs them for product file changes
- **Enhanced semantic search** — On-demand embedding generation that skips unnecessary embeddings to avoid Ollama slot contention

### Bug Fixes
- **Port display in URLs** — `localhost:3000`, `dev.local:8443` and other non-standard ports now visible in search results list view (was using `hostname` instead of `host`)
- **Ctrl+A in popup** — Now selects only the input text, not the entire popup HTML document
- **Toast notification UX** — Longer display duration (5s default, 8s for errors), hover-to-pause with full timer restart, selectable text
- **Smart Escape key** — First Esc clears search input, second Esc closes popup/overlay (was closing immediately)
- **Search precision** — Gate search inclusion on original tokens (not synonym expansions); dampen scores for items matching fewer original query tokens
- **Synonym pruning** — Remove overly broad synonym map entries that caused false-positive matches
- **Browser shortcuts** — Stop blocking native browser shortcuts when quick-search overlay is open
- **Clear button styling** — Fix visibility on programmatic input; restyle as minimal red X
- **Quick-search settings** — Await settings before loading defaults in quick-search overlay
- **Overlay DOM leak** — Detach overlay from DOM when hidden to prevent serialization into MHTML/print saves
- **Packaging fix** — Correctly implement globbing in `createZip` to include all files except hidden ones

### Testing
- **1,073 tests across 34 files** — Up from 905 tests in v8.0.0
- Expanded service-worker tests (14 → 50), search-ui-base tests (27 → 100), extractor tests (15 → 31)
- Added ranking regression tests for multi-token queries and synonym edge cases
- Added ai-scorer-placeholder interface validation tests
- Added port-inclusive URL display tests for `truncateUrl`
- 90%+ line coverage maintained

### Other
- Quick-search arrow-key navigation improved to only focus on selected result
- Reduced recent searches display cap from 8 to 5
- Updated documentation with onboarding tour screenshots and Chrome Web Store listing copy
- Improved logging and circuit breaker handling for AI features

---

## [8.0.0] — 2026-03-01

### Search Intelligence
- **Vivek Search algorithm** — Graduated multi-token scoring with intent-priority ranking; exact phrase matches and multi-token intent now score significantly higher than partial matches
- **Exact keyword boost** — Exact keyword matches in title and URL receive additional score boosts for more relevant top results
- **Smart defaults** — Popup loads your recent browsing history immediately on open, before you type anything, using a configurable `defaultResultCount` setting
- **Recent history backend** — New `GET_RECENT_HISTORY` message handler with dedicated `lastVisit` index for fast recency queries

### AI Features
- **Circuit breaker for AI features** — Prevents AI keyword expansion from overloading slow or unavailable Ollama instances; falls back gracefully
- **Memory guards** — AI feature memory usage is bounded to prevent runaway resource consumption during large index operations

### UI & Experience
- **Tabbed settings modal** — All settings organized into tabs within the popup modal; no separate options page
- **Card view in quick search** — Card layout is now fully supported in the inline quick-search overlay, matching popup behaviour
- **Factory reset** — New one-click data wipe option in settings for a clean slate
- **Unified favicon & bookmark styles** — Consistent icon sizing and alignment across popup and quick-search overlay
- **Radio/checkbox styling fix** — Settings input elements now render correctly across all themes

### Focus & Keyboard
- **Auto-focus fix** — Results now reliably receive focus after `focusDelayMs` (default 450ms); a stale `activeElement` guard was incorrectly preventing focus from ever firing
- **Debounce timing improvement** — Search debounce and focus delay tuned to prevent race conditions during rapid typing
- **`applyRemoteSettings` broadcast loop fix** — Settings changes no longer loop back and trigger redundant re-renders

### Messaging & Stability
- **Port handling consolidation** — Background messaging between popup, content scripts, and service worker is more resilient; reconnection logic improved
- **Service worker module fix** — Background service worker correctly declared as `type: module` in manifest for proper ES import support
- **Extension context invalidation** — Improved handling of context invalidation on page navigate/bfcache restore

### Developer & Build
- **Pre-commit build checks** — Husky pre-commit hook blocks commits if build phases fail; covers `tsc` and `esbuild`
- **Batch collection helper** — Database layer has a new batch helper reducing query overhead during indexing
- **CI: Node.js 22.x** — All workflows updated to Node.js 22 to match local dev environment
- **Artifact versioning** — Build artifacts are versioned in CI for traceability
- **Interactive feature tour** — Landing page updated with demo simulators and an interactive product tour
- **Apache-2.0 license** — Project relicensed to Apache-2.0; all references updated across docs and package metadata
- **CONTRIBUTING.md** — Contribution guidelines added (contributions currently closed pending CLA)

### AI Feedback & Quality
- **AI status bar** — Overlay shows colored badges after search: `ai-expanded` (purple), `cache-hit` (blue), `semantic` (teal), `skipped` (grey), `error` (red); `ExpansionSource` tracking piped from background to UI
- **AI loading spinner** — Inline overlay shows a spinner while AI processes the query
- **Cache invalidation on settings change** — Toggling any setting immediately clears stale search cache; next query always runs fresh
- **ESLint clean** — All 76 ESLint issues resolved (52 auto-fixed, 24 manual); `npm run lint` exits with 0 issues; `lint-report.yml` calls the same npm script

---

## [7.0.0] — 2026-01-01

- Chrome Web Store compliance: revised permissions manifest, deployed landing page, added privacy policy
- Manual history indexing on demand from settings
- Multi-token search ranking improvements (intent-priority ordering)
- Quick search: improved focus handling, tab navigation, overlay robustness
- Semantic search with AI embeddings integration
- Bug fixes: localStorage in sandboxed pages, overlay keybinding isolation, extension context invalidation

## [6.0.0] — 2026-01-01

- Bookmark indexing with favicon caching in IndexedDB
- Query expansion with synonym matching for smarter search
- Performance monitoring singleton and tracking infrastructure
- Advanced diagnostics module (open-closed design)
- Settings additions: `indexBookmarks` and `selectAllOnFocus` toggles

## [5.0.0] — 2025-12-31

- Strict matching and diversity filter for cleaner, less redundant results
- Popup UI: reduced header padding, bookmark button moved to settings modal
- Chrome Web Store submission preparation and documentation

## [4.0.0] — 2025-12-28

- Ollama-based semantic search: AI keyword expansion and embeddings support
- Privacy controls: favicon loading toggle and sensitive-site URL blacklist
- Self-healing resilience module for extension reliability
- Settings architecture: schema-driven validation following SOLID principles
- v11 "Neural S" icon redesign

## [3.0.0] — 2025-12-27

- Comprehensive CI/CD pipeline and packaging infrastructure
- Automated testing, linting, and documentation standards
- Developer tooling and build process foundation

## [2.2.0] — Vivek Search Algorithm

- **Graduated Match Classification** — 4-tier system: EXACT (1.0), PREFIX (0.75), SUBSTRING (0.4), NONE (0.0) — replaces binary `includes()` in all scorers
- **Intent-Priority Ranking** — Multi-token queries sort by title+URL coverage before score (Tier 3: split-field, Tier 2: same-field, Tier 1: ≥75%, Tier 0: partial)
- **Post-Score Boosters** — ×1.60 strong split-field, ×1.45 all-exact-title, ×1.40 strong same-field, ×1.15 moderate; stack multiplicatively
- **Enhanced Title Scorer** — 6 signals: graduated quality, position, consecutive, composition, starts-with, original-token priority
- **New Tokenizer Exports** — `classifyMatch()`, `graduatedMatchScore()`, `matchPosition()`, `countConsecutiveMatches()`
- See `docs/VIVEK_SEARCH_ALGORITHM.md` for full algorithm detail

## [2.1.0] — Settings UX

- **Tabbed Settings Modal** — 6 themed tabs (General, Search, AI, Privacy, Data, Advanced); replaces single long-scroll layout
- **Favicon sizing fix** — Requests at native display size (16px list / 32px cards) instead of oversized 64px
- **Bookmark indicator cleanup** — Inline styles moved to CSS classes; overlay now has matching bookmark/favicon rules
- **License** — Changed from MIT to Apache-2.0; CONTRIBUTING.md added

## [2.0.0] — Inline Overlay

- Ultra-fast inline overlay (content-script) with closed Shadow DOM for keyboard-triggered search (<50ms)
- SOLID/DRY refactor: shared `search-ui-base.ts` abstraction across popup and overlay
- Precise popup performance instrumentation via `POPUP_PERF_LOG` messages
- Fixed result-skipping bug during keyboard navigation
