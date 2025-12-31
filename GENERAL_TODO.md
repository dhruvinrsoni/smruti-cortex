# GENERAL_TODO (SmrutiCortex)

This is the single canonical checklist for privacy, security, UX, architecture, and future improvements.
Each item can be converted into GitHub Issues.

---

## 📦 VERSION HISTORY

| Version | Status | Description |
|---------|--------|-------------|
| v1.0 | ✅ Released | Initial working extension |
| v2.0 | ✅ Released | Ultra-fast overlay, SOLID/DRY refactor, two UI architecture |
| v3.0 | ✅ Released | Documentation, CI/CD, testing, store-ready |
| v4.0 | ✅ Released | Professional branding, local Ollama AI, privacy hardening |
| v5.0 | ✅ Released | Search quality controls, UX polish, Chrome Store ready |
| v6.0 | ✅ Released | Bookmarks, favicon cache, query expansion, diagnostics, performance monitor |

---

## ✅ COMPLETED — v5.0 (Released Jan 1, 2026)
- [x] **Diverse Results Filter** - URL normalization to filter duplicates with different query params (configurable toggle)
- [x] **Strict Matching Mode** - Only show results containing search terms, with literal substring boost (configurable)
- [x] **Literal Substring Boost** - 50% score increase for exact query matches in URL/title
- [x] **Search Quality Controls Documentation** - Comprehensive guide (docs/SEARCH_QUALITY_CONTROLS.md)
- [x] **UX Improvements** - Bookmark button moved to settings, compact settings header
- [x] **Chrome Store Readiness** - Store tags, complete submission guide

