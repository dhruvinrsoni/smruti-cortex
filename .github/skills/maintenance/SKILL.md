# Maintenance Skill — SmrutiCortex

Load this skill when handling bug reports, feature requests, releases, or Chrome Web Store submissions.

---

## Bug Fix Flow

1. **Understand** — Read the bug report. Reproduce if possible.
2. **Locate** — Use CLAUDE.md Critical File Map to find the relevant file.
3. **Fix** — Make the minimal change. Don't refactor surrounding code.
4. **Test** — `npm test` (all tests must pass — 1,252+ tests across 47 files).
5. **Build** — `npm run build` (must compile with zero errors).
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
5. **Build** — `npm run build` must succeed.
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
2. Full ship-check gate: `verify.mjs --release` (lint + build + unit tests + coverage + E2E + bundle bench + version sync + MV3 manifest + dist integrity + npm audit + store check + LICENSE + privacy URL + previous tag) — **before any disk writes**
3. Bump package.json, sync manifest.json
4. Re-build with new version, package zip
5. Generate CHANGELOG, scaffold submission doc via `npm run store init`
6. Single commit, tag, push, create GitHub Release
7. Print next-steps (zip path, CWS dashboard URL)

After it finishes: drag-drop the zip into the CWS dashboard, paste the "What's New" text, submit.

**Emergency override:** `npm run ship patch -- --skip-e2e` skips only E2E tests. Prints a warning and records `[ship-override: skip-e2e]` in the commit body. Lint, build, and unit tests always run.

**Post-release:** `npm run store check` verifies the submission doc, CHANGELOG entry, zip, and public CWS listing are all in sync. Treat failures as blockers.

**Release-doc invariant:** every released version MUST have a matching
`docs/store-submissions/vX.Y.Z-chrome-web-store.md` file. The ship command
auto-scaffolds this. Edit Sections 7 (Changes) and 9 (Checklist), then
delete the TODO preamble. `npm run store check` is the machine-enforced gate.

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
5. Upload `release/zips/smruti-cortex-vX.Y.Z.zip` (path printed by ship command)
6. Paste "What's new" text from Section 7 of the doc
7. Submit for review (typically 1-3 business days)
8. After submission: fill in the "Submitted" date and commit
9. `npm run store check` — verify everything is in sync

### Backfilling a missed submission doc

If a version was released without a submission doc:
- `npm run store init -- <missed-version>` — scaffolds from the previous doc
- `git diff v<prev>..v<current> manifest.json` — confirm permission deltas
- File the doc even if already submitted — it unblocks `npm run store check`

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
| `idle` | Wakes the MV3 service worker when the user returns to the browser after being away (uses `chrome.idle.onStateChanged` `idle → active` transition). Eliminates cold-start delay on the first interaction after a long idle. Receives ONLY session state (active/idle/locked); never reads page content or input. |
| `<all_urls>` | Optional: fetches favicons from Google API for display (no user data sent) |

> The table above is a quick reference for human Q&A. Authoritative wording lives in the latest `docs/store-submissions/vX.Y.Z-chrome-web-store.md` Section 4. Always quote the doc, not this table, when responding to a CWS reviewer.

### Manifest Permission Discipline (machine-enforced)

Every change to `manifest.json`'s `permissions` or `optional_permissions` arrays MUST land in the same commit as a `docs/store-submissions/vX.Y.Z-chrome-web-store.md` Section 4 update. The v9.2.0 `idle` regression existed because we had no automated link between manifest mutation and submission-doc mutation. Now we have three:

1. **Scaffolder banner** — `npm run store init` reads `git show v<prev>:manifest.json`, computes added/removed perms, and inserts a `PERMISSION DELTA` block in the new doc's TODO preamble showing exactly which `#### \`<perm>\`` blocks to add/remove.

2. **Pre-commit hard-fail** — `scripts/pre-commit-check.js` aborts (`exit 1`, no build runs) when `manifest.json` perm arrays differ from HEAD and no `docs/store-submissions/*.md` is staged. Bypass with `FORCE_PRE_COMMIT=1` (NOT recommended; the audit will still fail and CWS will reject).

