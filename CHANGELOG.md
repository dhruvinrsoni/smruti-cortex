# Changelog

All notable changes to SmrutiCortex are documented here.

## [8.0.0] — 2026-03-01

### Search Intelligence
- **Deep Search™ algorithm** — Graduated multi-token scoring with intent-priority ranking; exact phrase matches and multi-token intent now score significantly higher than partial matches
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

## [7.0.0] and earlier

See git tags for previous release history.
