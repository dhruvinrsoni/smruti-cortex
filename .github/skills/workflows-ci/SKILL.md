---
name: workflows-ci
description: GitHub Actions workflows. Three active files; everything else is archived.
metadata:
  project: smruti-cortex
  version: "9.3"
---

# Workflows & CI/CD

## Active Workflows (3)

| Workflow | Triggers | Purpose |
|---|---|---|
| `health-check.yml` | PR main, push main, push tag `v[0-9]+.[0-9]+.[0-9]+`, monthly cron, manual | The single CI gate. Wraps `npm run verify` + adds explicit `npm audit` / `license-checker` / hardcoded-secret grep. Posts PR coverage delta comment. Publishes the public Quality Report dashboard via `actions/deploy-pages@v4` on push to main. **Upserts the GitHub Release with the zip on strict-format tag push** (CI's `GITHUB_TOKEN` always works — fixes the local `gh release create` work-account auth pain). |
| `lint-report.yml` | manual only (`workflow_dispatch`) | On-demand LLM-friendly lint dump. Runs ESLint with JSON output, builds a Markdown digest grouped by rule + file, uploads as artifact (90d). Zero auto-cost. |
| `ranking-reports.yml` | `issues: opened/labeled` (gated to `ranking-bug`), Mondays 04:00 UTC cron, manual | Two jobs: `intake` (triage + dedupe combined into one `github-script` call), `gc` (`actions/stale@v9` weekly garbage collection). Replaces three older single-purpose ranking workflows. |

## Design Principles

- **CI is a thin wrapper.** All quality logic lives in `scripts/verify.mjs` and friends. When `verify.mjs` learns a new check, CI inherits it for free — no workflow edits.
- **Reports everything.** Every step uses `continue-on-error: true` so one failure doesn't mask the others. PR authors see ALL the things to fix in one run, not just the first.
- **Strict tag pattern.** `v[0-9]+.[0-9]+.[0-9]+` matches `v9.3.0`, rejects `v9.3.0-rc1`, `v9.3.0-experiment`, `mark-this-commit`. Playground tags safe.
- **Push to main does NOT create a Release.** Only strict-format tag push does. Push to main only refreshes the dashboard.
- **Pages source MUST be set to "GitHub Actions"** (Settings → Pages). The `actions/deploy-pages@v4` step requires this. One-time setup; never changes.
- **Belt-and-suspenders Release creation.** `release.mjs` continues to call `gh release create` locally. CI's tag-trigger upsert uses `--clobber` so duplication is a no-op. First success wins.

## Helper Scripts (called from health-check.yml)

| Script | Purpose | Local equivalent |
|---|---|---|
| `scripts/build-dashboard.mjs` | Read `coverage/`, `nfr-reports/audit.json`, `lint-report.json`, `dist/` sizes; write `_site/index.html` + `summary.json`. With `--copy-coverage` also copies coverage HTML | `node scripts/build-dashboard.mjs` (preview locally before pushing) |
| `scripts/build-lint-report.mjs` | Read `lint-report.json` (ESLint JSON output) → write `lint-report.md` Markdown digest grouped by rule + file | `npm run lint -- --format json --output-file lint-report.json && node scripts/build-lint-report.mjs` |
| `scripts/extract-changelog.mjs` | Extract one version's `## [X.Y.Z]` section from `CHANGELOG.md`. Used by health-check's tag-trigger Release notes | `node scripts/extract-changelog.mjs v9.3.0` |

## Permissions Map

| Workflow | Needs | Why |
|---|---|---|
| `health-check.yml` | `contents: write`, `pages: write`, `id-token: write`, `pull-requests: write` | Release upsert (contents), Pages publish (pages + OIDC), PR coverage comment (pull-requests) |
| `lint-report.yml` | default (read-only) | Just generates artifacts |
| `ranking-reports.yml` | `issues: write`, `contents: read` | Apply labels, post comments, run actions/stale |

## Trigger Matrix Cheat Sheet

| Event | health-check | lint-report | ranking-reports |
|---|---|---|---|
| PR to main | yes (verify default + PR coverage comment) | no | no |
| Push to main | yes (verify default + Pages publish) | no | no |
| Push tag `v9.3.0` | yes (verify --release + Release upsert) | no | no |
| Push tag `v9.3.0-rc1` | **no** (strict pattern excludes suffixes) | no | no |
| Cron (monthly 1st) | yes | no | no |
| Cron (Mondays 04:00) | no | no | yes (`gc` job only) |
| Issue opened/labeled `ranking-bug` | no | no | yes (`intake` job only) |
| Manual dispatch | yes (with `verify_flags` input) | yes | yes |

## Adding a New Workflow

Strongly preferred: **don't.** Add a step to `health-check.yml` or `ranking-reports.yml` instead. The whole point of the 3-workflow target shape is that one gate handles everything. Adding a fourth file means re-introducing the redundancy this layout retired.

If you must:
1. Decide if it really can't fit into health-check (manual-only narrow tools like `lint-report.yml` are the bar).
2. Create `.github/workflows/<name>.yml` with a purpose/trigger header comment.
3. Use `timeout-minutes` to prevent runaway jobs.
4. Use Node 22 (`actions/setup-node@v4` with `node-version: '22'`).
5. Update this skill's matrix above.

## Reviving an Archived Workflow

```bash
git mv .github/workflows/archived/<name>.yml .github/workflows/<name>.yml
git commit -m "chore(ci): revive <name> workflow — <reason>"
```

See `.github/workflows/archived/README.md` for the full list of archived files and why each was retired.

## Public Quality Report Dashboard

Published to: `https://dhruvinrsoni.github.io/smruti-cortex/quality-report/`

Generated fresh by `health-check.yml` on push to main + monthly cron + manual dispatch. **No commit-back to main** — uses `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`.

To preview locally before pushing:

```bash
npm run coverage
node scripts/build-dashboard.mjs --copy-coverage --out _site
# open _site/index.html in your browser
```

`_site/` is gitignored.
