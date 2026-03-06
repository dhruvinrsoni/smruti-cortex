# Development Guide

A colleague asked: "There's a bug / I have an idea — what do I do?"
This document walks you through every step, from first thought to Chrome Web Store.

---

## Quick Command Reference

| Task | Command |
|------|---------|
| Dev build (fast) | `npm run build` |
| Production build | `npm run build:prod` |
| Run tests | `npm test` |
| Lint check | `npm run lint` |
| Package for store | `npm run package` |
| Watch mode | `npm run start:watch` |

Pre-commit hook runs automatically on `git commit`:
- Phase 1: `build` + `build:prod` (blocking — commit fails if build fails)
- Phase 3: `npm test` (non-blocking — reports but does not block)

---

## Development Lifecycle

### 1. Ideation & Scope

Before writing any code, answer these questions:

**What kind of change is it?**
- **Bug fix** → semver patch (e.g. 8.0.0 → 8.0.1)
- **New feature, backward-compatible** → semver minor (e.g. 8.0.0 → 8.1.0)
- **Breaking change** (removes a setting, changes behavior) → semver major (e.g. 8.0.0 → 9.0.0)

Rule of thumb: if a user who never reads changelogs would be surprised or broken, it's a major. If they get something new without losing anything, it's a minor. If they wouldn't notice except the bug is gone, it's a patch.

Check `ROADMAP.md` for existing backlog items before starting something new.

---

### 2. Design (with Claude Code)

For any non-trivial change, open Claude Code and plan before coding:

```bash
claude          # opens interactive session
# then describe your feature/bug
# Claude will enter plan mode, explore the codebase, propose an approach
# you approve the plan before any code is written
```

Key architecture references:
- `.github/skills/ai-ollama/SKILL.md` — AI search pipeline
- `.github/skills/settings/SKILL.md` — how settings flow through the extension
- `src/background/service-worker.ts` — message handler hub (all background logic)
- `src/core/` — shared utilities (helpers, logger, settings, scorer types)

Existing patterns to follow:
- All browser API access goes through `browserAPI` from `src/core/helpers.ts`
- Settings changes → `SettingsManager` in `src/core/settings.ts`
- Background ↔ UI messages use typed message objects (see service-worker.ts for examples)
- Tests live in `src/background/__tests__/` and `src/popup/__tests__/`

---

### 3. Implementation

Work on `main` for small fixes. For large features, use a branch:

```bash
git checkout -b feat/my-feature
```

Rules:
- TypeScript only — no plain JS in `src/`
- No `console.log` in production code (use `Logger` from `src/core/logger.ts`)
- Lint clean before committing — run `npm run lint` and fix any issues
- Follow the style of the file you're editing (curly braces on all if/else, single quotes, etc.)

---

### 4. Verification

Before any release, all of these must pass:

```bash
npm test              # all test suites green
npm run lint          # 0 issues (zero output = clean)
npm run build:prod    # no TypeScript errors
```

Then manual smoke tests — see `TESTING_and_DEBUG_GUIDE.md` for the full guide.

Core smoke test checklist:

| Scenario | Expected Result |
|----------|----------------|
| Ctrl+Shift+S opens overlay | ✅ Overlay appears, input focused |
| Type a search query | ✅ Results appear instantly |
| AI disabled in settings | ✅ No spinner, no AI bar |
| AI enabled + Ollama running | ✅ Spinner while processing → AI badge appears |
| Same query twice in a session | ✅ `cache-hit` badge on second search |
| Toggle AI off → on → search | ✅ Fresh AI call (not cached from before toggle) |
| Ctrl+Enter on result | ✅ Opens in new tab |
| Esc key | ✅ Clears/closes overlay |

---

### 5. Versioning

Update the version in `package.json` — `manifest.json` syncs automatically on every build via `scripts/sync-version.mjs`.

```json
// package.json
"version": "8.0.1"   ← change this only
```

Then document the change:
1. Add a new section to `CHANGELOG.md` at the top:
   ```markdown
   ## [8.0.1] — YYYY-MM-DD
   ### Bug Fixes
   - Fixed: [description of the fix]
   ```
2. Create `RELEASE_NOTES_v8.0.1.md` (or append to `RELEASE_NOTES_v8.md` for patch releases)

---

### 6. Release Package

```bash
npm run package
# Builds production bundle, then creates:
# release/smruti-cortex-vX.Y.Z.zip
```

Then tag and push:

```bash
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

The CI pipeline (`ci.yml`) runs automatically on push and validates the build.

---

### 7. Chrome Web Store Submission

Full guide: `CHROME_WEB_STORE.md`

Quick steps:
1. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devcenter/dashboard)
2. Find SmrutiCortex → click **Edit**
3. Upload `release/smruti-cortex-vX.Y.Z.zip`
4. Fill "What's New" (copy highlights from release notes)
5. Submit for review

Review times:
- **Update to existing extension**: a few hours to 1 day
- **New features with broader permissions**: 3-7 business days
- **Initial submission**: 1-3 business days

---

## Existing Docs Reference

| Document | What it covers |
|----------|---------------|
| `README.md` | User-facing overview, installation, features |
| `CHANGELOG.md` | Full version history |
| `CHROME_WEB_STORE.md` | Store listing copy, privacy policy, submission guide |
| `docs/TESTING_and_DEBUG_GUIDE.md` | Build, test, debugging, diagnostics |
| `docs/ROADMAP.md` | Feature backlog and ideas |
| `.github/skills/ai-ollama/SKILL.md` | AI pipeline architecture |
| `.github/skills/settings/SKILL.md` | Settings system design |

---

## Semver Quick Reference

```
MAJOR.MINOR.PATCH

8.0.0   ← current
8.0.1   ← bug fix (patch)
8.1.0   ← new feature, no breakage (minor)
9.0.0   ← breaking change (major)
```

When in doubt: use patch for fixes, minor for additions. Reserve major for genuine breaking changes (e.g., removing a setting, changing a permission).
