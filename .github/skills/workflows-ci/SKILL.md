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
| `health-check.yml` | PR main, push main, push tag `v[0-9]+.[0-9]+.[0-9]+`, monthly cron, manual | The single CI gate. Wraps `npm run verify` + adds explicit `npm audit` / `license-checker` / hardcoded-secret grep. Posts PR coverage delta comment. Generates the always-fresh Quality Report dashboard into the run artifact (CI does NOT touch `docs/quality-report/` — see "GitHub Pages" + "Quality Report — two surfaces" below). **Upserts the GitHub Release with the zip on strict-format tag push** (CI's `GITHUB_TOKEN` always works — fixes the local `gh release create` work-account auth pain). |
| `lint-report.yml` | manual only (`workflow_dispatch`) | On-demand LLM-friendly lint dump. Runs ESLint with JSON output, builds a Markdown digest grouped by rule + file, uploads as artifact (90d). Zero auto-cost. |
| `ranking-reports.yml` | `issues: opened/labeled` (gated to `ranking-bug`), Mondays 04:00 UTC cron, manual | Two jobs: `intake` (triage + dedupe combined into one `github-script` call), `gc` (`actions/stale@v9` weekly garbage collection). Replaces three older single-purpose ranking workflows. |

## GitHub Pages — intentionally NOT owned by CI

**Pages source: "Deploy from a branch" → `main` / `/docs`.** Set in repo Settings → Pages and never changed by any workflow. The marketing site at `https://dhruvinrsoni.github.io/smruti-cortex/` and the **CWS-required privacy policy at `/privacy.html`** are served straight out of `docs/` on `main`.

This is deliberate, not a leftover:

- **Reliability priority.** Marketing + privacy must be live regardless of CI health. If `health-check.yml` breaks for any reason — a YAML typo, an action upgrade, a permissions glitch, a quota issue — the public site doesn't notice. `verify.mjs` `--release` mode already asserts HTTP 200 on `https://dhruvinrsoni.github.io/smruti-cortex/privacy.html` (`scripts/verify.mjs` line ~324) so `npm run ship check` catches a broken privacy URL before any release ships.
- **UI fallback is trivial.** If something does go wrong, push a `docs/` fix → Pages picks it up in ~30s. No CI involvement needed.
- **No `[skip ci]` commit-back noise.** The old `nfr-report.yml` used to commit back into `docs/quality-report/` on every main push. We retired that. CI never writes to `docs/` anymore.

If you ever feel tempted to make CI deploy or Pages-Action-publish: **don't.** It single-points-of-failures the privacy URL on whatever workflow does the publishing. We learned this the painful way once.

## Quality Report — two surfaces, one source

| Surface | Where | Refreshed by | When |
|---|---|---|---|
| **Live (artifact)** | `smruti-cortex-health-bundle` artifact, `dashboard/index.html` inside | `health-check.yml` (every run) | Per-run, always fresh. Download from any Actions run. |
| **Static (snapshot)** | `https://dhruvinrsoni.github.io/smruti-cortex/quality-report/` | `scripts/release.mjs` (auto on `npm run ship`) + `npm run dashboard refresh` (manual ad-hoc) | On release boundaries, version-stamped. CI never touches it. |

The static snapshot is committed to `docs/quality-report/index.html` + `summary.json` (~6 KB total, no `coverage/` HTML drill-down — that lives in the artifact only). It carries a yellow "Static snapshot @ vX.Y.Z" banner pointing back at the live artifact for current numbers.

**Why this hybrid:** the live URL gives external visitors a one-click read of "this extension's quality at the version they have installed" without the CI commit-back noise we explicitly retired. Maintainers and reviewers who want live numbers grab the artifact. Both surfaces use the same `scripts/build-dashboard.mjs` script — only the `--snapshot-version` flag differentiates them (and triggers the banner).

**`npm run dashboard <subcommand>`:**

- `refresh` — wipe `docs/quality-report/`, regenerate from current `coverage/`/`nfr-reports/`/`dist/`, stamp current `package.json` version. Operator commits afterwards. Useful for ad-hoc updates between releases.
- `preview` — build into local `dashboard/` (no commit), mirrors what CI's artifact looks like.

`scripts/release.mjs` calls `build-dashboard.mjs` directly between Steps 6 and 7, folding the regenerated snapshot into the release commit — zero extra commits per release.

## Design Principles

- **CI is a thin wrapper.** All quality logic lives in `scripts/verify.mjs` and friends. When `verify.mjs` learns a new check, CI inherits it for free — no workflow edits.
- **Reports everything.** Every step uses `continue-on-error: true` so one failure doesn't mask the others. PR authors see ALL the things to fix in one run, not just the first.
- **Strict tag pattern.** `v[0-9]+.[0-9]+.[0-9]+` matches `v9.3.0`, rejects `v9.3.0-rc1`, `v9.3.0-experiment`, `mark-this-commit`. Playground tags safe.
- **Push to main does NOT create a Release.** Only strict-format tag push does.
- **CI never deploys anything to a public URL.** GitHub Releases (binary distribution to humans) and the Quality Report artifact (download-and-open) are the only outputs that leave the workflow.
- **Belt-and-suspenders Release creation.** `release.mjs` continues to call `gh release create` locally. CI's tag-trigger upsert uses `--clobber` so duplication is a no-op. First success wins.

## Helper Scripts (called from health-check.yml)

| Script | Purpose | Local equivalent |
|---|---|---|
| `scripts/build-dashboard.mjs` | Read `coverage/`, `nfr-reports/audit.json`, `lint-report.json`, `dist/` sizes; write `dashboard/index.html` + `summary.json`. With `--copy-coverage` also copies coverage HTML. With `--snapshot-version vX.Y.Z` switches to snapshot-mode (banner + page-title stamp). | `npm run dashboard preview` (artifact-mode preview) or `npm run dashboard refresh` (regenerate `docs/quality-report/` snapshot for commit) |
| `scripts/dashboard.mjs` | Tiny dispatcher behind `npm run dashboard <refresh\|preview>`. `refresh` wipes `docs/quality-report/`, calls `build-dashboard.mjs --out docs/quality-report --snapshot-version v$(package.json.version)`. `preview` calls it with `--out dashboard --copy-coverage` for local preview. | n/a — this IS the local entry point |
| `scripts/build-lint-report.mjs` | Read `lint-report.json` (ESLint JSON output) → write `lint-report.md` Markdown digest grouped by rule + file | `npm run lint -- --format json --output-file lint-report.json && node scripts/build-lint-report.mjs` |
| `scripts/extract-changelog.mjs` | Extract one version's `## [X.Y.Z]` section from `CHANGELOG.md`. Used by health-check's tag-trigger Release notes | `node scripts/extract-changelog.mjs v9.3.0` |

## Permissions Map

| Workflow | Needs | Why |
|---|---|---|
| `health-check.yml` | `contents: write`, `pull-requests: write` | Release upsert + baseline coverage worktree (contents), PR coverage comment (pull-requests). **Notably absent:** `pages: write` and `id-token: write` — this workflow does NOT publish to Pages. |
| `lint-report.yml` | default (read-only) | Just generates artifacts |
| `ranking-reports.yml` | `issues: write`, `contents: read` | Apply labels, post comments, run actions/stale |

## Trigger Matrix Cheat Sheet

| Event | health-check | lint-report | ranking-reports |
|---|---|---|---|
| PR to main | yes (verify default + PR coverage comment) | no | no |
| Push to main | yes (verify default) | no | no |
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
