#!/bin/sh
# Docker cleanup script - removes dangling resources and unused volumes

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
docker-compose down -v 2>/dev/null || true

# Remove project-specific volumes
PROJECT_NAME="smruticortex"
echo "Removing project volumes..."

# Copy dist artifacts out before cleanup
echo "Exporting dist artifacts from volume..."
if docker volume inspect "${PROJECT_NAME}_dist-volume" >/dev/null 2>&1; then
  mkdir -p "$(pwd)/dist" 2>/dev/null || true
  docker run --rm -v "${PROJECT_NAME}_dist-volume:/dist" -v "$(pwd):/host" \
    busybox sh -c "cp -r /dist/* /host/dist/ 2>/dev/null || true" 2>/dev/null || true
fi

docker volume ls --format '{{.Name}}' | grep "^${PROJECT_NAME}" | while read vol; do
  echo "  Removing: $vol"
  docker volume rm "$vol" 2>/dev/null || true
done

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
