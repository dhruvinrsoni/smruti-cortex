/**
 * strip-metadata.mjs
 * Recovery tool for loading CWS-downloaded extensions via "Load Unpacked".
 *
 * Chrome Web Store adds _metadata/ to published CRX packages for integrity
 * verification. Chrome rejects _metadata/ when using "Load Unpacked" because
 * underscore-prefixed names are reserved. This script strips those entries.
 *
 * Usage:
 *   node scripts/strip-metadata.mjs <folder-path>             # strip in-place
 *   node scripts/strip-metadata.mjs <folder-path> --dry-run   # preview only
 *   node scripts/strip-metadata.mjs <folder-path> --quiet     # suppress per-entry log
 *   npm run store unpack -- <folder-path>
 *
 * Safety nets (S9):
 *   - Refuses to operate on the repo root or anything inside dist/, src/,
 *     scripts/, node_modules/. Catches the worst kind of operator slip
 *     (running `npm run store unpack -- .` from the repo root).
 *   - --dry-run lists what would be removed without touching disk.
 *   - --quiet suppresses per-entry log lines for use in build chains.
 *
 * Pure helpers (`isProtectedDir`) are exported for unit tests.
 */

import { existsSync, readdirSync, rmSync, statSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Refuse to strip in-place from the repo itself or any directory whose
 * absolute path overlaps with the repo's source tree.
 *
 * @param {string} absPath           The absolute target directory.
 * @param {string} repoRoot          The absolute repo root (defaults to this script's grandparent).
 * @returns {{ protected: boolean, reason?: string }}
 *
 * Pure (no I/O); takes repoRoot as an argument so tests can pin it.
 */
export function isProtectedDir(absPath, repoRoot = REPO_ROOT) {
  if (typeof absPath !== 'string' || absPath.length === 0) {
    return { protected: true, reason: 'empty path' };
  }
  const norm = (p) => resolve(p).replace(/\\/g, '/').replace(/\/$/, '');
  const target = norm(absPath);
  const root   = norm(repoRoot);
  if (target === root) {
    return { protected: true, reason: `target is the repo root (${root})` };
  }
  for (const guard of ['dist', 'node_modules', 'src', 'scripts']) {
    const guardPath = `${root}/${guard}`;
    if (target === guardPath || target.startsWith(`${guardPath}/`)) {
      return { protected: true, reason: `target is inside ${guard}/ (${target})` };
    }
  }
  return { protected: false };
}

// ──────────────────────────────────────────────────────────────────────────
// CLI — only runs when invoked directly (not when imported by tests).
// ──────────────────────────────────────────────────────────────────────────

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const quiet = argv.includes('--quiet');
  const help = argv.includes('--help') || argv.includes('-h');
  // First positional that doesn't start with `--` is the target.
  const target = argv.find(a => !a.startsWith('--'));

  if (help) {
    console.log(`Usage: node scripts/strip-metadata.mjs <folder-path> [--dry-run] [--quiet]

Strips _metadata/ and other _* entries from a CWS-downloaded extension folder
so Chrome accepts "Load Unpacked".

Flags:
  --dry-run    Preview removals; do not modify disk.
  --quiet      Suppress per-entry log lines (errors still print).
  -h, --help   Show this help.`);
    process.exit(0);
  }

  if (!target) {
    console.error('Usage: node scripts/strip-metadata.mjs <folder-path> [--dry-run] [--quiet]');
    console.error('  Strips _metadata/ and other _* entries so Chrome accepts "Load Unpacked".');
    process.exit(1);
  }

  const absPath = resolve(target);

  // Refuse to operate on the repo itself or any source directory.
  const guard = isProtectedDir(absPath);
  if (guard.protected) {
    console.error(`Refusing to strip ${absPath}`);
    console.error(`  Reason: ${guard.reason}`);
    console.error(`  This tool is meant for CWS-downloaded extension folders, not the repo source tree.`);
    process.exit(2);
  }

  if (!existsSync(absPath)) {
    console.error(`Path not found: ${absPath}`);
    process.exit(1);
  }

  const stat = statSync(absPath);
  if (!stat.isDirectory()) {
    console.error(`Not a directory: ${absPath}`);
    console.error('   Unzip your CWS download first, then pass the resulting folder.');
    process.exit(1);
  }

  const entries = readdirSync(absPath);
  const underscored = entries.filter(e => e.startsWith('_'));

  if (underscored.length === 0) {
    if (!quiet) console.log(`No underscore-prefixed entries found in ${basename(absPath)}/ — already clean.`);
    process.exit(0);
  }

  if (!quiet) {
    const verb = dryRun ? '[dry-run] Would strip' : 'Stripping';
    console.log(`${verb} ${underscored.length} reserved entr${underscored.length === 1 ? 'y' : 'ies'}:`);
  }

  for (const name of underscored) {
    const full = resolve(absPath, name);
    const isDir = statSync(full).isDirectory();
    if (!dryRun) {
      rmSync(full, { recursive: true, force: true });
    }
    if (!quiet) {
      const marker = dryRun ? '[would remove]' : 'removed';
      console.log(`   ${marker} ${name}${isDir ? '/' : ''}`);
    }
  }

  if (!quiet) {
    if (dryRun) {
      console.log(`\n[dry-run] No files modified. Re-run without --dry-run to strip.`);
    } else {
      console.log(`\nDone. Load this folder via chrome://extensions -> "Load Unpacked":`);
      console.log(`   ${absPath}`);
    }
  }
}
