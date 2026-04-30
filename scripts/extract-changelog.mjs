#!/usr/bin/env node
/**
 * extract-changelog.mjs — Extract one version's section from CHANGELOG.md.
 *
 * Used by .github/workflows/health-check.yml on tag-trigger Release upsert
 * to populate `gh release create --notes-file <(...)`. Also runnable locally
 * to preview what the Release body will look like.
 *
 * Algorithm:
 *   - CHANGELOG.md uses `## [X.Y.Z] — YYYY-MM-DD` (two hashes) per release.
 *   - Find the line matching `## [<version>]` (with or without leading 'v').
 *   - Capture every line until the next `## [` or end-of-file.
 *   - Strip the captured `## [...]` heading itself (Release body shouldn't
 *     repeat its own title).
 *   - Print to stdout.
 *
 * Usage:
 *   node scripts/extract-changelog.mjs v9.3.0    # accepts vX.Y.Z or X.Y.Z
 *   node scripts/extract-changelog.mjs 9.3.0
 *   node scripts/extract-changelog.mjs --help
 *
 * Exit codes:
 *   0 — section found and printed to stdout.
 *   1 — version not found in CHANGELOG, or CHANGELOG.md missing.
 *   2 — usage error (no version arg).
 *
 * Pure helpers (`extractSection`, `normalizeVersion`) are exported for tests.
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

export function normalizeVersion(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().replace(/^v/i, '');
  return /^\d+\.\d+\.\d+/.test(trimmed) ? trimmed : null;
}

export function extractSection(changelogText, version) {
  const escaped = version.replace(/\./g, '\\.');
  const headingPattern = new RegExp(
    `^##\\s*\\[v?${escaped}\\][^\\n]*\\n`,
    'm'
  );
  const match = headingPattern.exec(changelogText);
  if (!match) return null;
  const startIdx = match.index + match[0].length;
  const rest = changelogText.slice(startIdx);
  const nextHeadingIdx = rest.search(/^##\s*\[/m);
  const body = nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
  return body.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '\n');
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    console.error(`Usage: node scripts/extract-changelog.mjs <version>

Examples:
  node scripts/extract-changelog.mjs v9.3.0
  node scripts/extract-changelog.mjs 9.3.0

Prints the matching CHANGELOG section to stdout. Exit 1 if not found.`);
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const version = normalizeVersion(argv[0]);
  if (!version) {
    console.error(`[extract-changelog] ERROR: "${argv[0]}" is not a valid version (expected X.Y.Z or vX.Y.Z).`);
    process.exit(2);
  }

  const changelogPath = resolve(rootDir, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) {
    console.error(`[extract-changelog] ERROR: CHANGELOG.md not found at ${changelogPath}.`);
    process.exit(1);
  }

  const text = readFileSync(changelogPath, 'utf-8');
  const section = extractSection(text, version);
  if (!section) {
    console.error(`[extract-changelog] ERROR: no section for version ${version} in CHANGELOG.md.`);
    process.exit(1);
  }

  process.stdout.write(section);
  process.exit(0);
}
