# GENERAL_TODO (SmritiCortex)

This is the single canonical checklist for tasks, improvements, security hardening, privacy decisions, and future work. Treat each line as an actionable ticket — you can convert items into GitHub issues later.

---

## High Priority — Privacy & User Safety
- [ ] **Onboarding privacy prompt**: ask user explicitly during first-run whether to enable metadata extraction (content scripts). Provide clear text explaining what data is read and why.
- [ ] **Local-only default**: ensure no data leaves the device by default. Any cloud/AI feature must be opt-in.
- [ ] **Permissions UI page**: add an "Explain permissions" page in settings (why history, content scripts, host permissions).
- [ ] **Sensitive-host blacklist**: exclude content scripts on a default list (banking sites, password managers, health portals). Add toggle to disable extractor on all sites.
- [ ] **Clear all data**: add a button to safely erase IndexedDB + chrome.storage and confirm twice.
- [ ] **Retention policy**: implement a configurable retention period (e.g., 90 days) and background GC to delete older records.
- [ ] **Audit logging**: log sensitive operations locally (for debugging), ensure logs are not sent externally.

## High Priority — Correctness & Reliability
- [ ] **MergeMetadata unit tests**: verify metadata merging logic, canonical URL handling and tokenization.
- [ ] **Index rebuild tool**: implement and QA a "rebuild index" manual action that reimports from history and re-indexes metadata.
- [ ] **Background resilience**: handle service-worker restarts gracefully, including incremental indexing checkpoints.
- [ ] **IndexedDB quota handling**: handle quota errors and surface a helpful UI message.

## Medium Priority — UX & Discoverability
- [ ] **Onboarding walkthrough**: short 3-step guide to show hotkeys, omnibox usage, privacy toggle.
- [ ] **Keyboard-first UX polish**: ensure arrow nav, enter (open), ctrl/shift modifiers, markdown-copy shortcut.
- [ ] **Result preview improvements**: add small snippet, favicon, and last-visit timestamp.
- [ ] **Pinned + bookmarked boosts**: UI to pin results or boost domains.

## Medium Priority — Extensibility & AI-readiness
- [ ] **Scorer plugin interface docs**: publish a short guide for adding a scorer module.
- [ ] **AI opt-in workflow**: carefully design an opt-in screen for connecting to an AI provider (API key input, usage limits, data flow explanation).
- [ ] **Embeddings pipeline design doc**: outline process for creating and storing embeddings (client-side vs server-side).

## Low Priority — Telemetry & Analytics (Opt-in only)
- [ ] **Anonymized telemetry**: opt-in only; send minimal aggregate metrics if user consents (e.g., time-to-first-result).
- [ ] **Usage diagnostics export**: allow users to export anonymized diagnostics for bug reports (local file with optional passphrase).

## Low Priority — Packaging & Distribution
- [ ] **Store assets**: create store-ready images, screenshots, promotional text, and a privacy policy page.
- [ ] **Auto-release flow**: enable GitHub Action to build and prepare zip artifacts for release.
- [ ] **Extension signing checklist**: create a step-by-step checklist for Chrome/Edge store submission.

## Future / Nice-to-have
- [ ] **Encrypted cloud sync** (E2E) with user passphrase
- [ ] **Native messaging bridge** to integrate Everything (or local file search) optionally
- [ ] **Full-text page indexing** (opt-in)
- [ ] **Session snapshot & restore**
- [ ] **Desktop companion app for advanced indexing**

---

## How to use this file
- Convert each high-priority item into a GitHub Issue with labels: `privacy`, `bug`, `enhancement`, `docs`.
- Triage and assign owners. Mark items `blocked` if they require design or legal review.
- Regularly update this file when new security/privacy mandates arise or user feedback suggests changes.