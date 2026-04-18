# Maintenance Skill — SmrutiCortex

Load this skill when handling bug reports, feature requests, releases, or Chrome Web Store submissions.

---

## Bug Fix Flow

1. **Understand** — Read the bug report. Reproduce if possible.
2. **Locate** — Use CLAUDE.md Critical File Map to find the relevant file.
3. **Fix** — Make the minimal change. Don't refactor surrounding code.
4. **Test** — `npm test` (all tests must pass — 1,233+ tests across 46 files).
5. **Build** — `npm run build:prod` (must compile with zero errors).
6. **Manual test** — Tell the user:
   - Open `chrome://extensions` → reload unpacked → test the specific fix
   - For popup: click extension icon → search → verify behavior
   - For quick-search: press `Ctrl+Shift+S` on any page → test
   - For settings: open popup → gear icon → verify setting works
7. **Commit** — `fix: <concise description of what was broken and how it's fixed>`
8. **Release** — If user wants to ship: `npm run ship patch`

---

## Feature Flow

1. **Design** — Understand the request. Check if existing code can be extended.
2. **Load domain skill** — From `.github/skills/`: search-engine, ai-ollama, ui-components, settings, etc.
3. **Implement** — Follow existing patterns (Logger, SettingsManager, scorers are isolated, etc.)
4. **Test** — Write tests if touching core logic. `npm test` must pass.
5. **Build** — `npm run build:prod` must succeed.
6. **Manual test** — Same as bug fix above, focused on the new feature.
7. **Commit** — `feat: <concise description of the new capability>`
8. **Release** — If user wants to ship: `npm run ship minor`

---

## Release Flow

One command does everything:

```bash
npm run ship <patch|minor|major>
```

This runs, in strict order:
1. Validate prerequisites (main branch, clean tree, gh CLI)
2. Full verify gate: lint + build:prod + unit tests + E2E — **before any disk writes**
3. Bump package.json, sync manifest.json
4. Re-build with new version, package zip
5. Generate CHANGELOG, scaffold submission doc via `store:init`
6. Single commit, tag, push, create GitHub Release
7. Print next-steps (zip path, CWS dashboard URL)

After it finishes: drag-drop the zip into the CWS dashboard, paste the "What's New" text, submit.

**Emergency override:** `npm run ship patch -- --skip-e2e` skips only E2E tests. Prints a warning and records `[ship-override: skip-e2e]` in the commit body. Lint, build, and unit tests always run.

**Post-release:** `npm run store:check` verifies the submission doc, CHANGELOG entry, zip, and public CWS listing are all in sync. Treat failures as blockers.

**Release-doc invariant:** every released version MUST have a matching
`docs/store-submissions/vX.Y.Z-chrome-web-store.md` file. The ship command
auto-scaffolds this. Edit Sections 7 (Changes) and 9 (Checklist), then
delete the TODO preamble. `npm run store:check` is the machine-enforced gate.

### Semver Decision Tree

| Change Type | Bump | Example |
|-------------|------|---------|
| Bug fix, no API change | `patch` | Fix focus timer, fix circuit breaker |
| New feature, backward compatible | `minor` | Add new scorer, new setting, UI enhancement |
| Breaking change, removed feature | `major` | Change settings schema, remove API |
| Docs only, CI only | No release needed | README, workflows, screenshots |

Use `--dry-run` to preview the version bump without making changes.

---

## Chrome Web Store Submission

### Quick Steps
1. `npm run ship <patch|minor|major>` — auto-scaffolds the submission doc
2. Edit `docs/store-submissions/vX.Y.Z-chrome-web-store.md` — fill Sections 7 and 9, delete TODO preamble
3. If permissions unchanged, say so explicitly in Section 7 (reviewer fast-path)
4. Go to https://chrome.google.com/webstore/devconsole
5. Upload `release/smruti-cortex-vX.Y.Z.zip` (path printed by ship command)
6. Paste "What's new" text from Section 7 of the doc
7. Submit for review (typically 1-3 business days)
8. After submission: fill in the "Submitted" date and commit
9. `npm run store:check` — verify everything is in sync

### Backfilling a missed submission doc

If a version was released without a submission doc:
- `npm run store:init -- <missed-version>` — scaffolds from the previous doc
- `git diff v<prev>..v<current> manifest.json` — confirm permission deltas
- File the doc even if already submitted — it unblocks `npm run store:check`

### Permission Justifications (if reviewer asks)

