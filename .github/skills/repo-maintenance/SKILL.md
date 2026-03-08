---
name: repo-maintenance
description: Greedy cleanup decision framework — extract value from waste, never delete without justification
metadata:
  project: smruti-cortex
  version: "1.0"
---

# Repo Maintenance — Greedy Cleanup Mindset

## Core Principle

> "A manager who wastes nothing." Before deleting any file, ask: can it be activated, archived, or merged? Deletion is the last resort — not the first.

---

## The 4 Cleanup Questions

Ask these in order for every file you consider removing:

1. **Is it referenced anywhere?**
   - Grep for the filename and the exported symbol name
   - Check `package.json` scripts, workflow YAML, manifest.json, imports in `src/`
   - If referenced → KEEP. Do not touch.

2. **Does it have unique value not already covered?**
   - Compare against existing files with similar purpose
   - Look for: unique signals, unique logic, different trade-offs
   - If it adds something → MERGE or KEEP. Extract the useful parts.

3. **Can it be activated with minimal effort?**
   - Scripts with no entry in `package.json` are sleeping, not dead
   - A one-line addition to `package.json` can wake them up
   - If activatable → ACTIVATE. Don't delete working code.

4. **Is it historical / irreplaceable effort?**
   - Design artifacts (icons, prompts, sketches) took human effort
   - They can't be regenerated cheaply
   - If worth preserving → ARCHIVE to a `legacy/` subfolder.

---

## Decision Matrix

| Condition | Action |
|-----------|--------|
| Referenced in imports / package.json / manifest | **KEEP — do not touch** |
| Has unique logic not in active code | **MERGE the valuable parts, then delete** |
| Works but not wired up | **ACTIVATE — add to package.json** |
| Historical / human effort involved | **ARCHIVE to `legacy/` subfolder** |
| Truly dead: duplicate logic + zero references + no effort to regenerate | **DELETE** |

---

## Examples from SmrutiCortex v8 Cleanup

### ACTIVATED: `scripts/benchmark-performance.mjs`

**Situation:** Not in `package.json`, so appeared "dead."
**Analysis:** Reads dist/ bundle sizes, checks against KB thresholds, CI-aware output.
**Decision:** ACTIVATE — added `"benchmark": "node ./scripts/benchmark-performance.mjs"` to package.json.
**Lesson:** A script without a package.json entry is a sleeping tool. Check what it does before deleting.

### ARCHIVED: `src/assets/v1-*/v2-*/v3-*/v4-*/v5-*/v11-*` (17 icon files)

**Situation:** Not referenced in manifest.json or any source file.
**Analysis:** GenAI-generated icon design history. Took time and prompting effort to create.
**Decision:** ARCHIVE to `src/assets/legacy/` — preserves history, declutters active asset folder.
**Lesson:** If a human put deliberate effort into something, archive first. Deletion is irreversible.

### DELETED: `src/background/search/scorers/title-scorers.ts`

**Situation:** Not imported anywhere. Has a similar name to the active `title-scorer.ts`.
**Analysis:** Compared signal-by-signal against active scorer:
- Same base idea (title matching) but binary match vs graduated scoring
- Active scorer covers all its signals plus position, phrase, composition bonuses
- Not imported anywhere — confirmed with Grep over all `src/`
**Decision:** DELETE — no unique logic, fully superseded, never called.
**Lesson:** Even "core" sounding files can be dead. Compare logic explicitly before deciding.

### DELETED: `webpack.config.js`

**Situation:** Root-level config file.
**Analysis:** Project uses esbuild (`scripts/esbuild-*.mjs`). Webpack is absent from package.json, workflows, and all docs. This was a v1 artifact that was never removed after the esbuild migration.
**Decision:** DELETE — zero references, replaced entirely.
**Lesson:** Config files for tools no longer in `package.json` are almost always stale. Verify with Grep first.

---

## How to Run a Cleanup Audit

```bash
# 1. Find all tracked files
git ls-files | sort

# 2. Find imports/references for a suspicious file
grep -r "title-scorers" src/ --include="*.ts"

# 3. Check if a script is in package.json
grep "benchmark" package.json

# 4. Check if an asset is referenced in manifest
grep "v1-icon" manifest.json

# 5. See what's untracked
git status --short
```

---

## Cleanup Commit Pattern

Group changes by intent, not by file:
- `chore: remove dead code` — deleted unreferenced source files
- `chore: archive legacy assets` — git mv to `legacy/` subfolder
- `chore: activate dormant scripts` — added to package.json
- `chore: repo cleanup` — all of the above in one pass

Use `git mv` (not `rm` + `add`) for archives — preserves git history so `git log -- src/assets/legacy/v1-icon-16.svg` still works.
