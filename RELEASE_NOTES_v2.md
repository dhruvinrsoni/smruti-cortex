SmrutiCortex v2.1.0 — Release notes
===================================

Release tag: v2.1.0

Overview
--------
- UX overhaul: tabbed settings modal, favicon/bookmark visual refinements, license update.
- Primary goals: reduce settings-page cognitive load, consistent visuals, future-proof configuration UI.

Highlights
----------
- **Tabbed Settings Modal** — Settings reorganized into 6 themed tabs (General, Search, AI, Privacy, Data, Advanced). Replaces the single long-scroll layout. Tabs persist across open/close within a session.
  - *General*: Display mode, match highlighting, result focus delay, select-all-on-focus.
  - *Search*: Result diversity, bookmarks indexing.
  - *AI*: Ollama integration, semantic search / embeddings.
  - *Privacy*: Favicon loading, favicon cache, sensitive URL blacklist.
  - *Data*: Storage status, manual indexing, rebuild / reset / clear, bookmark extension.
  - *Advanced*: Log level, diagnostics & performance monitor, search debug mode.
- **Future-proof tab architecture** — Adding a new tab requires only a `<button>` in `.settings-tabs` and `data-tab` on the section. No JS changes needed for new tabs.
- **Favicon sizing fix** — Popup requests favicons at native display size (16 px list / 32 px cards) instead of oversized 64 px.
- **Bookmark indicator cleanup** — Inline styles moved to CSS classes; shared renderer no longer injects hardcoded colors/sizes.
- **Overlay bookmark/favicon CSS** — Overlay (content script) now has matching `.favicon`, `.bookmark-indicator`, `.bookmark-folder` rules for visual parity with the popup.
- **License** — Changed from MIT to Apache-2.0. CONTRIBUTING.md added.

Bug Fixes & Improvements
------------------------
- Bookmark star icon uses CSS class instead of inline style (DRY, theme-aware).
- Favicon `sz` parameter matches rendered size for crisper icons.
- Overlay styles include favicon and bookmark rules previously missing.

Breaking Changes
----------------
- None for end-users. Internal CSS class expectations changed for `.bookmark-indicator` and `.bookmark-folder`.

Migration Notes
---------------
- No migration steps required.

Previous release
----------------

SmrutiCortex v2.0.0 — Release notes
===================================

Release tag: v2.0.0 (commit: 6a99675)

Overview
--------
- Major release focused on UX, performance, and hardening.
- Primary goals: ultra-fast inline overlay, SOLID/DRY refactor, improved keyboard navigation, and performance instrumentation.

Highlights
----------
- Ultra-fast inline overlay (content-script) with closed Shadow DOM for instant keyboard-triggered search (<50ms).
- Two UI architecture: Inline overlay (primary) + extension popup (fallback).
- SOLID/DRY refactor: shared `search-ui-base.ts` abstraction across UIs.
- Added precise popup performance instrumentation: popup script entry + input-focus timestamps (logged via service worker).
- Service worker now recognizes `POPUP_PERF_LOG` messages and logs them for analysis.
- UX tweak: when tabbing back to search input from a result, the input is focused with the cursor placed (no auto-select) to avoid accidental replacement.
- Several keyboard navigation fixes and accessibility improvements.

Bug Fixes & Improvements
------------------------
- Fixed result-skipping bug during keyboard navigation.
- Avoided duplicate event listeners causing double actions.
- Improved logger initialization ordering to reduce cold-start logging gaps.

Breaking Changes
----------------
- No breaking changes expected for end-users. Internal logging messages added (safe).

Migration Notes
---------------
- No migration steps required.

Changelog (high level)
----------------------
See commit range: v1.0.0..v2.0.0

Contributors
------------
- dhruvinrsoni

For details, see the repository commit history and the structured changelog on the GitHub release page.
