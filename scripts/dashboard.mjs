#!/usr/bin/env node
/**
 * dashboard.mjs — dispatcher for `npm run dashboard <subcommand>`.
 *
 * Subcommands:
 *   refresh   Regenerate the public Quality Report snapshot at
 *             docs/quality-report/. Reads coverage/, nfr-reports/audit.json,
 *             lint-report.json, dist/ and stamps the current package.json
 *             version into a "stale snapshot" banner.
 *
 *             Prerequisites: run `npm run coverage` (and ideally `npm run build`)
 *             beforehand so the dashboard has fresh inputs.
 *
 *             After refresh, commit the result:
 *               git add docs/quality-report
 *               git commit -m "docs: refresh quality snapshot"
 *
 *             Refreshes also happen automatically on `npm run ship <bump>`
 *             as part of the release commit — this manual command is only
 *             needed for between-release ad-hoc updates.
 *
 *   preview   Build the dashboard into the local `dashboard/` directory
 *             (artifact-mode HTML, no banner) for previewing without
 *             committing. Mirrors what CI's health-check.yml produces.
 *
 *   help      Print this help.
 *
 * Why this exists: keeps the canonical refresh command short and discoverable.
 * The underlying flags (`--out docs/quality-report --snapshot-version v9.3.0`)
 * are hidden behind the dispatcher so callers don't have to remember them.
 */

import { spawnSync } from 'child_process';
import { readFileSync, rmSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  return `v${pkg.version}`;
}

function printHelp() {
  console.log(`Usage: npm run dashboard <subcommand>

Subcommands:
  refresh     Rebuild docs/quality-report/ snapshot (commit afterwards).
  preview     Build dashboard/ locally (artifact-mode, no commit).
  help        Print this help.

The release pipeline (\`npm run ship <bump>\`) invokes refresh automatically
and folds docs/quality-report/ into the release commit. Use \`refresh\` here
only for ad-hoc updates between releases.`);
}

const sub = (process.argv[2] || '').toLowerCase();
const rest = process.argv.slice(3);

if (sub === 'refresh') {
  const version = readVersion();
  // Wipe the snapshot dir before regenerating. Two reasons:
  //   1. Old `--copy-coverage` runs may have left a heavy `coverage/` subtree
  //      (~600KB) which we do NOT want in commits — the snapshot is index.html
  //      + summary.json only. Coverage HTML lives in the artifact, not here.
  //   2. Avoids stale orphan files (e.g. if a script run was renamed).
  const snapshotDir = resolve(ROOT, 'docs/quality-report');
  try {
    rmSync(snapshotDir, { recursive: true, force: true });
    mkdirSync(snapshotDir, { recursive: true });
  } catch (e) {
    console.error(`[dashboard refresh] failed to reset ${snapshotDir}: ${e.message}`);
    process.exit(1);
  }
  const args = [
    'scripts/build-dashboard.mjs',
    '--out', 'docs/quality-report',
    '--snapshot-version', version,
    ...rest,
  ];
  const r = spawnSync('node', args, { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) {
    console.error(`[dashboard refresh] FAILED — see output above.`);
    process.exit(r.status ?? 1);
  }
  console.log(`[dashboard refresh] Snapshot regenerated at docs/quality-report/ (stamped ${version}).`);
  console.log(`[dashboard refresh] Next: git add docs/quality-report && git commit -m "docs: refresh quality snapshot"`);
  process.exit(0);
}

if (sub === 'preview') {
  const args = [
    'scripts/build-dashboard.mjs',
    '--out', 'dashboard',
    '--copy-coverage',
    ...rest,
  ];
  const r = spawnSync('node', args, { stdio: 'inherit', cwd: ROOT });
  process.exit(r.status ?? 1);
}

if (sub === 'help' || sub === '--help' || sub === '-h' || sub === '') {
  printHelp();
  process.exit(sub === '' ? 1 : 0);
}

console.error(`[dashboard] Unknown subcommand: ${sub}`);
printHelp();
process.exit(1);
