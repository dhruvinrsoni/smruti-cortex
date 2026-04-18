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
