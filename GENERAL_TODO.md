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

---

## ✅ COMPLETED — v3.0 (Current Release)
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

##  v4.0+ FUTURE ROADMAP

### AI & Intelligence
- [ ] AI embedding scorer (opt-in)
- [ ] Semantic search with embeddings
- [ ] Query expansion
- [ ] API key management in settings

### Premium Features (Potential Monetization)
- [ ] Cross-device sync (Chrome Sync API)
- [ ] End-to-end encrypted sync engine
- [ ] Session snapshots + restore workspaces

### Analytics (Privacy-Respecting)
- [ ] Opt-in anonymized local analytics
- [ ] Export diagnostics for bug reporting

---

## HIGH PRIORITY — PRIVACY & SECURITY
- [ ] Add onboarding privacy prompt (explain metadata extraction clearly to user)
- [ ] Default to “Local-only” processing (no external data usage)
- [ ] Explain permissions within extension Options page
- [ ] Add sensitive-site blacklist (disable extractor on banks, password portals)
- [ ] Add toggle: “Disable metadata extraction”
- [ ] Add “Delete All Data” (IndexedDB + chrome.storage)
- [ ] Add manual “Rebuild Index” button
- [ ] Implement data retention settings (e.g., keep last 90 days)

---

## HIGH PRIORITY — CORRECTNESS & RELIABILITY
- [ ] Unit tests for mergeMetadata logic
- [ ] Build index rebuild flow (full history import)
- [ ] Add background resilience (SW restart recovery)
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
- [ ] Document scorer plugin interface
- [ ] Add AI embedding scorer (opt-in)
- [ ] Store embeddings only with user consent
- [ ] Add API key management in settings

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
- Maintain privacy/security parity with browser store requirements