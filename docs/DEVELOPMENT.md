# Development Guide

A colleague asked: "There's a bug / I have an idea — what do I do?"
This document walks you through every step, from first thought to Chrome Web Store.

> For quick commands and file map, see `CLAUDE.md`.

---

## Development Lifecycle

### 1. Ideation & Scope

Before writing any code, answer these questions:

**What kind of change is it?**
- **Bug fix** → semver patch (e.g. 8.0.0 → 8.0.1)
- **New feature, backward-compatible** → semver minor (e.g. 8.0.0 → 8.1.0)
- **Breaking change** (removes a setting, changes behavior) → semver major (e.g. 8.0.0 → 9.0.0)

Rule of thumb: if a user who never reads changelogs would be surprised or broken, it's a major. If they get something new without losing anything, it's a minor. If they wouldn't notice except the bug is gone, it's a patch.

---

### 2. Design (with Claude Code)

For any non-trivial change, open Claude Code and plan before coding:

```bash
claude          # opens interactive session
# describe your feature/bug
# Claude enters plan mode, explores the codebase, proposes an approach
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

---

### 4. Verification

Before any release, all of these must pass:

```bash
npm test              # all test suites green
npm run lint          # 0 issues
npm run build:prod    # no TypeScript errors
```

**Smoke test checklist:**

| Scenario | Expected Result |
|----------|----------------|
| Ctrl+Shift+S opens overlay | Overlay appears, input focused |
| Type a search query | Results appear instantly |
| AI disabled in settings | No spinner, no AI bar |
| AI enabled + Ollama running | Spinner while processing → AI badge appears |
| Same query twice in a session | `cache-hit` badge on second search |
| Toggle AI off → on → search | Fresh AI call (not cached from before toggle) |
| Ctrl+Enter on result | Opens in new tab |
| Esc key | Clears/closes overlay |

---

### 5. Versioning

Update the version in `package.json` — `manifest.json` syncs automatically on every build via `scripts/sync-version.mjs`.

```json
// package.json
"version": "8.0.1"   ← change this only
```

Then document the change in `CHANGELOG.md`:
```markdown
## [8.0.1] — YYYY-MM-DD
### Bug Fixes
- Fixed: [description of the fix]
```

---

### 6. Release Package

```bash
npm run package
# Builds production bundle, then creates:
# release/smruti-cortex-vX.Y.Z.zip
```

Then tag and push:

```bash
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

---

### 7. Chrome Web Store Submission

Full guide: `CHROME_WEB_STORE.md`

Quick steps:
1. Go to Chrome Developer Dashboard → find SmrutiCortex → click **Edit**
2. Upload `release/smruti-cortex-vX.Y.Z.zip`
3. Fill "What's New" (copy highlights from CHANGELOG.md)
4. Submit for review

Review times:
- **Update to existing extension**: a few hours to 1 day
- **New features with broader permissions**: 3-7 business days
- **Initial submission**: 1-3 business days

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
