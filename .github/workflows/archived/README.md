# Archived Workflows

Workflows in this folder are **intentionally disabled**. GitHub Actions only
discovers YAML files in the top-level `.github/workflows/` directory —
subdirectories are ignored, so nothing here runs automatically.

## Why archive instead of delete?

Keeping the file in the working tree (rather than relying on `git log`) makes
revival a one-liner and keeps the full configuration visible without archaeology.

## How to revive a workflow

```bash
git mv .github/workflows/archived/<name>.yml .github/workflows/<name>.yml
git commit -m "chore(ci): revive <name> workflow"
git push
```

The workflow will start running on the next matching trigger.

## Currently archived

| Workflow | Archived | Reason |
|----------|----------|--------|
| `docker-build.yml` | 2026-04-18 | Chrome extensions aren't distributed via Docker; GHCR images aren't consumed anywhere. Revive if containerised builds become useful again. |
| `nfr-report.yml` | 2026-05-01 | Replaced by `health-check.yml`. Dashboard generation extracted into `scripts/build-dashboard.mjs` and published via `actions/deploy-pages@v4` instead of commit-back to main. PR coverage delta comment moved into health-check. |
| `build.yml` | 2026-05-01 | Replaced by `health-check.yml`. Lint + tests + build + package now flow through `npm run verify` (the perfected local pipeline) inside health-check. Tag-trigger Release upsert moved into health-check (fixes the `gh release create` work-account auth pain by using CI's `GITHUB_TOKEN`). The dead `release:` job (`if: false`) is dropped entirely. |
| `e2e.yml` | 2026-05-01 | Replaced by `health-check.yml`. Playwright E2E now runs inside `npm run verify` (xvfb-wrapped), so the same suite that gates `npm run ship check` locally also gates CI. Single rich workflow summary instead of a separate green/red status check. |
| `security.yml` | 2026-05-01 | Replaced by `health-check.yml`. `npm audit --audit-level=high`, `license-checker` (copyleft scan), and the hardcoded-secret regex grep are now explicit `continue-on-error` steps in health-check. Manifest permission audit lives in `npm run store check` (already enforced locally + via `verify --release`). GitHub Dependabot Alerts handle CVE notifications independently. |
| `staging.yml` | 2026-05-01 | Dormant — `develop` branch has had no commits since v8.0.0 era (current main is v9.3.0+). No replacement; revive only if a `develop` workflow becomes active again. |
| `triage-ranking-reports.yml` | 2026-05-01 | Merged into `ranking-reports.yml` `intake` job. Same triggers (`issues: opened/labeled` filtered to `ranking-bug`), same labels applied (`needs-triage`, `sink: ranking-reports`), same orientation comment, same idempotency marker. Folded into a single `github-script` call that also handles dedupe (was a separate workflow). |
| `dedupe-ranking-reports.yml` | 2026-05-01 | Merged into `ranking-reports.yml` `intake` job. Same title-key parsing (`query \| sort \| major.minor`), same oldest-canonical-issue search, same `Possible duplicate of #N` comment + `duplicate?` label, same idempotency marker. Now shares the same `github-script` call as triage so they don't double-fetch issue metadata. |
| `stale-ranking-reports.yml` | 2026-05-01 | Relocated to `ranking-reports.yml` `gc` job. Same `actions/stale@v9` config: ranking-bug → stale at 60d, close at 90d, exempt priority/pinned, cap 50 ops/run. Same Mondays 04:00 UTC cron + workflow_dispatch trigger. Verbatim move; just one file fewer to maintain. |
