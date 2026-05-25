# Development Guide

> For the complete file map and all npm commands, see `CLAUDE.md` in the repo root.

---

## ⚡ Quick Reference

Everything you need for day-to-day work and releases, in one place.

### Daily Development

```bash
npm run dev           # watch mode — rebuilds on save (load dist/ in chrome://extensions)
npm test              # run all 2,500+ unit tests (~60s)
npm run lint          # ESLint check (errors block; warnings are advisory)
npm run build         # production build (~30s)
```

### Before Every Commit

```bash
npm run coverage      # unit tests + coverage report (must stay above tiered floors)
```

### Release Pipeline

```bash
# 1. Verify everything is green
npm run ship check            # full gate: lint + build + tests + coverage + E2E + store audit

# 2. Ship (pick one — bumps version, builds, tags, pushes, creates GitHub Release + zip)
npm run ship patch            # bug fixes          9.4.0 → 9.4.1
npm run ship minor            # new features       9.4.0 → 9.5.0
npm run ship major            # breaking changes   9.4.0 → 10.0.0

# 3. Final audit before Chrome upload
npm run store check           # manifest ↔ Section 4 parity, zip exists, CHANGELOG entry

# Dry-run any ship without actually pushing:
npm run ship patch -- --dry-run
```

### One-off Utilities

```bash
npm run e2e                   # Playwright E2E (45 tests, 7 specs) — builds first
npm run verify                # lint + build + unit tests + coverage + E2E
npm run store init            # scaffold new store submission doc for next version
npm run dashboard preview     # build quality dashboard locally
```

---

## Semver Rules

| Change type | Version bump | Example |
|---|---|---|
| Bug fix, no API change | `patch` | 9.4.0 → 9.4.1 |
| New feature, backward-compatible | `minor` | 9.4.0 → 9.5.0 |
| Breaking change (removed setting, manifest perm change) | `major` | 9.4.0 → 10.0.0 |

**Rule of thumb:** if a user who never reads changelogs would be surprised or broken → major. If they get something new without losing anything → minor. If they wouldn't notice except a bug is gone → patch.

`docs:`, `chore:`, `test:`, `refactor:` commits do **not** bump the version.

---

## Full Lifecycle

### 1. Code the Change

Work on `main` for small fixes. For large features, use a branch:

```bash
git checkout -b feat/my-feature
```

Conventions:
- TypeScript only — no plain `.js` in `src/`
- Use `Logger.forComponent('Name')` — never raw `console.log`
- Settings → always through `SettingsManager` in `src/core/settings.ts`
- Browser APIs → always through `browserAPI` from `src/core/helpers.ts`
- Commit prefixes: `fix:` `feat:` `docs:` `chore:` `refactor:` `test:` (used by the release script for CHANGELOG)

### 2. Verify

```bash
npm test && npm run lint && npm run build
```

The pre-commit hook runs build + tests automatically on every `git commit`. Override with `FORCE_PRE_COMMIT=1` when needed (e.g. docs-only commit).

**Smoke test checklist:**

| Scenario | Expected |
|---|---|
| `Ctrl+Shift+S` opens overlay | Overlay appears, input focused |
| Type query, pause | Results appear after focus-delay |
| AI + Ollama running | Spinner → AI badge |
| Same query twice | `cache-hit` badge on second search |
| `Ctrl+Enter` on result | Opens in new tab |
| `Esc` | Closes overlay |
| 🧠 Semantic chip with 🤖 AI chip OFF | Semantic chip fully clickable (independent) |
| `/` prefix in overlay | Command palette opens |

### 3. Commit

One logical change per commit. Always `git diff --staged` before committing.

```bash
git add <specific-files>
git commit -m "fix: concise description of what and why"
```

### 4. Release

```bash
npm run ship check            # run this first — full gate
npm run ship patch            # (or minor / major)
```

`ship` does everything: bumps `package.json`, syncs `manifest.json`, regenerates CHANGELOG, scaffolds the store submission doc, builds, packages zip, creates git commit + tag, pushes, creates GitHub Release with zip attached. No manual steps needed.

### 5. Chrome Web Store

See `CHROME_WEB_STORE.md` for the full submission guide.

Quick steps after `ship`:
1. Open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devcenter/dashboard)
2. Find SmrutiCortex → click **Edit** (not "New Item" — it's already live)
3. Upload `release/zips/smruti-cortex-vX.Y.Z.zip`
4. Fill "Changes in this version" from the CHANGELOG (user-facing language, 3 bullets max)
5. Submit for review — updates take a few hours to 1 day

---

## Key Files

| What | Where |
|---|---|
| All npm commands | `CLAUDE.md` (repo root) |
| Search algorithm deep-dive | `docs/VIVEK_SEARCH_ALGORITHM.md` |
| AI / Ollama pipeline | `.github/skills/ai-ollama/SKILL.md` |
| Settings schema | `src/core/settings.ts` |
| Service worker entry | `src/background/service-worker.ts` |
| Test patterns & mocks | `.github/skills/testing/SKILL.md` |
| Store submission guide | `CHROME_WEB_STORE.md` |