3. **store check audit** — `npm run store check` runs `auditPermissions(manifest, doc)` and prints a `manifest <-> doc permission parity` line listing every `MISSING` or `STALE` justification. Treat any failure as a release blocker. The same audit is invoked inline by `npm run ship check`.

Operator workflow when a perm change is needed:

```bash
# 1. Edit manifest.json
$EDITOR manifest.json

# 2. Open the latest submission doc
$EDITOR docs/store-submissions/v$(node -p "require('./package.json').version")-chrome-web-store.md
# Add/remove #### `<perm>` blocks under Section 4 to match the manifest.

# 3. Stage and commit both at once
git add manifest.json docs/store-submissions/v*-chrome-web-store.md
git commit -m "feat: <description>"
# Pre-commit hook will print: "Manifest permission discipline: N perm
# change(s) staged with submission doc edit. Audit will run in store check."
# and proceed normally.

# 4. (optional, recommended) Run the audit explicitly
npm run store check
```

When scaffolding for a new release (the typical case for a fresh perm), use `npm run store init` instead of editing the previous version's doc — the scaffolder injects the PERMISSION DELTA banner that lists what to do.

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
npm run verify              # lint + build + unit tests + coverage + E2E — one command
```

Or individually: `npm test`, `npm run build`, `npm run lint`, `npm run e2e`.

Pre-commit hook runs build + unit tests (~20s) on every commit automatically.

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
verify           Codebase is sound       (no writes)
  └─ ship check  Ready to release        (no writes, = verify --release)
       └─ ship   Do the release          (writes, includes ship check)
```

Each layer adds exactly one concern. Lower layers never depend on upper layers.
`--skip-e2e` (ship) translates to `--no-e2e` (verify) at the boundary.

- **Pre-commit hook** (~20s): build + unit tests. Smart-skips for docs-only changes.
- **Archived workflows**: `.github/workflows/archived/` — intentionally disabled. See `archived/README.md` for revive instructions.
- **Dependabot**: weekly grouped npm PRs (minor+patch), monthly GitHub Actions bumps. Existing CI gates enforce safety on every PR.
- **CWS upload**: always manual (drag-drop). No API automation — minimal security surface for LTS.

---

## Troubleshooting

- **`_metadata` error on Load Unpacked**: CWS adds `_metadata/` to published packages for integrity verification. Chrome rejects it during "Load Unpacked". Fix: unzip, then run `npm run store unpack -- <folder>` to strip reserved entries.
- **Canonical local testing**: Use `npm run build` then "Load Unpacked" on `dist/` — this is identical to shipped code and has no `_metadata/`.

---

## Issue Triage — Ranking Reports

The in-extension Report ranking-issue button (popup footer + quick-search
overlay) files GitHub issues in a dedicated silo so the maintainer's
primary backlog stays uncluttered. Three GitHub Actions and one
client-side floodgate keep the silo healthy without daily intervention.

### Triage URL (bookmark this)

The maintainer-only filter that hides everything except live, un-triaged
ranking reports:

```
https://github.com/dhruvinrsoni/smruti-cortex/issues?q=is%3Aopen+is%3Aissue+label%3Aranking-bug+label%3Aneeds-triage
```

