#!/usr/bin/env node
/**
 * sync-version.mjs — Single source of truth for version parity.
 *
 * Reads `package.json.version`, validates semver shape, and atomically
 * writes it to `manifest.json.version`. Runs at the start of every
 * `npm run build` so manifest.json never drifts from package.json.
 *
 * Modes:
 *   (default)        Write package.json.version into manifest.json.
 *   --check          Read-only parity check. Exit 0 if matched, exit 1 if not.
 *                    Used by verify.mjs and store-check.mjs.
 *
 * Flags:
 *   --quiet          Suppress the "Synced ..." log line on success (errors
 *                    still print). Useful when called from build chains.
 *   -h, --help       Show usage.
 *
 * Exit codes:
 *   0   Success (or `--check` says versions match).
 *   1   Validation / IO failure (or `--check` says versions disagree).
 *
 * Pure helpers (`isValidSemver`) are exported for unit tests.
 */

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

/**
 * Validates that a version string matches `MAJOR.MINOR.PATCH` with an
 * optional pre-release / build suffix (e.g. `1.2.3`, `1.2.3-rc.1`,
 * `1.2.3+build.42`). Returns `true` for valid, `false` otherwise.
 *
 * Accepts the subset of semver actually used by Chrome MV3 manifests
 * (Chrome only honours numeric `MAJOR.MINOR.PATCH[.BUILD]`, but we keep
 * package.json semver-shaped on principle).
 */
export function isValidSemver(version) {
  if (typeof version !== 'string' || version.length === 0) return false;
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version);
}

// ──────────────────────────────────────────────────────────────────────────
// CLI — only runs when invoked directly (not when imported by tests).
// ──────────────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`[sync-version] ERROR: ${msg}`);
  process.exit(1);
}

function readJsonOrFail(path, label) {
  if (!existsSync(path)) {
    fail(`${label} not found at ${path}. Run from the repo root.`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    fail(`${label} at ${path} is not valid JSON: ${err.message}`);
  }
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  const argv = process.argv.slice(2);
  const checkMode = argv.includes('--check');
  const quiet = argv.includes('--quiet');
  const help = argv.includes('--help') || argv.includes('-h');

  if (help) {
    console.log(`Usage: node scripts/sync-version.mjs [--check] [--quiet]

Default mode: writes package.json.version into manifest.json (atomic).
--check     : read-only parity check; exit 0 if matched, exit 1 if not.
--quiet     : suppress success log line (errors still print).
-h, --help  : show this help.`);
    process.exit(0);
  }

  const pkgPath = resolve(rootDir, 'package.json');
  const manifestPath = resolve(rootDir, 'manifest.json');

  const pkg = readJsonOrFail(pkgPath, 'package.json');
  const manifest = readJsonOrFail(manifestPath, 'manifest.json');

  const pkgVersion = pkg.version;
  const manifestVersion = manifest.version;

  if (!isValidSemver(pkgVersion)) {
    fail(`package.json.version "${pkgVersion}" is not a valid MAJOR.MINOR.PATCH (semver) string.`);
  }

  if (checkMode) {
    if (pkgVersion === manifestVersion) {
      if (!quiet) console.log(`[sync-version] OK — package.json and manifest.json both at ${pkgVersion}`);
      process.exit(0);
    }
    console.error(`[sync-version] MISMATCH — package.json=${pkgVersion}  manifest.json=${manifestVersion}`);
    console.error('[sync-version] Run "node scripts/sync-version.mjs" (without --check) to write the package.json version into manifest.json.');
    process.exit(1);
  }

  if (pkgVersion === manifestVersion) {
    if (!quiet) console.log(`[sync-version] manifest.json already at ${pkgVersion} (no write needed)`);
    process.exit(0);
  }

  manifest.version = pkgVersion;
  const tmpPath = `${manifestPath}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    renameSync(tmpPath, manifestPath);
  } catch (err) {
    if (existsSync(tmpPath)) {
      try { unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    }
    fail(`Failed to write manifest.json: ${err.message}`);
  }

  if (!quiet) {
    console.log(`[sync-version] manifest.json: ${manifestVersion} -> ${pkgVersion}`);
  }
  process.exit(0);
}
