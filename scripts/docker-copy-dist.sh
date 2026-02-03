#!/bin/sh
# Helper script to copy dist artifacts from Docker container to host

CONTAINER_ID=$1
if [ -z "$CONTAINER_ID" ]; then
  echo "Usage: $0 <container-id>"
  exit 1
fi

echo "Copying dist/ from container $CONTAINER_ID to ./dist..."
docker cp "$CONTAINER_ID:/app/dist" . || {
  echo "Failed to copy artifacts"
  exit 1
}

echo "✅ Artifacts copied successfully"
ls -la dist/
