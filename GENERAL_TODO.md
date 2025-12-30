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
| v4.0 | 🔄 In Progress | Professional branding, local Ollama AI, privacy hardening |

---

## ✅ COMPLETED — v4.0 (In Progress)
- [x] **Professional Icon System** - v11 "Neural S" design across all sizes
- [x] **Remove Hardcoded Content** - All assets loaded from files (no emojis, no inline SVG)
- [x] **Local Ollama Integration** - Privacy-first AI with prompting-based keyword expansion
- [x] **Delete All Data Button** - Clear IndexedDB + chrome.storage with auto-rebuild on next use
- [x] **Rebuild Index Button** - Manual full history re-import with progress feedback
- [x] **Background Resilience** - Service worker restart recovery with proper initialization
- [x] **IndexedDB Quota Handling** - Storage status display on settings page
- [x] **Unit Tests for mergeMetadata** - 16 tests covering core indexing logic
- [ ] **Default Local-Only Processing** - No external calls without explicit consent
- [ ] **Sensitive-Site Blacklist** - Disable extractor on banks/password portals

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

## 🎯 v4.0 ROADMAP (LOCAL AI + PRIVACY)

### Core Features
- [ ] **Local Ollama Integration** - Issue #16
  - Enable/disable toggle (default: disabled)
  - Auto-detect Ollama at localhost:11434
  - Model selection dropdown
  - Graceful fallback to keyword search
- [ ] **Developer Insights Panel** - Issue #16
  - Real-time embedding generation metrics
  - Model performance tracking
  - Token usage visualization
  - Success/failure rates
- [ ] **Default Local-Only Processing** - Issue #4
  - Audit all network calls
  - Settings page with clear toggles
  - Privacy-first architecture
- [ ] **Sensitive-Site Blacklist** - Issue #6
  - Disable extractor on banks, password portals
  - User-configurable blacklist
  - Smart defaults for common sensitive domains

---

## v5.0+ FUTURE ROADMAP

### AI & Intelligence (Deferred)
- [ ] External API embedding scorer (6+ months, privacy review needed)
- [ ] Semantic search with cloud embeddings (privacy concerns)
- [ ] Query expansion
- [ ] API key management (only if external APIs approved)

### Premium Features (Potential Monetization)
- [ ] Cross-device sync (Chrome Sync API)
- [ ] End-to-end encrypted sync engine
- [ ] Session snapshots + restore workspaces

### Analytics (Privacy-Respecting)
- [ ] Opt-in anonymized local analytics
- [ ] Export diagnostics for bug reporting

---

## HIGH PRIORITY — PRIVACY & SECURITY (v4.0)
- [x] Default to "Local-only" processing (no external data usage) - Issue #4 (v4.0 milestone)
- [x] Add sensitive-site blacklist (disable extractor on banks, password portals) - Issue #6 (v4.0 milestone)
- [x] Add "Delete All Data" (IndexedDB + chrome.storage) with auto-rebuild
- [x] Add manual "Rebuild Index" button
- [ ] Add onboarding privacy prompt (explain metadata extraction clearly to user)
- [ ] Explain permissions within extension Options page
- [ ] Add toggle: "Disable metadata extraction"
- [ ] Implement data retention settings (e.g., keep last 90 days)

---

## HIGH PRIORITY — CORRECTNESS & RELIABILITY
- [x] Unit tests for mergeMetadata logic
- [x] Background resilience (SW restart recovery)
- [ ] Build index rebuild flow (full history import)
- [ ] Handle IndexedDB quota gracefully

---

## MEDIUM PRIORITY — UX & DISCOVERABILITY
- [ ] Add onboarding 3-step flow for new users
- [x] **Improve keyboard navigation** (Home, End, PageUp/PageDown) - Basic navigation implemented
- [ ] Add "Pinned results" or favorites
- [ ] Add favicon caching
- [ ] Add preview snippet or metadata snippet

---

## MEDIUM PRIORITY — AI & EXTENSIBILITY
- [x] Add local Ollama integration (opt-in) - Issue #16 (v4.0 milestone)
- [ ] Document scorer plugin interface
- [ ] Store embeddings locally with user consent

