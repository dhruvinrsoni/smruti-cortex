# GENERAL_TODO (SmritiCortex)

This is the single canonical checklist for privacy, security, UX, architecture, and future improvements.  
Each item can be converted into GitHub Issues.

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
- [ ] Improve keyboard navigation (Home, End, PageUp/PageDown)
- [ ] Add “Pinned results” or favorites
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