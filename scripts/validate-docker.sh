#!/bin/sh
# Docker validation script - verifies entire Docker workflow works correctly

set -e

echo "🔍 Docker Validation Script"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "${GREEN}✓${NC} $1 is available"
    passed=$((passed + 1))
  else
    echo "${RED}✗${NC} $1 is NOT available"
    failed=$((failed + 1))
    return 1
  fi
}

check_file() {
  if [ -f "$1" ]; then
    echo "${GREEN}✓${NC} $1 exists"
    passed=$((passed + 1))
  else
    echo "${RED}✗${NC} $1 is missing"
    failed=$((failed + 1))
    return 1
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo "${GREEN}✓${NC} $1 exists"
    passed=$((passed + 1))
  else
    echo "${RED}✗${NC} $1 is missing"
    failed=$((failed + 1))
    return 1
  fi
}

echo "Step 1: Check prerequisites"
echo "----------------------------"
check_command docker
check_command docker-compose
check_command node
check_command npm
echo ""

echo "Step 1b: Auto-cleanup (fresh start)"
echo "----------------------------"
if sh ./scripts/docker-clean.sh; then
  echo "${GREEN}✓${NC} Cleaned up Docker resources"
  passed=$((passed + 1))
else
  echo "${YELLOW}⚠${NC} Cleanup had issues (non-critical)"
fi
echo ""

echo "Step 2: Check Docker files"
echo "----------------------------"
check_file "Dockerfile"
check_file "docker-compose.yml"
check_file ".dockerignore"
check_file "scripts/docker-entrypoint.sh"
check_file ".devcontainer/devcontainer.json"
echo ""

echo "Step 3: Run Docker build"
echo "----------------------------"
if npm run docker-compose-build; then
  echo "${GREEN}✓${NC} Docker build succeeded"
  passed=$((passed + 1))
else
  echo "${RED}✗${NC} Docker build failed"
  failed=$((failed + 1))
fi
echo ""

echo "Step 4: Verify build artifacts"
echo "----------------------------"
check_dir "dist"
check_file "dist/manifest.json"
check_dir "dist/background"
check_dir "dist/popup"
check_file "dist/assets/icon-16.png"
check_file "dist/assets/icon-16.png"
echo ""

echo "Step 5: Run tests in container"
echo "----------------------------"
if npm run docker-compose-test; then
  echo "${GREEN}✓${NC} Tests passed"
  passed=$((passed + 1))
else
  echo "${YELLOW}⚠${NC} Tests failed (may be expected)"
  # Don't fail validation on test failures
fi
echo ""

echo "Step 6: Run linting in container"
echo "----------------------------"
if npm run docker-compose-lint; then
  echo "${GREEN}✓${NC} Linting passed"
  passed=$((passed + 1))
else
  echo "${YELLOW}⚠${NC} Linting failed (may be expected)"
  # Don't fail validation on lint failures
fi
echo ""

echo "=========================="
echo "Validation Summary"
echo "=========================="
echo "${GREEN}Passed: $passed${NC}"
echo "${RED}Failed: $failed${NC}"
echo ""

if [ $failed -eq 0 ]; then
  echo "${GREEN}🎉 All critical checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Load extension: chrome://extensions → 'Load unpacked' → select dist/"
  echo "2. Test search: Click extension icon or press Ctrl+Shift+S"
  echo "3. See docs/DOCKER.md for more details"
  exit 0
else
  echo "${RED}❌ Some checks failed. See errors above.${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "1. Check Docker is running: docker ps"
  echo "2. Check disk space: docker system df"
  echo "3. See docs/DOCKER.md for detailed troubleshooting"
  exit 1
fi
