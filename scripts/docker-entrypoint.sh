#!/bin/sh
# Docker entrypoint: ensures dependencies are available
# The Dockerfile already installs 344 packages in the image.
# We only reinstall if image is broken or node_modules is explicitly deleted.

set -e

echo "🔍 Checking dependencies..."

# Check if dependencies are properly installed in the image
if [ ! -f "/usr/local/lib/node_modules/rimraf/package.json" ] && [ ! -f "node_modules/.bin/rimraf" ]; then
  echo "📦 Reinstalling dependencies from lockfile..."
  
  # Only run npm ci if we're sure the lockfile is available and complete
  if [ -f "package-lock.json" ] && [ $(wc -c < package-lock.json) -gt 100000 ]; then
    rm -rf node_modules 2>/dev/null || true
    npm ci --no-audit --progress=false 2>&1 | grep -E "(added|removed|audited)" | head -1
  else
    echo "❌ package-lock.json not found or incomplete!"
    exit 1
  fi
fi

echo "✅ Dependencies ready"
echo "🚀 Running: $@"
exec "$@"
#!/bin/sh
# Docker entrypoint: ensures dependencies are available for Linux
# The Dockerfile pre-installs 344 packages in the builder image.
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
