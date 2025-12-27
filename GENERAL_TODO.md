# GENERAL_TODO (SmrutiCortex)

This is the single canonical checklist for privacy, security, UX, architecture, and future improvements.
Each item can be converted into GitHub Issues.

---

## 📦 VERSION HISTORY

| Version | Status | Description |
|---------|--------|-------------|
| v1.0 | ✅ Released | Initial working extension |
| v2.0 | ✅ Released | Ultra-fast overlay, SOLID/DRY refactor, two UI architecture |
| v3.0 | 🚧 Planned | Documentation, CI/CD, store-ready |

---

## ✅ COMPLETED — v2.0 (Current Release)
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

## 🚧 v3.0 ROADMAP — Documentation & Release Readiness

### Phase 1: Code Quality (Priority: 🔴 Critical)
- [ ] **CI/CD Pipeline** - GitHub Actions for lint, build, release automation
- [ ] **Unit Test Setup** - Vitest for shared utilities, 80% coverage target

### Phase 2: User Documentation (Priority: 🟡 High)
- [ ] **HOW_TO.md** - Installation, usage, keyboard shortcuts guide
- [ ] **FAQ.md** - Common questions (privacy, features, troubleshooting)
- [ ] **TROUBLESHOOTING.md** - Debug guide with solutions

### Phase 3: Developer Documentation (Priority: 🟢 Medium)
- [ ] **CONTRIBUTING.md** - Code style, PR guidelines, how to add scorers
- [ ] **DEVELOPER_ONBOARDING.md** - Architecture, data flow, key files

### Phase 4: Release Readiness (Priority: 🔵 Store Prep)
- [ ] **Production Build Script** - Minified builds, zip packaging
- [ ] **Store Deployment Guide** - Chrome/Edge submission process
- [ ] **README Polish** - Badges, backstory, roadmap section
- [ ] **Branding Guide** - Logo concepts, colors, icon specs

---

## 🔮 v4.0+ FUTURE ROADMAP

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