Save it. Skim once a week, more often if D5's rate limit is loosened.
Anything legitimate gets repriced (`priority: high|medium|low` strips it
out of the stale workflow's reaper too); anything bogus gets closed.

### Label Family

| Label | Source | Meaning |
|-------|--------|---------|
| `ranking-bug` | Extension `ranking-report.ts` + Issue Form template | Every report-button-filed issue carries this. Used by all three workflows as their scope filter. |
| `auto-report` | Extension only (PAT path *and* URL fallback in `ranking-report.ts`) | Distinguishes "filed by clicking the button" from "filed by hand via the form". Workflows treat them identically; the label exists for human triage signal. |
| `sink: ranking-reports` | Extension + triage workflow | The actual silo marker. Filtering on this label keeps ranking issues out of any "all open" view that excludes it. |
| `needs-triage` | Triage workflow + Issue Form default | Cleared by the maintainer once the report has been read. Powers the triage URL above. |
| `duplicate?` | Dedupe workflow | Question-marked deliberately — the workflow proposes, the maintainer disposes. Don't auto-close on this label. |
| `priority: high\|medium\|low` | Maintainer only | Exempts an issue from the stale reaper. Apply to anything you actually plan to act on. |
| `pinned` | Maintainer only | Same exemption as priority labels. Use for canonical "we know about this, here's the master thread" issues. |

Source of truth for label colours and descriptions: `.github/labels.yml`.
Sync with `bash .github/tools/sync-labels.sh` (requires `gh` auth).

### Workflows

All three live in `.github/workflows/` and only act on issues already
tagged `ranking-bug`. Safe to land/touch independently — none of them
read or write any other label family.

1. **`triage-ranking-reports.yml`** (D2)
   - Trigger: `issues` opened/labeled.
   - Adds `needs-triage` + `sink: ranking-reports` defensively (no-op if
     already present from the extension's URL fallback path).
   - Posts a one-shot orientation comment so a hand-filed report (no
     `auto-report` label) gets the same maintainer expectations as an
     auto-filed one.
   - Idempotent via a marker comment.

2. **`stale-ranking-reports.yml`** (D3)
   - Trigger: cron, weekly Mon 04:00 UTC.
   - Marks stale at 60d, closes at 90d. Caps at 50 ops per run.
   - Exempts `priority: high|medium|low` and `pinned`.
   - User-facing copy points back at the triage URL above.

3. **`dedupe-ranking-reports.yml`** (D4)
   - Trigger: `issues` opened/labeled.
   - Parses the title shape the extension emits:
     `[Ranking] "<query>" — <N> results, sort=<mode> (v<x.y>.<z>)`
   - Dedupe key: `(query, sort, major.minor)` — patch is excluded.
   - On match, posts `Possible duplicate of #N` and adds `duplicate?`.
     Maintainer confirms and closes manually.
   - Idempotent via a marker comment. Tolerates `--`, `–`, `—`.
   - Hand-filed reports that don't match the canonical title shape are
     skipped silently — humans dedupe themselves better than regex.

### Kill Switch / Rate Limit (D5)

Two-layered floodgate at the source:

- **Setting `reportButtonEnabled`** (default `true`).
  - Hides the Report button on both popup and quick-search overlay when
    flipped to `false`. Defensive re-check in the click handler closes
    the SETTINGS_CHANGED-vs-render race.
  - **Maintainer-only kill switch.** No UI surface — flip via the debug
    page or service worker console:

    ```js
    // From the service worker DevTools console (chrome://serviceworker-internals)
    chrome.storage.local.get('smrutiCortexSettings', ({ smrutiCortexSettings }) => {
      chrome.storage.local.set({
        smrutiCortexSettings: { ...smrutiCortexSettings, reportButtonEnabled: false },
      });
    });
    ```

  - When to flip: a sustained burst of low-quality / spam reports after
    a release. The triage URL above will spike well above its usual
    weekly cadence.
  - Restoring: same snippet with `reportButtonEnabled: true`.

- **5/24h sliding-window rate limit** (`src/shared/report-rate-limit.ts`).
  - Per-user, stored in `chrome.storage.local`. Survives browser
    restart (the maintainer's inbox doesn't reset at midnight).
  - Records the press *eagerly* in the click handler, before the chooser
    opens, so a rapid double-click cannot burst-file two reports.
  - Fails open on storage errors — never silently kills the debug
    channel.
  - To loosen / tighten: edit `MAX_REPORTS_PER_WINDOW` and `WINDOW_MS`
    constants in the module. Don't add a setting; user-facing knobs
    defeat the floodgate.

### Triage Cadence

- **Weekly**: open the triage URL, skim everything tagged
  `needs-triage`. Tag with `priority:` if real, close as
  `not-planned` if not.
- **Monthly**: spot-check `duplicate?` labels — confirm or strip.
- **On suspected abuse**: flip the kill switch (above), then open all
  recent ranking-bug issues sorted by created-desc and bulk-close as
  spam if appropriate.

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
