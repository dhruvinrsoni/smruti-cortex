#!/usr/bin/env bash
# sync-labels.sh — Create or update all labels for the smruti-cortex repo.
#
# Usage:
#   bash .github/tools/sync-labels.sh
#
# Requirements:
#   - GitHub CLI (gh) installed and authenticated
#   - Run from any directory (uses REPO env var or auto-detects from git remote)
#
# The --force flag updates existing labels (safe to re-run idempotently).

set -e

REPO="${REPO:-dhruvinrsoni/smruti-cortex}"

echo "Syncing labels for $REPO ..."

# --- Type labels ---
gh label create "bug"            --repo "$REPO" --color "d73a4a" --description "Something isn't working"             --force
gh label create "enhancement"    --repo "$REPO" --color "a2eeef" --description "New feature or request"              --force
gh label create "testing"        --repo "$REPO" --color "0e8a16" --description "Test creation or improvement"        --force
gh label create "coverage"       --repo "$REPO" --color "1d76db" --description "Test coverage related"               --force
gh label create "performance"    --repo "$REPO" --color "f9d0c4" --description "Performance issue or improvement"    --force
gh label create "security"       --repo "$REPO" --color "b60205" --description "Security vulnerability or hardening" --force
gh label create "documentation"  --repo "$REPO" --color "0075ca" --description "Documentation updates"               --force
gh label create "refactor"       --repo "$REPO" --color "d4c5f9" --description "Code improvement without behavior change" --force

# --- Area labels ---
gh label create "area: search"   --repo "$REPO" --color "0075ca" --description "Search engine, scorers, tokenizer, ranking" --force
gh label create "area: ai"       --repo "$REPO" --color "7057ff" --description "AI keyword expansion, embeddings, Ollama"   --force
gh label create "area: ui"       --repo "$REPO" --color "008672" --description "Popup, quick-search overlay, settings modal" --force
gh label create "area: core"     --repo "$REPO" --color "fbca04" --description "Logger, settings, helpers, constants"       --force
gh label create "area: ci"       --repo "$REPO" --color "bfdadc" --description "GitHub Actions, Docker, build system"       --force
gh label create "area: indexing" --repo "$REPO" --color "c5def5" --description "History indexing, database, metadata extraction" --force

# --- Priority labels ---
gh label create "priority: high"   --repo "$REPO" --color "b60205" --description "High priority"   --force
gh label create "priority: medium" --repo "$REPO" --color "fbca04" --description "Medium priority" --force
gh label create "priority: low"    --repo "$REPO" --color "0e8a16" --description "Low priority"    --force

# --- Status labels ---
gh label create "needs-triage"          --repo "$REPO" --color "e4e669" --description "Needs maintainer review and labeling" --force
gh label create "status: in-progress"   --repo "$REPO" --color "ededed" --description "Work is actively underway"            --force
gh label create "status: blocked"       --repo "$REPO" --color "000000" --description "Blocked by dependency or decision"    --force
gh label create "status: ready-for-review" --repo "$REPO" --color "0e8a16" --description "PR is ready for review"           --force

# --- Agent labels ---
gh label create "agent: test-coverage" --repo "$REPO" --color "7057ff" --description "Can be handled by the test-coverage agent" --force

echo "Done. All labels synced for $REPO."
