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

## 🔄 v7.0+ FUTURE ROADMAP (Strategic Vision)

> **Philosophy**: Each task should be completable in 1-2 hours. Baby steps = consistent progress.
> **Priority Key**: 🔴 Critical | 🟡 Important | 🟢 Nice-to-have

---

## 📚 v7.0 — Documentation Completeness (Low Effort, High Value)

> **Theme**: Complete the documentation suite from master prompt vision.
> **Estimated Effort**: 2-3 sessions

### 7.1 User Documentation
- [ ] 🔴 **HOW_TO.md** - Step-by-step user guide (Issue #5 partial)
  ```
  PROMPT: "Create HOW_TO.md for SmrutiCortex with: installation steps (Chrome/Edge),
  first-time setup, search usage, keyboard shortcuts, settings explanation, 
  indexing behavior, troubleshooting tips. Keep it user-friendly, not developer-focused."
  ```

- [ ] 🔴 **FAQ.md** - Common questions answered
  ```
  PROMPT: "Create FAQ.md for SmrutiCortex covering: Why doesn't X page appear?
  How does indexing work? Is my data uploaded? How to reset? Why Manifest V3?
  How to debug? Privacy questions. Format as Q&A with clear answers."
  ```

- [ ] 🟡 **PERMISSIONS_EXPLAINED.md** - Why each permission is needed (Issue #5)
  ```
  PROMPT: "Create PERMISSIONS_EXPLAINED.md explaining each Chrome extension permission
  used by SmrutiCortex (history, bookmarks, storage, tabs, alarms, host_permissions). 
  Use non-technical language for end users."
  ```

### 7.2 Developer Documentation
- [ ] 🔴 **CONTRIBUTING.md** - How to contribute code
  ```
  PROMPT: "Create CONTRIBUTING.md for SmrutiCortex TypeScript extension: coding standards,
  how to add a new scorer, how to add tests, PR guidelines, branch naming, 
  commit message format, code review process."
  ```

- [ ] 🟡 **DEVELOPER_ONBOARDING.md** - New developer quick-start
  ```
  PROMPT: "Create DEVELOPER_ONBOARDING.md explaining SmrutiCortex architecture:
  folder structure, data flow (history → indexing → search → UI), message passing,
  scorer system, key files to understand first, debugging tips, common gotchas."
  ```

- [ ] 🟡 **ARCHITECTURE.md** - Technical deep-dive with diagrams
  ```
  PROMPT: "Create ARCHITECTURE.md with ASCII diagrams showing: data pipeline
  (browser history → IndexedDB → search engine → popup), scorer architecture,
  message passing flow, content script ↔ service worker communication."
  ```

### 7.3 Branding & Assets
- [ ] 🟢 **BRANDING.md** - Visual identity guide
  ```
  PROMPT: "Create BRANDING.md for SmrutiCortex: explain the name meaning
  (Smriti = Sanskrit for memory + Cortex = brain's memory center), color palette
  (primary, secondary, accent), typography guidelines, logo usage rules, 
  icon variations, tagline options."
  ```

- [ ] 🟢 **LOGO_CONCEPTS.md** - 5 logo design concepts
  ```
  PROMPT: "Generate 5 textual logo concepts for SmrutiCortex browser extension:
  1) Neural network inspired, 2) Sanskrit-inspired, 3) Brain/cortex visual,
  4) Minimal geometric, 5) Letter-based. Describe each visually."
  ```

---

## 🎨 v8.0 — User Experience Polish (Medium Effort)

> **Theme**: Onboarding, favorites, and UX refinements.
> **Estimated Effort**: 3-4 sessions

### 8.1 Onboarding Flow (Issue #11)
- [ ] 🔴 **First-run welcome modal** - Show on first install
  ```
  PROMPT: "Add a first-run welcome modal to SmrutiCortex popup that shows:
  Step 1: What this extension does, Step 2: Privacy guarantee (local-only),
  Step 3: Keyboard shortcut (Ctrl+Shift+S). Save 'onboardingComplete' flag.
  Show only once. Include 'Don't show again' checkbox."
  ```

- [ ] 🟡 **Permissions explanation screen** - During onboarding
  ```
  PROMPT: "Add a permissions explanation step to the onboarding flow that shows
  each permission with a friendly icon and one-sentence explanation of why
  it's needed. User can click 'I understand' to proceed."
  ```

- [ ] 🟡 **Quick tips overlay** - First few searches
  ```
  PROMPT: "Add subtle tooltip hints that appear during user's first 3 searches:
  Hint 1: 'Press Enter to open', Hint 2: 'Ctrl+Enter for new tab',
  Hint 3: 'Use arrow keys to navigate'. Track hint state in settings."
  ```

### 8.2 Favorites & Pinned Results (Issue #12)
- [ ] 🔴 **Pin result to top** - Right-click or button to pin
  ```
  PROMPT: "Add 'Pin to top' functionality to search results. Pinned items
  always appear first regardless of search query. Store pins in chrome.storage.
  Add pin icon button on hover. Max 10 pins. Show pin indicator (📌)."
  ```

- [ ] 🟡 **Favorites management UI** - View/remove pinned items
  ```
  PROMPT: "Add 'Manage Favorites' section to Settings modal. Show list of
  all pinned URLs with title, URL, and remove button. Allow reordering
  via drag-and-drop or up/down arrows."
  ```

- [ ] 🟢 **Quick-pin keyboard shortcut** - Press P to pin selected
  ```
  PROMPT: "Add keyboard shortcut 'P' to pin/unpin the currently selected
  search result. Show toast notification: 'Pinned!' or 'Unpinned!'"
  ```

### 8.3 Result Preview (Issue #14)
- [ ] 🟡 **Metadata preview on hover** - Show description snippet
  ```
  PROMPT: "Add tooltip preview on search result hover showing: page description
  (from meta tag), last visited date, visit count, bookmark folders (if any).
  Delay 500ms before showing. Use existing metadata from index."
  ```

- [ ] 🟢 **Preview pane (optional)** - Split view for preview
  ```
  PROMPT: "Add optional preview pane toggle in Settings. When enabled,
  clicking a result shows iframe preview on the right side (50/50 split).
  Handle X-Frame-Options errors gracefully with 'Preview unavailable'."
  ```

---

## 🧠 v9.0 — AI Enhancement (Medium-High Effort)

> **Theme**: Smarter search with local and optional cloud AI.
> **Estimated Effort**: 4-5 sessions

### 9.1 Enhanced Local AI (Ollama)
- [ ] 🔴 **Multi-model support** - Choose from installed Ollama models
  ```
  PROMPT: "Enhance Ollama integration to auto-detect installed models via
  /api/tags endpoint. Show dropdown in Settings with available models.
  Default to smallest model. Show model size/description if available."
  ```

- [ ] 🟡 **Semantic query understanding** - Parse user intent
  ```
  PROMPT: "Add query intent parsing via Ollama: detect if user wants
  'recent' (boost recency), 'frequent' (boost visit count), or 'exact'
  (disable fuzzy). Example: 'recent github' boosts last 7 days."
  ```

- [ ] 🟡 **AI-powered result reranking** - Rerank top results
  ```
  PROMPT: "After initial search, send top 10 results to Ollama for semantic
  reranking based on query relevance. Add 'AI Rerank' toggle in Settings.
  Show reranking indicator while processing."
  ```

### 9.2 Embedding-Based Search (Issue #17)
- [ ] 🔴 **Local embedding generation** - Use Ollama embeddings
  ```
  PROMPT: "Add embedding generation for indexed pages using Ollama's
  embedding API. Store embeddings in IndexedDB alongside page data.
  Generate embeddings in background during idle time. Schema migration."
  ```

- [ ] 🟡 **Vector similarity search** - Find semantically similar
  ```
  PROMPT: "Implement cosine similarity search using stored embeddings.
  When user searches, embed the query and find top matches by similarity.
  Blend with keyword score (50/50 configurable). Add 'Semantic Search' toggle."
  ```

- [ ] 🟢 **Similar pages feature** - "Find similar to this"
  ```
  PROMPT: "Add 'Find Similar' button on search results that finds pages
  with similar embeddings. Opens new search with similar results.
  Useful for discovering related content."
  ```

### 9.3 Cloud AI Integration (Issue #18) — Optional, Privacy Review
- [ ] 🟡 **API key management UI** - Secure key storage
  ```
  PROMPT: "Add API key management in Settings for OpenAI/Anthropic.
  Store keys encrypted in chrome.storage.local. Mask display (****).
  Add 'Test Connection' button. Clear warnings about data leaving device."
  ```

- [ ] 🟡 **Cloud embedding option** - Opt-in for better quality
  ```
  PROMPT: "Add optional cloud embedding via OpenAI/Cohere API when API key
  is provided. Clear consent checkbox: 'I understand page titles/URLs will
  be sent to [Provider]'. Compare quality vs local embeddings."
  ```

- [ ] 🟢 **Hybrid search mode** - Local + Cloud combined
  ```
  PROMPT: "Implement hybrid search: try local Ollama first, fall back to
  cloud API if local unavailable or times out. User configurable priority.
  Show which mode was used in results."
  ```

---

## 🔒 v10.0 — Privacy & Security Hardening (Medium Effort)

> **Theme**: Enterprise-grade privacy controls and data management.
> **Estimated Effort**: 3-4 sessions

### 10.1 Advanced Privacy Controls
- [ ] 🔴 **Data retention settings** - Auto-delete old entries
  ```
  PROMPT: "Add data retention settings: keep history for X days (30/60/90/forever).
  Background job runs daily to purge old entries. Show 'Data will be deleted
  after X days' warning. Exclude pinned/bookmarked items from deletion."
  ```

- [ ] 🟡 **Disable metadata extraction toggle** (Issue #7)
  ```
  PROMPT: "Add toggle to completely disable content script metadata extraction.
  When disabled, only use browser history API data (title, URL, visit time).
  Explain trade-off: faster but less rich search."
  ```

- [ ] 🟡 **Incognito mode handling** - Never index incognito
  ```
  PROMPT: "Ensure extension never indexes incognito/private browsing.
  Add explicit check in indexing pipeline. Show badge indicator when
  in incognito: 'Not indexing (private mode)'."
  ```

### 10.2 Export & Backup
- [ ] 🔴 **Export all data** - Download complete index
  ```
  PROMPT: "Add 'Export All Data' button in Settings that downloads complete
  index as JSON file. Include: history items, bookmarks, settings, pins.
  File named: smruticortex-backup-YYYY-MM-DD.json"
  ```

- [ ] 🟡 **Import data** - Restore from backup
  ```
  PROMPT: "Add 'Import Data' button to restore from exported backup.
  Validate JSON schema before import. Option to merge or replace existing.
  Show import progress and summary."
  ```

- [ ] 🟢 **Selective export** - Export only certain data
  ```
  PROMPT: "Add export options: export only settings, only history, only
  bookmarks, or date range. Checkbox selection before export."
  ```

---

## 🚀 v11.0 — Advanced Features (High Effort)

> **Theme**: Power user features and cross-device capabilities.
> **Estimated Effort**: 5-6 sessions

### 11.1 Session Management
- [ ] 🟡 **Session snapshots** - Save current tabs
  ```
  PROMPT: "Add 'Save Session' feature that captures all open tabs with
  titles and URLs. Store in chrome.storage with timestamp and custom name.
  List saved sessions in Settings with restore/delete options."
  ```

- [ ] 🟢 **Session restore** - Open saved session
  ```
  PROMPT: "Add 'Restore Session' that opens all tabs from a saved session.
  Options: open in current window, new window, or as tab group.
  Confirm before restoring large sessions (>10 tabs)."
  ```

### 11.2 Full-Text Search (Opt-in)
- [ ] 🟡 **Page content indexing** - Index page text
  ```
  PROMPT: "Add opt-in full-text indexing: content script extracts visible
  text (first 5000 chars) and stores in index. Heavy storage warning.
  Enable per-domain or globally. Exclude sensitive sites."
  ```

- [ ] 🟡 **Content search** - Search within page text
  ```
  PROMPT: "When full-text enabled, search within indexed page content.
  Show matching snippet in results. Highlight match context.
  Toggle: 'Search page content' in search bar."
  ```

### 11.3 Cross-Device Sync (Chrome Sync API)
- [ ] 🔴 **Chrome Sync integration** - Sync settings across devices
  ```
  PROMPT: "Use chrome.storage.sync (limited to 100KB) to sync user settings,
  pins, and favorites across Chrome instances. History stays local.
  Show sync status indicator. Handle sync conflicts gracefully."
  ```

- [ ] 🟢 **Encrypted sync option** - E2E encrypted history sync
  ```
  PROMPT: "For users wanting full history sync: implement E2E encryption
  using user-provided passphrase. Encrypt before upload, decrypt on device.
  Use Web Crypto API. Heavy privacy warnings and consent."
  ```

---

## 🧪 v12.0 — Quality & Testing (Ongoing)

> **Theme**: Production-grade reliability and test coverage.
> **Estimated Effort**: Continuous

### 12.1 Test Coverage Expansion
- [ ] 🔴 **Search engine unit tests** - Test all scorers
  ```
  PROMPT: "Add comprehensive unit tests for search-engine.ts and all scorers.
  Test: scoring accuracy, edge cases (empty query, special chars, long URLs),
  normalization, result ordering. Target 80% coverage for search module."
  ```

- [ ] 🟡 **Integration tests** - End-to-end search flow
  ```
  PROMPT: "Add integration tests that simulate: history import, search query,
  result rendering. Use mocked chrome APIs. Test message passing between
  popup and service worker."
  ```

- [ ] 🟡 **Performance benchmarks** - Automated timing tests
  ```
  PROMPT: "Add performance benchmark tests: search must complete <100ms for
  10K items, indexing must process 1000 items/sec. Run in CI. Fail build
  if benchmarks regress by >20%."
  ```

### 12.2 Error Handling
- [ ] 🔴 **Global error boundary** - Catch all errors
  ```
  PROMPT: "Add global error handler in popup and service worker that catches
  unhandled errors, logs to console, and shows user-friendly toast.
  Include 'Report Bug' link to GitHub issues with error details."
  ```

- [ ] 🟡 **Graceful degradation** - Work with partial failures
  ```
  PROMPT: "Ensure extension works even if: IndexedDB unavailable (use memory),
  content script blocked (use history API only), Ollama offline (disable AI).
  Show degradation status in Settings."
  ```

---

## 📊 v13.0 — Analytics & Insights (Optional)

> **Theme**: Help users understand their browsing patterns.
> **Estimated Effort**: 2-3 sessions

### 13.1 Local Analytics (Privacy-First)
- [ ] 🟢 **Usage statistics dashboard** - Personal insights
  ```
  PROMPT: "Add local-only usage stats in Settings: most visited domains,
  search frequency, peak browsing hours, bookmark usage. All computed
  locally from index. Export as chart or CSV."
  ```

- [ ] 🟢 **Search history** - What you searched for
  ```
  PROMPT: "Optionally log search queries locally. Show recent searches
  in Settings with clear button. Auto-suggest from history. Never sync."
  ```

---

## 📋 IMPLEMENTATION PRIORITY MATRIX

| Version | Theme | Effort | Impact | Priority |
|---------|-------|--------|--------|----------|
| v7.0 | Documentation | Low | High | 🔴 Do First |
| v8.0 | UX Polish | Medium | High | 🔴 Do Second |
| v9.0 | AI Enhancement | High | High | 🟡 Strategic |
| v10.0 | Privacy | Medium | Medium | 🟡 Important |
| v11.0 | Advanced | High | Medium | 🟢 Future |
| v12.0 | Testing | Ongoing | High | 🔴 Continuous |
| v13.0 | Analytics | Low | Low | 🟢 Optional |

---

## 🎯 QUICK START PROMPTS

### Start v7.0 (Documentation):
```
"I'm working on SmrutiCortex v7.0 - Documentation Completeness. 
Create [FILE_NAME].md following the SmrutiCortex documentation style.
Keep it concise, user-friendly, and consistent with existing docs."
```

### Start Any Task:
```
"I'm implementing [TASK_NAME] for SmrutiCortex browser extension.
Context: TypeScript, Manifest V3, IndexedDB, modular scorer architecture.
Files to modify: [LIST_FILES]. Keep changes minimal and atomic.
Build command: npm run build. Test with: npm run test."
```

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

### Open Issues (Mapped to Roadmap)
| Issue | Title | Version | Task |
|-------|-------|---------|------|
| #5 | Explain permissions | v7.0 | PERMISSIONS_EXPLAINED.md |
| #7 | Disable metadata toggle | v10.0 | Privacy controls |
| #11 | Onboarding flow | v8.0 | First-run modal |
| #12 | Pinned results | v8.0 | Favorites system |
| #14 | Preview snippet | v8.0 | Metadata preview |
| #17 | Store embeddings | v9.0 | Embedding search |
| #18 | API key management | v9.0 | Cloud AI integration |

---

## HOW TO USE THIS FILE
- Convert items into GitHub Issues as needed
- Track progress milestone by milestone
- Maintain privacy/security parity with browser store requirements