| Permission | Why |
|------------|-----|
| `history` | Core feature: indexes visited page titles/URLs for full-text search |
| `bookmarks` | Merges bookmarks into search results alongside history |
| `storage` | Persists search index (IndexedDB), settings, and favicon cache locally |
| `tabs` | Opens results in new tabs; reads active tab URL for context |
| `alarms` | Schedules periodic background re-indexing when browser is idle |
| `scripting` | Re-injects our own content script (`content_scripts/quick-search.js`) into already-open tabs after an extension update so the keyboard shortcut keeps working without a page reload. NEVER runs arbitrary code, NEVER reads page content. |
| `activeTab` | Grants temporary host permission for the current tab ONLY when the user presses the keyboard shortcut. Required by `chrome.scripting` to re-inject the content script. No background access — strictly user-initiated. |
| `<all_urls>` | Optional: fetches favicons from Google API for display (no user data sent) |

### Common Rejection Reasons
- **Missing privacy policy** — Ensure https://dhruvinrsoni.github.io/smruti-cortex/privacy.html is live
- **Broad host permissions** — `<all_urls>` is optional (user must grant). Explain it's for favicon loading only.
- **Unclear purpose** — Store description must clearly state "browser history search"

---

## Manual Testing Guide

After loading unpacked from `dist/`:

### Core Search
- [ ] Open popup → type a query → results appear in <1s
- [ ] Arrow keys navigate results
- [ ] Enter opens result in current tab
- [ ] Ctrl+Enter opens in new tab
- [ ] Ctrl+C copies link as HTML
- [ ] Esc clears search

### Quick-Search Overlay
- [ ] Ctrl+Shift+S opens overlay on any page
- [ ] Search works same as popup
- [ ] Esc closes overlay
- [ ] Overlay doesn't break page styling (Shadow DOM isolation)

### AI Features (requires Ollama running)
- [ ] Enable AI in Settings → AI tab
- [ ] Search a word → see "AI Expanded +N [NEURAL]" badge
- [ ] Green highlights appear on AI-expanded keyword matches
- [ ] Disable Ollama → search still works (graceful degradation)

### Settings
- [ ] All 6 tabs load (General, Search, AI, Privacy, Data, Advanced)
- [ ] Changing a setting persists after popup close/reopen
- [ ] Factory reset clears everything

### Smart Defaults
- [ ] Open popup without typing → recent history appears immediately

---

## Regression Checklist

Run after ANY code change:

```bash
npm run verify              # lint + build:prod + unit tests + E2E — one command
```

Or individually: `npm test`, `npm run build:prod`, `npm run lint`, `npx playwright test`.

Pre-commit hook runs build:prod + unit tests (~20s) on every commit automatically.

Critical paths to manually verify:
1. Popup opens and shows results
2. Quick-search overlay opens with Ctrl+Shift+S
3. Keyboard navigation works (arrows, Enter, Esc)
4. Settings persist across sessions
5. Auto-focus moves to first result after delay

---

## Rollback Procedure

If a released version is broken:

```bash
# 1. Revert to previous version
git revert HEAD             # If only the release commit needs reverting
# OR
git reset --hard v8.0.0     # Reset to last known good tag (destructive)

# 2. Bump patch and re-release
npm run ship patch

# 3. Drag-drop the printed zip into the CWS dashboard
```

---

## CI Notes

### Release Pipeline Hierarchy

```
verify       Codebase is sound           (no writes)
  └─ preflight  Ready to release         (no writes, includes verify)
       └─ ship  Do the release           (writes, includes preflight)
```

Each layer adds exactly one concern. Lower layers never depend on upper layers.
`--skip-e2e` (ship) translates to `--no-e2e` (verify/preflight) at the boundary.

- **Pre-commit hook** (~20s): build:prod + unit tests. Smart-skips for docs-only changes.
- **Archived workflows**: `.github/workflows/archived/` — intentionally disabled. See `archived/README.md` for revive instructions.
- **Dependabot**: weekly grouped npm PRs (minor+patch), monthly GitHub Actions bumps. Existing CI gates enforce safety on every PR.
- **CWS upload**: always manual (drag-drop). No API automation — minimal security surface for LTS.

---

## Troubleshooting

- **`_metadata` error on Load Unpacked**: CWS adds `_metadata/` to published packages for integrity verification. Chrome rejects it during "Load Unpacked". Fix: unzip, then run `npm run unpack:cws -- <folder>` to strip reserved entries.
- **Canonical local testing**: Use `npm run build:prod` then "Load Unpacked" on `dist/` — this is identical to shipped code and has no `_metadata/`.

---

## Commit Convention

| Prefix | Meaning | Triggers |
|--------|---------|----------|
| `fix:` | Bug fix | Patch bump |
| `feat:` | New feature | Minor bump |
| `feat!:` | Breaking feature | Major bump |
| `docs:` | Documentation only | No bump |
| `chore:` | Maintenance, deps | No bump |
| `style:` | Formatting, CSS | No bump |
| `refactor:` | Code restructure | No bump |
| `test:` | Test changes | No bump |
| `perf:` | Performance improvement | Patch bump |
