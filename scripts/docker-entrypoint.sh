#!/bin/sh
# Docker entrypoint: ensures dependencies are available for Linux
# The Dockerfile pre-installs packages in the builder image.
# When mounted with .:/app:cached, we need to ensure node_modules are for Linux (not Windows).

set -e

echo "🔍 Checking dependencies for Linux architecture..."

# Check if esbuild linux binary exists (Linux-specific)
# If host mounted Windows node_modules, this will be missing
if [ ! -f "node_modules/@esbuild/linux-x64/bin/esbuild" ]; then
  echo "📦 Installing Linux-specific dependencies..."

  if [ -f "package-lock.json" ] && [ $(wc -c < package-lock.json) -gt 100000 ]; then
    # Remove host's platform-specific binaries
    rm -rf node_modules/.bin node_modules/@esbuild 2>/dev/null || true

    # Reinstall all packages (will get Linux binaries)
    npm ci --no-audit --prefer-offline --progress=false 2>&1 | grep -E "(added|removed|audited)" | tail -1
  else
    echo "❌ package-lock.json not found or incomplete!"
    exit 1
  fi
else
  echo "✅ Dependencies ready (Linux architecture)"
fi

echo "🚀 Running: $@"
exec "$@"
