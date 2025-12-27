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