## ✅ COMPLETED — v4.0 (Released Dec 31, 2025)
- [x] **Professional Icon System** - v11 "Neural S" design across all sizes
- [x] **Remove Hardcoded Content** - All assets loaded from files (no emojis, no inline SVG)
- [x] **Local Ollama Integration** - Privacy-first AI with prompting-based keyword expansion (Issue #16)
- [x] **Delete All Data Button** - Clear IndexedDB + chrome.storage with auto-rebuild on next use
- [x] **Rebuild Index Button** - Manual full history re-import with progress feedback
- [x] **Background Resilience** - Service worker restart recovery with proper initialization (Issue #10)
- [x] **IndexedDB Quota Handling** - Storage status display on settings page
- [x] **Unit Tests for mergeMetadata** - 16 tests covering core indexing logic (Issue #8)
- [x] **Default Local-Only Processing** - Favicon toggle controls Google API calls (privacy-first) (Issue #4)
- [x] **Sensitive-Site Blacklist** - Built-in patterns + user-configurable domains for banks/auth sites (Issue #6)

## ✅ COMPLETED — v3.0
- [x] **CI/CD Pipeline** - GitHub Actions workflow (build, lint, test, release)
- [x] **Unit Test Setup** - Vitest with 28 tests for shared utilities
- [x] **ESLint Configuration** - TypeScript linting rules
- [x] **HOW_TO.md** - Comprehensive user guide
- [x] **FAQ.md** - Privacy, features, usage questions
- [x] **TROUBLESHOOTING.md** - Debug guide with solutions
- [x] **CONTRIBUTING.md** - Code style, PR guidelines
- [x] **DEVELOPER_ONBOARDING.md** - Architecture, data flow, key files
- [x] **STORE_DEPLOYMENT.md** - Chrome/Edge submission guide
- [x] **BRANDING.md** - Colors, typography, visual identity
- [x] **Production Build Script** - scripts/package.mjs for zip creation
- [x] **README Polish** - Badges, documentation table, proper structure

## ✅ COMPLETED — v2.0
- [x] **Ultra-fast inline overlay** - < 50ms response, Shadow DOM isolation
- [x] **Two UI architecture** - Inline Overlay + Extension Popup
- [x] **SOLID/DRY refactor** - Shared abstraction layer (search-ui-base.ts)
- [x] **Tab mode UX** - Centered card layout when opened as tab
- [x] **Bookmark button** - Drag-and-drop bookmarklet creation
- [x] **Port-based messaging** - Faster search-as-you-type
- [x] **Comprehensive architecture docs** - UI-ARCHITECTURE.md, diagrams

## ✅ COMPLETED — v1.0
- [x] **Debug toggle in popup** - Checkbox controls all console logging
- [x] **Persistent debug settings** - Debug preference saves to chrome.storage
- [x] **First result auto-focus** - Search results automatically focus first item
- [x] **Omnibox integration** - "sc " keyword for address bar quick access
- [x] **Enhanced keyboard navigation** - Full arrow key support, modifier keys
- [x] **Global keyboard shortcut** - Ctrl+Shift+S to open popup instantly
- [x] **Comprehensive documentation** - Updated README, testing guide, user instructions

---

## ✅ COMPLETED — v6.0 (Released Jan 1, 2026)
- [x] **Bookmark Search** - Index and search bookmarks with ★ indicator (toggle in Settings)
- [x] **Favicon Caching** - Local IndexedDB cache with 30-day expiry and cleanup UI
- [x] **Query Expansion** - Synonym matching (~50 terms) for broader search results
- [x] **Advanced Diagnostics** - Open-closed design with 5 collectors, export JSON for bug reports
- [x] **Performance Monitor** - Real-time metrics modal with 5s auto-refresh
- [x] **Enhanced Error Recovery** - Retry logic with exponential backoff, corruption detection
- [x] **Cross-Browser Support** - Firefox browser_specific_settings, Edge-compatible bookmarks
- [x] **Plugin Placeholder** - Documented IScorer interface for custom scorers
- [x] **Select All on Focus** - Toggle for Tab behavior (select all vs cursor at end)

---

## 🔄 v7.0+ FUTURE ROADMAP (Deferred Features)

### AI & UX Enhancements
- [ ] **Enhanced AI Integration** - Multi-model support, cloud embeddings (opt-in)
- [ ] **Advanced Privacy Controls** - Granular permission management, data retention settings
- [ ] **Smart Onboarding** - 3-step setup flow with privacy explanations
- [ ] **Favorites & Pinned Results** - Save frequently accessed pages

### Developer Experience
- [ ] **Comprehensive Test Coverage** - 80%+ code coverage target

### AI & Intelligence
- [ ] External API embedding scorer (privacy review needed)
- [ ] Semantic search with cloud embeddings (opt-in)
- [ ] API key management for cloud features

### Premium Features (Potential)
- [ ] Cross-device sync (Chrome Sync API)
- [ ] End-to-end encrypted sync engine
- [ ] Session snapshots + restore workspaces
- [ ] Full-text indexing (opt-in)

### Analytics & Telemetry
- [ ] Opt-in anonymized local analytics
- [ ] Export diagnostics for bug reporting

---

## 📋 GITHUB ISSUES REFERENCE

> **Note**: Many issues below are now complete. See COMPLETED sections above for resolved items.

### Completed Issues (v4.0)
- [x] [#4 - Default to Local-only processing](https://github.com/dhruvinrsoni/smruti-cortex/issues/4) ✅
- [x] [#6 - Sensitive-site blacklist](https://github.com/dhruvinrsoni/smruti-cortex/issues/6) ✅
- [x] [#8 - Unit tests for mergeMetadata](https://github.com/dhruvinrsoni/smruti-cortex/issues/8) ✅
- [x] [#9 - Build index rebuild flow](https://github.com/dhruvinrsoni/smruti-cortex/issues/9) ✅
- [x] [#10 - Background resilience](https://github.com/dhruvinrsoni/smruti-cortex/issues/10) ✅
- [x] [#16 - Local Ollama AI integration](https://github.com/dhruvinrsoni/smruti-cortex/issues/16) ✅

### Completed Issues (v6.0)
- [x] [#13 - Favicon caching](https://github.com/dhruvinrsoni/smruti-cortex/issues/13) ✅
- [x] [#15 - Document scorer plugin interface](https://github.com/dhruvinrsoni/smruti-cortex/issues/15) ✅

### Open Issues (v7.0+)
- [ ] [#5 - Explain permissions in Options page](https://github.com/dhruvinrsoni/smruti-cortex/issues/5)
- [ ] [#7 - Disable metadata extraction toggle](https://github.com/dhruvinrsoni/smruti-cortex/issues/7)
- [ ] [#11 - Onboarding 3-step flow](https://github.com/dhruvinrsoni/smruti-cortex/issues/11)
- [ ] [#12 - Pinned results / favorites](https://github.com/dhruvinrsoni/smruti-cortex/issues/12)
- [ ] [#14 - Preview snippet / metadata snippet](https://github.com/dhruvinrsoni/smruti-cortex/issues/14)
- [ ] [#17 - Store embeddings with consent](https://github.com/dhruvinrsoni/smruti-cortex/issues/17)
- [ ] [#18 - API key management](https://github.com/dhruvinrsoni/smruti-cortex/issues/18)

---

## HOW TO USE THIS FILE
- Convert items into GitHub Issues as needed
- Track progress milestone by milestone
- Maintain privacy/security parity with browser store requirements
