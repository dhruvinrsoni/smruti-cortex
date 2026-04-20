---
name: atomic-commits
description: Rules for atomic, verified git commits — one logical change per commit
metadata:
  project: smruti-cortex
  version: "9.1"
---

# Atomic Commits

## Core Rule

**One commit = one complete, verified, logical change.** If any verification step fails, nothing gets committed.

## Before Every Commit

1. `git status` — verify only relevant files are staged.
2. `git diff --staged` — review every line that will be committed.
3. `npm run coverage` — all tests must pass and coverage must not regress.
4. `node scripts/coverage-ratchet.mjs` — confirm no metric dropped.

## Commit Message Format

```
type(scope): concise why-description
```

| Type | When |
|------|------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring, no behavior change |
| `test` | Adding or improving tests |
| `chore` | Tooling, config, dependencies |
| `docs` | Documentation only |

**Scope** is the module/area: `service-worker`, `search-engine`, `settings`, `logger`, `core`, `scripts`, etc.

Examples:
- `test(service-worker): characterize message dispatch for all known types`
- `refactor(background): extract Port interfaces for database and ollama`
- `chore: ratchet coverage thresholds to 95/90/95/95`

## Forbidden Operations

- `git add .` or `git add -A` (stages blindly — always stage specific files)
- `git commit` without reviewing `git diff --staged` first
- `git push` unless the user explicitly asks
- `git push --force` (warn if targeting main/master)
- `git reset --hard`
- `git commit --allow-empty`, `--no-verify`, or `--no-gpg-sign`

## Amend Rules

Only `--amend` when ALL of:
1. User explicitly requested it, OR commit succeeded but pre-commit hook auto-modified files.
2. HEAD commit was created by the agent in this session.
3. Commit has NOT been pushed to remote.

If any condition is false, create a new commit instead.

## After a Failed Commit

Fix the root cause, then create a **new** commit. Never amend a failed commit.

## Multi-line Messages (PowerShell Safe)

Use multiple `-m` flags — never HEREDOC:
```
git commit -m "feat(search): add embedding scorer" -m "Uses cosine similarity against cached embeddings."
```
