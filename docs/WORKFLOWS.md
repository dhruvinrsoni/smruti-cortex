# GitHub Actions Workflows Documentation

This document describes all GitHub Actions workflows in this repository, their purposes, triggers, and behaviors.

## 📊 Workflow Overview Matrix

| Workflow | Commits/Pushes? | Manual Trigger? | Produces Artifacts? | Runs On Push to `main`? |
|----------|----------------|-----------------|-------------------|------------------------|
| **CI** | ❌ No | ✅ Yes | ✅ Yes (30 days) | ✅ Yes |
| **Docker Build & Verify** | ❌ No | ✅ Yes | ✅ Yes (7 days) | ✅ Yes |
| **Build & Release** | ❌ No | ✅ Yes | ✅ Yes (30 days) | ✅ Yes |
| **Deploy Landing Page** | ⚠️ **YES** | ✅ Yes | ❌ No | ⚠️ **Only when `site/**` changes** |

## ⚠️ CRITICAL: Workflows That Push Commits

### Deploy Landing Page (`.github/workflows/deploy-site.yml`)

**This is the ONLY workflow that commits and pushes changes back to the repository.**

- **What it commits:** Changes to `docs/` directory (GitHub Pages content)
- **When it commits:** Only when `site/**` files or the workflow file itself changes
- **Commit message pattern:** `🚀 Deploy landing page [skip ci]`
- **Branch:** `main`

#### ⚠️ Important Git Workflow Implications

After this workflow runs, you **MUST** run `git pull` before making any local commits:

```bash
# Before committing after a site deployment
git pull --rebase
git add .
git commit -m "your changes"
git push
```

If you forget to pull, you'll get a "rejected - non-fast-forward" error.

#### Why [skip ci] Tag?

The commit message includes `[skip ci]` to prevent triggering other workflows. Without it, the commit would trigger:
1. CI workflow (because main branch changed)
2. Docker Build (because main branch changed)
3. Build & Release (because main branch changed)

This would cause an infinite loop and waste CI minutes.

---

## 📋 Detailed Workflow Descriptions

### 1. CI (`.github/workflows/ci.yml`)

**Purpose:** Quality gate for all code changes.

**Triggers:**
- Push to `main` or `develop`
- Pull requests to `main`
- Manual trigger via workflow_dispatch

**Matrix:** Node.js 18.x and 20.x

**Steps:**
1. Checkout code
2. Install dependencies (`npm ci`)
3. Run linter (`npm run lint:release` - max 52 warnings)
4. Run tests with coverage
5. Upload coverage to Codecov (Node 20.x only)
6. Build extension (`npm run build:prod`)
7. Verify build artifacts
8. Upload `extension-build` artifact (30 days, Node 20.x only)

**Artifacts:**
- `extension-build` (dist/ folder, 30 days retention)

**Does NOT:**
- Commit or push changes
- Create releases
- Deploy anything

---

### 2. Docker Build & Verify (`.github/workflows/docker-build.yml`)

**Purpose:** Validate reproducible builds in isolated Docker environment.

**Triggers:**
- Push to `main` or `develop`
- Pull requests to `main`
- Manual trigger via workflow_dispatch

**Steps:**
1. Checkout code
2. Set up Docker Buildx
3. Resolve version from `package.json`
4. Build Docker image: `smruti-cortex:7.0.0`
5. Run build via Docker Compose (`docker compose run --rm build`)
6. Verify dist artifacts (manifest.json, background/, popup/, content_scripts/)
7. Create zip package: `smruti-cortex-docker.zip`
8. Upload both dist/ folder and zip

**Artifacts:**
- `extension-dist-docker` (dist/ folder, 7 days retention)
- `smruti-cortex-docker-zip` (installable zip, 7 days retention)

**Environment Variables:**
- `DOCKER_OUTPUT_DIR=.` - Maps container `/output` to workspace root so `dist/` appears on runner

**Does NOT:**
- Commit or push changes
- Create releases

**Use Case:**
- Validates cross-platform builds
- Ensures Windows dev environment doesn't introduce platform-specific issues
- Provides Docker-built artifact for testing

---

### 3. Build & Release (`.github/workflows/build.yml`)

**Purpose:** Main production build pipeline and release automation.

**Triggers:**
- Push to `main`
- Push of version tags (`v*`)
- Pull requests to `main`
- Manual trigger via workflow_dispatch

**Jobs:**

#### Job 1: `build`
Runs on every trigger.

**Steps:**
1. Checkout code
2. Install dependencies
3. Run linter (`npm run lint` - continues on error)
4. Type check (`npm run tsc`)
5. Run tests (continues on error)
6. Build extension (`npm run build`)
7. Create zip: `smruti-cortex.zip`
8. Upload artifact

**Artifacts:**
- `smruti-cortex-extension` (zip, 30 days retention)

#### Job 2: `release`
Runs ONLY when a version tag is pushed (e.g., `git push origin v7.0.0`).

**Steps:**
1. Checkout code
2. Build extension
3. Create versioned zip: `smruti-cortex-v7.0.0.zip`
4. Create GitHub Release with:
   - Release notes template
   - Installation instructions
   - Attached zip file
   - Auto-detects prerelease (alpha/beta/rc tags)

**Does NOT:**
- Commit or push changes
- Run on regular commits (unless tagged)

