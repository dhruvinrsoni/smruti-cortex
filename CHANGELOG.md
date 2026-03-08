# Changelog

All notable changes to SmrutiCortex are documented here.

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

## [2.0.0–2.2.0]

See `docs/RELEASE_NOTES_v2.md` for detailed notes covering the Vivek Search algorithm
introduction, graduated match classification, tabbed settings modal, and UX overhaul.
