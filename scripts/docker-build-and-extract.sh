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
# Docker build wrapper with timestamped output directory

set -e

# Create timestamped output directory
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="./docker-output/build-${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

echo "📦 Building with Docker..."
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

# Export env var for docker-compose to use
export DOCKER_OUTPUT_DIR="$OUTPUT_DIR"

# Run build - artifacts will be written to $OUTPUT_DIR/dist automatically
docker-compose run --rm build
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
  echo ""
  
  # Copy from output dir to main dist/ for immediate use
  if [ -d "$OUTPUT_DIR/dist" ]; then
    echo "📁 Copying artifacts to ./dist/..."
    rm -rf ./dist 2>/dev/null || true
    cp -r "$OUTPUT_DIR/dist" ./dist
    echo "✅ Artifacts available at:"
    echo "   - ./dist/ (main output)"
    echo "   - $OUTPUT_DIR/dist/ (timestamped backup)"
  else
    echo "⚠️  No dist/ found in output directory"
  fi
else
  echo "❌ Build failed with exit code $BUILD_EXIT"
  echo "📁 Check logs in: $OUTPUT_DIR/"
  exit $BUILD_EXIT
fi

echo "✅ Build complete"
