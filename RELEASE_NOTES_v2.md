SmrutiCortex v2.2.0 — Release notes
===================================

Release tag: v2.2.0

Overview
--------
- **Deep Search™ algorithm** — Complete overhaul of the search ranking engine with graduated match classification, replacing binary substring matching with a 4-tier quality system.
- Primary goals: dramatically better ranking for partial and multi-word queries, production-grade search quality.

Highlights
----------
- **Graduated Match Classification** — Every query token is classified as EXACT (word boundary: 1.0), PREFIX (start of word: 0.75), SUBSTRING (mid-word: 0.4), or NONE (0.0). This replaces the binary `includes()` matching used by all scorers.
  - *Example*: `rar my iss` → "rar" EXACT (1.0), "my" EXACT (1.0), "iss" PREFIX of "Issue" (0.75) → graduated score 0.917
- **Enhanced Title Scorer** — 6-signal scoring: graduated quality, position bonus (earlier in title = better), consecutive token bonus (phrase matching), composition analysis (all-exact vs mixed vs substring), starts-with bonus.
- **Enhanced Multi-Token Scorer** — Graduated coverage with exponential reward, match quality composition bonus, and consecutive token bonus.
- **Enhanced URL & Meta Scorers** — All scorers now use `graduatedMatchScore()` instead of binary `includes()`.
- **Enhanced Cross-Dimensional Scorer** — Match quality weights applied per dimension.
- **Graduated Post-Score Boosters** — Title quality multiplier now ranges from ×1.10 (all substring) through ×1.45 (all exact), with proportional values for mixed matches. Consecutive token bonus applied.
- **Position-aware Scoring** — Tokens matching earlier in the title score higher.
- **Phrase Matching** — Consecutive token detection rewards query terms appearing together in the text.
- **New Tokenizer Utilities** — `classifyMatch()`, `classifyTokenMatches()`, `graduatedMatchScore()`, `matchPosition()`, `countConsecutiveMatches()` — exported for all scorers and future extensions.
- **Deep Search™ Documentation** — Comprehensive algorithm documentation at `docs/DEEP_SEARCH_ALGORITHM.md` with collapsible sections, formulas, examples, and future roadmap.
- **Branding** — "Deep Search™" added to popup subtitle, README feature table, and Chrome Web Store listing.

Bug Fixes & Improvements
------------------------
- Backward-compatible legacy API: `isExactKeywordMatch()` and `countExactKeywordMatches()` still work, now implemented via `classifyMatch()`.
- Match classification uses regex-based word-boundary detection (handles hyphens, brackets, dots).

Breaking Changes
----------------
- None for end-users. Internal scorer APIs now use `MatchType` enum and graduated scoring functions.

Migration Notes
---------------
- No migration steps required.

Previous release
----------------

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
