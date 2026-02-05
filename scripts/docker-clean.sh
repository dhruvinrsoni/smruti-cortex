#!/bin/sh
# Docker cleanup script - removes dangling resources and old build outputs

set -e

echo "🧹 Docker Cleanup"
echo "================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Stop all running containers from this project
echo "Stopping containers..."
docker-compose down 2>/dev/null || true

# Remove orphaned containers
echo "Removing orphaned containers..."
docker-compose rm -f 2>/dev/null || true

# Remove dangling volumes
echo "Removing dangling volumes..."
DANGLING=$(docker volume ls -q -f dangling=true 2>/dev/null | wc -l)
if [ "$DANGLING" -gt 0 ]; then
  docker volume prune -f 2>/dev/null || true
  echo "${GREEN}  Removed $DANGLING dangling volumes${NC}"
else
  echo "  No dangling volumes"
fi

# Remove dangling images
echo "Removing unused images..."
docker image prune -f 2>/dev/null || true

# Clean old docker-output builds (keep last 5)
if [ -d "./docker-output" ]; then
  echo "Cleaning old build outputs (keeping last 5)..."
  BUILD_COUNT=$(ls -1d ./docker-output/build-* 2>/dev/null | wc -l)
  if [ "$BUILD_COUNT" -gt 5 ]; then
    ls -1dt ./docker-output/build-* | tail -n +6 | xargs rm -rf
    echo "${GREEN}  Removed $((BUILD_COUNT - 5)) old builds${NC}"
  else
    echo "  No old builds to remove"
  fi
fi

echo ""
echo "${GREEN}✓ Cleanup complete${NC}"
echo ""
echo "Next: npm run docker-compose-build"

# Remove dangling volumes (optional)
echo "Removing dangling volumes..."
DANGLING=$(docker volume ls -q -f dangling=true | wc -l)
if [ "$DANGLING" -gt 0 ]; then
  docker volume prune -f --filter "label!=keep" 2>/dev/null || true
  echo "${GREEN}  Removed $DANGLING dangling volumes${NC}"
else
  echo "  No dangling volumes"
fi

# Remove dangling images
echo "Removing unused images..."
docker image prune -f --filter "label!=keep" 2>/dev/null || true

echo ""
echo "${GREEN}✓ Cleanup complete${NC}"
echo ""
echo "Next: npm run docker-compose-build"