**How to Create a Release:**
```bash
git tag v7.0.0
git push origin v7.0.0
```

---

### 4. Deploy Landing Page (`.github/workflows/deploy-site.yml`)

**Purpose:** Deploy landing page from `site/` to `docs/` for GitHub Pages.

**Triggers:**
- Push to `main` **AND** changes to `site/**` or workflow file
- Manual trigger via workflow_dispatch

**⚠️ COMMITS AND PUSHES CHANGES!**

**Steps:**
1. Checkout with full history (`fetch-depth: 0`)
2. Configure Git bot identity
3. Backup existing `docs/privacy.html` (2 copies)
4. Clean `docs/` directory (except privacy.html)
5. Generate screenshots index (optional, non-fatal)
6. Copy `site/*` to `docs/`
7. Restore privacy.html (multi-layer failsafe)
8. Verify deployment (privacy.html and index.html presence)
9. **Commit and push to main** (with [skip ci] tag)
10. Retry logic (3 attempts if push fails)

**Safeguards:**
- Double backup of privacy.html (prevents Chrome Web Store URL breakage)
- Exits with error if privacy.html cannot be restored
- Retry logic for push failures
- `[skip ci]` tag prevents workflow loops

**Artifacts:**
- None (changes are committed directly)

**Live URLs After Deployment:**
- Landing page: https://dhruvinrsoni.github.io/smruti-cortex/
- Privacy policy: https://dhruvinrsoni.github.io/smruti-cortex/privacy.html

**Git Workflow After This Runs:**
```bash
# ALWAYS pull before committing locally
git pull --rebase
# Then proceed with your work
git add .
git commit -m "your changes"
git push
```

---

## 🎯 Workflow Consolidation Analysis

### Current Redundancy Issues

For a single push to `main`, up to **4 workflows** can trigger:

1. **CI** - Builds and tests
2. **Docker Build & Verify** - Builds in Docker
3. **Build & Release** - Builds and creates artifact
4. **Deploy Landing Page** - Only if `site/**` changed

**Redundancy:** Three workflows (CI, Docker, Build & Release) all build the extension and produce similar artifacts.

### Cost Implications

- **CI:** ~3-5 minutes × 2 matrix jobs (Node 18 & 20) = ~6-10 minutes
- **Docker Build:** ~4-6 minutes
- **Build & Release:** ~3-4 minutes
- **Total per push:** ~13-20 minutes of runner time

### Recommendations

#### Option A: Consolidate into Single Build Workflow
- Merge CI + Build & Release into one workflow
- Keep Docker Build as separate validation
- Run Docker Build only on PRs and manual trigger (not every push)

#### Option B: Use Workflow Dependencies
- CI runs first (quality gate)
- Build & Release only runs if CI passes
- Docker Build only on schedule or manual trigger

#### Option C: Current Approach (Keep Separate)
- Good: Clear separation of concerns
- Good: Each workflow has specific purpose
- Bad: Redundant builds waste CI minutes
- Bad: Multiple artifacts to track

**Recommended:** Option A - Consolidate CI + Build & Release, keep Docker separate and manual-only.

---

## 📈 Artifact Retention Policies

| Artifact | Retention | Workflow | Use Case |
|----------|-----------|----------|----------|
| `extension-build` | 30 days | CI | Validation artifacts from CI builds |
| `extension-dist-docker` | 7 days | Docker Build | Docker-built dist/ for testing |
| `smruti-cortex-docker-zip` | 7 days | Docker Build | Installable Docker-built zip |
| `smruti-cortex-extension` | 30 days | Build & Release | Main production artifact |

**Note:** GitHub releases (created by tags) have no expiration.

---

## 🔧 Manual Workflow Triggers

All workflows support manual triggering via GitHub UI or CLI:

### Via GitHub UI
1. Go to Actions tab
2. Select workflow
3. Click "Run workflow"
4. Select branch and provide reason (optional)

### Via GitHub CLI
```bash
# Trigger CI
gh workflow run ci.yml --ref main

# Trigger Docker Build
gh workflow run docker-build.yml --ref main

# Trigger Build & Release
gh workflow run build.yml --ref main -f reason="Testing new features"

# Trigger Deploy Site
gh workflow run deploy-site.yml --ref main
```

---

## 🛠️ Troubleshooting

### "rejected - non-fast-forward" Error

**Cause:** Deploy Landing Page workflow pushed commits while you had uncommitted local changes.

**Solution:**
```bash
git stash
git pull --rebase
git stash pop
# Resolve conflicts if any
git add .
git commit -m "your changes"
git push
```

### Docker Build "manifest.json missing" Error

**Cause:** `DOCKER_OUTPUT_DIR` not set, so dist/ is created inside container but not copied to runner.

**Solution:** Ensure `.github/workflows/docker-build.yml` has:
```yaml
- name: Run Docker Compose build
  env:
    DOCKER_OUTPUT_DIR: .
  run: docker compose run --rm build
```

### CI Lint Warnings Failing Build

**Cause:** ESLint configured with `--max-warnings 0` in `package.json` `lint` script.

**Solution:** CI uses `npm run lint:release` which allows max 52 warnings. To change threshold:
```json
"lint:release": "eslint src --ext .ts,.tsx --max-warnings 52"
```

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- Repository: [SmrutiCortex Build Scripts](../scripts/)

---

**Last Updated:** February 13, 2026
