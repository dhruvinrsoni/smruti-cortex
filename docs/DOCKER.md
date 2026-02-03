# Docker Build & Development — SmrutiCortex

**Complete out-of-the-box Docker workflow for reproducible builds, development, and testing.**

---

## 🎯 Overview

SmrutiCortex uses Docker to ensure identical builds on any machine without requiring local Node.js installation. All commands automatically install dependencies and produce artifacts in your local `dist/` folder.

**What you get:**
- ✅ Zero Node.js setup required
- ✅ Reproducible builds across Windows/Mac/Linux
- ✅ Automatic dependency installation
- ✅ Hot-reload development mode
- ✅ Containerized testing and linting
- ✅ CI/CD ready workflows

---

## 📋 Prerequisites

**Required:**
- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose (included with Docker Desktop)

**Windows users:** Enable WSL2 backend in Docker Desktop for best performance.

**Verify installation:**
```bash
docker --version
docker-compose --version
```

---

## 🚀 Quick Start

### Build extension artifacts (produces `dist/`)

```bash
npm run docker-compose-build
```

**What happens:** Builds Docker image → installs dependencies → runs `npm run build` → outputs to `./dist`

### Development (watch mode with hot-reload)

```bash
npm run docker-compose-dev
```

Press `Ctrl+C` to stop.

### Run tests in container

```bash
npm run docker-compose-test
```

### Run linting in container

```bash
npm run docker-compose-lint
```

---

## 🔧 Advanced Usage

### Build versioned Docker image

```bash
npm run docker-build-image
```

Creates image tagged as `smruti-cortex:6.0.0` (uses version from `package.json`).

### Run arbitrary npm scripts in container

```bash
# Using docker-compose
docker-compose run --rm build npm run package

# One-off command without compose
docker run --rm -v "$PWD:/app" -w /app node:20-bullseye-slim npm run lint
```

### Direct docker-compose commands

```bash
# Build artifacts
docker-compose run --rm build

# Development mode
docker-compose run --rm dev

# Tests
docker-compose run --rm test

# Linting
docker-compose run --rm lint
```

---

## 📁 How It Works

### Volume Mounts

| Mount | Purpose |
|-------|---------|
| `./:/app:cached` | Sync source code to container |
| `node_modules:/app/node_modules` | Persistent deps (named volume) |
| `./dist:/app/dist` | Build output visible on host |
| `./coverage:/app/coverage` | Test coverage reports |

### Automatic Dependency Installation

All services use `scripts/docker-entrypoint.sh` which:
1. Checks if `node_modules` exists
2. Runs `npm ci` if missing or empty
3. Executes your command

**First run:** ~10-30 seconds (installs deps)  
**Subsequent runs:** ~1-2 seconds (deps cached)

### Image Tagging

- Built images use version from `package.json` (e.g., `smruti-cortex:6.0.0`)
- Fallback tag: `smruti-cortex:local` if version env var not set
- Version automatically injected by `scripts/docker-compose.mjs`

---

## 🐛 Troubleshooting

### Issue: `dist/` is empty after build

**Cause:** Volume mount not working or command failed.

**Fix:**
```bash
# Check if build succeeded
docker-compose run --rm build

# Manually verify dist exists in container
docker-compose run --rm build ls -la dist/

# Check Docker volume mounts
docker volume ls | grep node_modules
```

### Issue: `rimraf: not found` or `esbuild: not found`

**Cause:** Dependencies not fully installed or corrupted node_modules volume.

**Fix:**
```bash
# Method 1: Remove volume and rebuild (recommended)
docker volume ls  # Find volume name (e.g., smruticortex_node_modules)
docker volume rm smruticortex_node_modules
npm run docker-compose-build

# Method 2: Force clean install
docker-compose run --rm build sh -c "rm -rf node_modules && npm ci && npm run build"

# Method 3: Rebuild image without cache
docker-compose build --no-cache
npm run docker-compose-build
```

**Note:** Entrypoint script checks for critical tools (rimraf, esbuild, tsc) and reinstalls if missing.

### Issue: Slow performance on Windows

**Cause:** Docker Desktop using Hyper-V instead of WSL2.

**Fix:**
1. Open Docker Desktop → Settings → General
2. Enable "Use the WSL 2 based engine"
3. Restart Docker Desktop

### Issue: Permission denied on `dist/` files

**Cause:** Container writes files as root, host can't access.

**Fix (Windows/Docker Desktop):** Usually not an issue - Docker Desktop handles permissions automatically.

**Fix (Linux/Mac):**
```bash
# Fix ownership (files owned by root from container)
sudo chown -R $USER:$USER dist/ node_modules/

# Or run Docker in rootless mode
```

