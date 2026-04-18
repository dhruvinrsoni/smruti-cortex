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
8. **Release** — If user wants to ship: `node scripts/release.mjs patch`

---

## Feature Flow

1. **Design** — Understand the request. Check if existing code can be extended.
2. **Load domain skill** — From `.github/skills/`: search-engine, ai-ollama, ui-components, settings, etc.
3. **Implement** — Follow existing patterns (Logger, SettingsManager, scorers are isolated, etc.)
4. **Test** — Write tests if touching core logic. `npm test` must pass.
5. **Build** — `npm run build:prod` must succeed.
6. **Manual test** — Same as bug fix above, focused on the new feature.
7. **Commit** — `feat: <concise description of the new capability>`
8. **Release** — If user wants to ship: `node scripts/release.mjs minor`

---

## Release Flow

```bash
# 1. Automated: bumps version, updates changelog, tags, pushes, creates GitHub Release
node scripts/release.mjs <patch|minor|major>

# 2. Package for Chrome Web Store
npm run package

# 3. Scaffold the store submission doc from the previous version
npm run store:init -- <new-version>       # e.g. npm run store:init -- 9.2.0
#    -> writes docs/store-submissions/v<new>-chrome-web-store.md with a TODO
#       preamble and a raw git-log dump of commits since the previous tag.
#    Edit Sections 7 (Changes from Previous) and 9 (Checklist), then delete
#    the TODO comment block.

# 4. Generate store submission text for the dashboard paste
node scripts/store-prep.mjs

# 5. Upload zip to the Chrome Web Store dashboard
#    https://chrome.google.com/webstore/devconsole

# 6. After the store accepts the submission, verify everything lines up
npm run store:check                        # defaults to the latest git tag
#    -> asserts: submission doc exists, "Submitted" date is filled, zip
#       present, CHANGELOG entry present, public listing is on the expected
#       version, and the public "What's New" text is not stale.
```

**Release-doc invariant:** every released version MUST have a matching
`docs/store-submissions/vX.Y.Z-chrome-web-store.md` file, even for
reliability-only patch releases with no permission changes. Missing docs
force the next reviewer (human or AI) to reconstruct the submission state
from commit history — which is slow and error-prone. `npm run store:check`
is the machine-enforced gate for this invariant; run it as part of any
post-release sanity pass and treat a failing run as a blocker.

### Semver Decision Tree

| Change Type | Bump | Example |
|-------------|------|---------|
| Bug fix, no API change | `patch` | Fix focus timer, fix circuit breaker |
| New feature, backward compatible | `minor` | Add new scorer, new setting, UI enhancement |
| Breaking change, removed feature | `major` | Change settings schema, remove API |
| Docs only, CI only | No release needed | README, workflows, screenshots |

### Release Script Details (`scripts/release.mjs`)

The script does everything automatically:
- Validates: clean tree, on main branch, tests pass, build succeeds
- Bumps version in `package.json` → syncs to `manifest.json`
- Generates changelog from conventional commits since last tag
- Commits, tags, pushes to origin
- Creates GitHub Release with changelog
- Runs `npm run package` for the store zip

Use `--dry-run` to preview without making changes.

---

## Chrome Web Store Submission

### Quick Steps
1. **Scaffold the submission record first:** `npm run store:init -- X.Y.Z`.
   This copies the most recent doc, updates headers, and inserts a TODO
   preamble with a raw git-log dump of commits since the previous tag.
   Rewrite Sections 7 ("Changes from Previous Submission") and 9
   ("Submission Checklist") from that dump, then delete the TODO block.
   If permissions are unchanged, say so explicitly in Section 7 — it is a
   reviewer fast-path.
2. Commit the doc: `git commit -m "docs: add Chrome Web Store submission record for vX.Y.Z"`
3. Run `node scripts/store-prep.mjs` — prints all text you need
4. Go to https://chrome.google.com/webstore/devconsole
5. Select SmrutiCortex → "Package" tab → Upload new package
6. Upload `release/smruti-cortex-vX.Y.Z.zip`
7. Go to "Store listing" → paste "What's new" text from Section 7 of the doc
8. Submit for review (typically 1-3 business days)
9. After submission: fill in the "Submitted" date at the top of the doc and commit
10. Run `npm run store:check` — verifies the submission doc, CHANGELOG,
    zip, and public listing are all in sync. Treat failures as blockers.

### Backfilling a missed submission doc

If a version was released without a submission doc (e.g. v9.1.0):
- `npm run store:init -- <missed-version>` — scaffolds from the previous doc
  and generates the git-log dump automatically.
- `git diff v<prev>..v<current> manifest.json` — confirm any permission deltas
- Explicitly state "No new permissions" in Section 7 if true — reviewer fast-path
- File the doc even if the version has already been submitted — it is the
  historical record and unblocks `npm run store:check`.

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
npm test                    # all tests pass (1,233+ unit tests across 46 files)
npm run build:prod          # Compiles with zero errors
npm run lint                # No new warnings above threshold
npx playwright test         # 45 E2E tests across 7 spec files (requires build first)
```

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
node scripts/release.mjs patch

# 3. Re-upload to Chrome Web Store
npm run package
node scripts/store-prep.mjs
```

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
