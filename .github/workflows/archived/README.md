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
