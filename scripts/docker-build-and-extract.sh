#!/bin/sh
# Docker build wrapper - runs build in container and extracts dist/ to host

set -e

CONTAINER_NAME="smruticortex-build-$$"
echo "📦 Building with Docker (container: $CONTAINER_NAME)"
echo ""

# Run build and capture container ID
CONTAINER_ID=$(docker-compose run --name "$CONTAINER_NAME" --rm build 2>&1 | tail -1)

# If container ID wasn't captured, try alternative method
if [ -z "$CONTAINER_ID" ] || [ ${#CONTAINER_ID} -lt 10 ]; then
  # Run in background and get container ID
  docker-compose run -d --name "$CONTAINER_NAME" build >/dev/null 2>&1
  CONTAINER_ID=$(docker-compose ps -q | head -1)
  
  # Wait for it to finish
  docker wait "$CONTAINER_ID" >/dev/null 2>&1 || true
fi

echo "📁 Extracting dist/ from container..."
mkdir -p dist
docker cp "${CONTAINER_NAME}:/app/dist/." ./dist/ 2>/dev/null || \
  docker cp "${CONTAINER_ID}:/app/dist/." ./dist/ 2>/dev/null || \
  echo "⚠️  Could not extract dist/ from container (it may not exist)"

echo "✅ Build complete"
#!/bin/sh
# Docker build wrapper - runs build in container and extracts dist/ to host

set -e

CONTAINER_NAME="smruticortex-build-$(date +%s)"
echo "📦 Building with Docker..."
echo ""

# Run build WITHOUT --rm so we can extract artifacts
docker-compose run --name "$CONTAINER_NAME" build
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
  echo ""
  echo "📁 Extracting dist/ from container..."
  mkdir -p dist
  
  # Extract dist directory
  if docker cp "${CONTAINER_NAME}:/app/dist/." ./dist/ 2>/dev/null; then
    echo "✅ Artifacts extracted to ./dist/"
  else
    echo "⚠️  Warning: Could not extract dist/ (container may not have build output)"
  fi
  
  # Cleanup container
  echo "🧹 Cleaning up container..."
  docker-compose rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
else
  # Build failed, still try to extract logs
  echo "❌ Build failed with exit code $BUILD_EXIT"
  docker-compose rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  exit $BUILD_EXIT
fi

echo "✅ Build complete"