---

## LOW PRIORITY — TELEMETRY (OPT-IN ONLY)
- [ ] Add anonymized local-only analytics
- [ ] Export diagnostics file for bug reporting

---

## LOW PRIORITY — PACKAGING
- [ ] Create promo screenshots for Chrome/Edge store
- [ ] Write Store Description + Release Notes
- [ ] Add GitHub Action to auto-zip builds
- [ ] Prepare automated release upload

---

## LONG-TERM / FUTURE IDEAS
- [ ] End-to-end encrypted sync engine
- [ ] Optional native companion app for deeper local search
- [ ] Full-text indexing (opt-in)
- [ ] Session snapshots + restore workspaces

---

## HOW TO USE THIS FILE
- Convert each into GitHub Issues
- Track progress milestone by milestone
- Maintain privacy/security parity with browser store requirements- [ ] [Default to Local-only processing](https://github.com/dhruvinrsoni/smruti-cortex/issues/4)  Labels: priority/high, area/privacy
- [ ] [Explain extension permissions in Options page](https://github.com/dhruvinrsoni/smruti-cortex/issues/5)  Labels: priority/high, area/privacy
- [ ] [Sensitive-site blacklist for extractor](https://github.com/dhruvinrsoni/smruti-cortex/issues/6)  Labels: priority/high, area/privacy
- [ ] [Disable metadata extraction toggle](https://github.com/dhruvinrsoni/smruti-cortex/issues/7)  Labels: priority/high, area/privacy
- [ ] [Unit tests for mergeMetadata logic](https://github.com/dhruvinrsoni/smruti-cortex/issues/8)  Labels: priority/high, area/tests
- [ ] [Build index rebuild flow (full history import)](https://github.com/dhruvinrsoni/smruti-cortex/issues/9)  Labels: priority/high, area/indexing
- [ ] [Background resilience: service worker restart recovery](https://github.com/dhruvinrsoni/smruti-cortex/issues/10)  Labels: priority/high, area/background
- [ ] [Add onboarding 3-step flow for new users](https://github.com/dhruvinrsoni/smruti-cortex/issues/11)  Labels: priority/medium, area/ux
- [ ] [Pinned results / favorites](https://github.com/dhruvinrsoni/smruti-cortex/issues/12)  Labels: priority/medium, area/ux
- [ ] [Favicon caching for faster rendering](https://github.com/dhruvinrsoni/smruti-cortex/issues/13)  Labels: priority/medium, area/ux
- [ ] [Add preview snippet or metadata snippet](https://github.com/dhruvinrsoni/smruti-cortex/issues/14)  Labels: priority/medium, area/ux
- [ ] [Document scorer plugin interface](https://github.com/dhruvinrsoni/smruti-cortex/issues/15)  Labels: priority/medium, area/docs
- [ ] [Add AI embedding scorer (opt-in)](https://github.com/dhruvinrsoni/smruti-cortex/issues/16)  Labels: priority/medium, area/ai
- [ ] [Store embeddings only with user consent](https://github.com/dhruvinrsoni/smruti-cortex/issues/17)  Labels: priority/medium, area/privacy
- [ ] [Add API key management in settings](https://github.com/dhruvinrsoni/smruti-cortex/issues/18)  Labels: priority/medium, area/settings
- [ ] [Create promo screenshots for Chrome/Edge store](https://github.com/dhruvinrsoni/smruti-cortex/issues/19)  Labels: priority/low, area/marketing
- [ ] [Write Store Description + Release Notes](https://github.com/dhruvinrsoni/smruti-cortex/issues/20)  Labels: priority/low, area/marketing
- [ ] [Add GitHub Action to auto-zip builds](https://github.com/dhruvinrsoni/smruti-cortex/issues/21)  Labels: priority/low, area/ci
- [ ] [Prepare automated release upload](https://github.com/dhruvinrsoni/smruti-cortex/issues/22)  Labels: priority/low, area/ci
