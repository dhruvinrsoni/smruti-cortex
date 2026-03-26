# Changelog

All notable changes to SmrutiCortex are documented here.

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
