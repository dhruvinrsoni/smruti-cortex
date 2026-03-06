---
name: workflows-ci
description: GitHub Actions workflows, Docker build, CI/CD conventions
metadata:
  project: smruti-cortex
  version: "8.0"
---

# Workflows & CI/CD

## Workflow Matrix

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `build.yml` | push main, PR main, tags, manual | Lint + test + build + release (on tags) |
| `docker-build.yml` | push main/develop, PR main, manual | Docker build, GHCR push, installable zip |
| `security.yml` | push (pkg changes only), PR, weekly, manual | npm audit, secret detection, license check |
| `performance.yml` | PR, manual | Bundle size analysis and thresholds |
| `lint-report.yml` | manual only | Full ESLint report (JSON + markdown artifact) |

## Design Principles

- **Push to main** triggers at most 2 workflows (build + docker-build), plus security only if deps changed
- **PRs** get full treatment: build + docker + security + performance
- **No redundant builds:** ci.yml was removed (redundant with build.yml)
- **No tokens needed** for security/performance (they use `$GITHUB_STEP_SUMMARY` only)
- **lint-report** is manual-only -- generates artifacts for offline review

## Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/build.yml` | Main CI: lint (two-pass JSON + human-readable), test, build, release |
| `.github/workflows/docker-build.yml` | GHCR image build + dist extraction + installable zip |
| `.github/workflows/security.yml` | npm audit + secret scan + manifest permissions + license check |
| `.github/workflows/performance.yml` | Bundle size thresholds (SW<500KB, Popup<300KB, QS<200KB) |
| `.github/workflows/lint-report.yml` | Manual full lint report with artifacts |
| `Dockerfile` | Multi-stage: node:22-bullseye-slim, npm ci + build, non-root runner |
| `scripts/docker-entrypoint.sh` | Ensures Linux-specific deps when bind-mounted |

## Docker Image

- Published to `ghcr.io/dhruvinrsoni/smruti-cortex`
- Tags: `latest` (main), `<version>` (from package.json), `sha-<commit>`
- PRs build but do NOT push to GHCR
- Multi-stage: builder (npm ci + build) -> runner (non-root, /app/dist)

## Build Pipeline (build.yml)

```
npm ci -> lint (JSON metrics + human-readable gate) -> test -> build:prod
```

- Lint runs twice: once for JSON metrics (`--format json`), once for human-readable output (gates the build)
- Release job triggers on `v*` tags: builds, packages zip, creates GitHub Release

## Bundle Size Thresholds (performance.yml)

| Bundle | Threshold |
|--------|-----------|
| Service Worker | < 500 KB |
| Popup | < 300 KB |
| Quick Search | < 200 KB |

## Adding a New Workflow

1. Create `.github/workflows/<name>.yml`
2. Add purpose/trigger comment block at top
3. Prefer `$GITHUB_STEP_SUMMARY` over artifacts (no token cost)
4. Use `timeout-minutes` to prevent runaway jobs
5. Use Node 22 (`actions/setup-node@v4` with `node-version: '22'`)