**Note:** Docker Compose services run as `root` to avoid permission issues with named volumes. The entrypoint script fixes ownership of `dist/` after builds.

### Issue: `version` is obsolete warning

**Cause:** Docker Compose v2+ doesn't need `version` field.

**Status:** Already removed from `docker-compose.yml` (warning should be gone).

### Issue: Cannot connect to Docker daemon

**Cause:** Docker Desktop not running or Docker Engine stopped.

**Fix:**
```bash
# Windows/Mac: Start Docker Desktop from Start menu

# Linux: Start Docker daemon
sudo systemctl start docker
```

---

## ✅ Validation

Run this sequence to verify everything works:

```bash
# 1. Build artifacts
npm run docker-compose-build
ls -la dist/

# 2. Check critical files exist
test -f dist/manifest.json && echo "✅ manifest.json"
test -d dist/background && echo "✅ background bundle"
test -d dist/popup && echo "✅ popup bundle"

# 3. Run tests
npm run docker-compose-test

# 4. Run linting
npm run docker-compose-lint

# 5. Verify extension loads in browser
# Load unpacked: chrome://extensions → "Load unpacked" → select dist/
```

---

## 🖥️ Windows-Specific Notes

### PowerShell vs CMD

Both work, but PowerShell recommended:

```powershell
# PowerShell
npm run docker-compose-build

# CMD
npm run docker-compose-build
```

### Path Handling

Scripts automatically handle Windows paths. No changes needed.

### File Permissions

Docker Desktop on Windows automatically maps permissions. No `chown` needed.

### Line Endings (CRLF vs LF)

If you get `/bin/sh^M: bad interpreter`:

```bash
# Fix line endings for entrypoint script
git config core.autocrlf false
git rm --cached scripts/docker-entrypoint.sh
git reset --hard
```

Or use `.gitattributes`:
```
scripts/docker-entrypoint.sh text eol=lf
```

---

## 🔄 CI/CD Integration

GitHub Actions workflow (`.github/workflows/docker-build.yml`) automatically:
1. Builds Docker image on push/PR
2. Runs `docker-compose run --rm build`
3. Verifies `dist/` artifacts
4. Uploads extension zip as artifact

**Local CI simulation:**
```bash
# Run same commands as CI
docker-compose run --rm build
docker-compose run --rm test
docker-compose run --rm lint
```

---

## 📦 VS Code DevContainer

**Open workspace in container:**
1. Install "Dev Containers" extension
2. Open Command Palette (`Ctrl+Shift+P`)
3. Select: "Dev Containers: Reopen in Container"

**What happens:**
- Uses `.devcontainer/devcontainer.json`
- Runs `npm ci` automatically
- Full VS Code features in containerized environment

---

## 🔐 Security Best Practices

**For production image builds:**
- ✅ No credentials in Dockerfile
- ✅ `.dockerignore` excludes sensitive files
- ✅ Non-root user in final image (`appuser`)
- ✅ Minimal base image (`node:20-bullseye-slim`)
- ✅ No unnecessary packages installed

**Note:** Docker Compose services run as `root` for developer convenience (avoids volume permission issues). Production images should use non-root users.

---

## 🧹 Auto-Cleanup & Volume Management

### Clean Docker resources

```bash
# Remove project containers, volumes, and dangling images
npm run docker-clean
```

This removes:
- Stopped containers from previous runs
- Project-specific volumes (`smruticortex_*`)
- Dangling images and volumes
- Keeps extension code and local files intact

**When to clean:**
- Before major rebuilds
- If you see permission errors
- After switching Docker backends (WSL2 ↔ Hyper-V)
- To free disk space

### Volume Strategy (Future-Proof)

The `node_modules` volume now uses tmpfs (RAM-backed) on Linux/Mac:
- ⚡ Ultra-fast access
- 🧪 No permission issues
- 🧹 Auto-cleaned on restart
- 💾 Limited to 2GB (configurable)

**Windows/Docker Desktop:** Uses regular named volume (tmpfs not available).



---

## 🆘 Getting Help

**Still stuck?**
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review [README.md](../README.md) for general setup
3. Open issue: [GitHub Issues](https://github.com/dhruvinrsoni/SmrutiCortex/issues)

**Include in bug reports:**
- Docker version: `docker --version`
- Docker Compose version: `docker-compose --version`
- OS: Windows/Mac/Linux + version
- Full command output (paste error messages)

---

## 🎓 Docker Resources

**New to Docker?**
- [Docker Desktop Download](https://www.docker.com/products/docker-desktop)
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [WSL2 Setup Guide](https://docs.microsoft.com/en-us/windows/wsl/install)

**Advanced:**
- [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker volumes](https://docs.docker.com/storage/volumes/)
- [Dockerfile best practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Next:** See [README.md](../README.md) for extension features and usage.

