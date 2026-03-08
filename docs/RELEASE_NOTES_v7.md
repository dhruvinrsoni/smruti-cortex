SmrutiCortex v7.0.0 — Release notes
===================================

Release tag: v7.0.0

Overview
--------
- Maintenance and compliance release focused on Chrome Web Store policy fixes,
  UX polish, and search-quality improvements.

Highlights
----------
- Fixed quick-search opening reliability: improved content-script messaging with a timeout wrapper to avoid falling back to the popup when the inline overlay is available.
- Prevent bookmark flooding in search results: bookmarks now show only for strong matches (word-boundary or complete-token matches), preventing unrelated bookmarks from appearing while typing partial queries.
- Popup UI polish: increased results area to better use available space and reduce empty whitespace below keyboard hints.
- Permissions compliance: removed unused `scripting` and `activeTab` permissions; content scripts are declaratively injected via `manifest.json` to satisfy Web Store policies.
- Updated package and manifest version to v7.0.0 and built production package `release/smruti-cortex-v7.0.0.zip`.

Bug Fixes & Improvements
------------------------
- Improved keyboard shortcut handling in the service worker (timeout for messaging, better detection of special pages).
- Strict bookmark matching logic added to `search-engine.ts` to require full-token or word-boundary matches for bookmarks.
- Increased popup results max-height from 280px → 340px to utilize space.
- Updated documentation and privacy pages to reflect revised permissions and submission notes.

Package
-------
- release/smruti-cortex-v7.0.0.zip (7.76 MB)

Contributors
------------
- dhruvinrsoni

Notes
-----
This release was prepared to address a Chrome Web Store rejection due to an unused permission (`scripting`). All permissions listed in `manifest.json` are actively used by the extension in this release.
