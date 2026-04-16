#!/usr/bin/env node

/**
 * preflight.mjs — Full pre-release verification pipeline.
 *
 * Runs `npm run verify` (lint + build + build:prod + coverage + E2E)
 * then performs additional prod-release checks:
 *   - Bundle size benchmark (thresholds + dist integrity)
 *   - manifest.json / package.json version sync
 *   - manifest_version === 3
 *   - No forbidden underscore dirs in dist/
 *   - Package zip creation
 *   - store-prep output preview
 *   - Git working tree cleanliness
 *
 * Exit 0 = ready for release.  Exit 1 = issues found.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let failCount = 0;
let warnCount = 0;

function header(text) {
  console.log(`\n${BOLD}${CYAN}═══ ${text} ═══${RESET}`);
}

function pass(msg) {
  console.log(`  ${GREEN}✅ ${msg}${RESET}`);
}

function fail(msg) {
  console.log(`  ${RED}❌ ${msg}${RESET}`);
  failCount++;
}

function warn(msg) {
  console.log(`  ${YELLOW}⚠️  ${msg}${RESET}`);
  warnCount++;
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, encoding: 'utf-8', shell: true, timeout: 600_000, ...opts });
}

function runInherit(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, timeout: 600_000 });
}

// ─────────────────────────────────────────────────
// Phase 1: npm run verify (lint + build + coverage + E2E)
// ─────────────────────────────────────────────────
header('PHASE 1 — Full Verification (npm run verify)');
try {
  runInherit('npm run verify');
  pass('npm run verify passed');
} catch {
  fail('npm run verify failed — fix errors above before releasing');
  console.log(`\n${RED}${BOLD}PREFLIGHT ABORTED — verify must pass first.${RESET}`);
  process.exit(1);
}

// ─────────────────────────────────────────────────
// Phase 2: Bundle Size Benchmark
// ─────────────────────────────────────────────────
header('PHASE 2 — Bundle Size Benchmark');
try {
  runInherit('node ./scripts/benchmark-performance.mjs');
  pass('Bundle benchmark passed (sizes within thresholds)');
} catch {
  fail('Bundle benchmark failed — check size thresholds above');
}

// ─────────────────────────────────────────────────
// Phase 3: Version & Manifest Checks
// ─────────────────────────────────────────────────
header('PHASE 3 — Version & Manifest');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));

if (pkg.version === manifest.version) {
  pass(`Versions in sync: ${pkg.version}`);
} else {
  fail(`Version mismatch — package.json=${pkg.version}, manifest.json=${manifest.version}`);
}

if (manifest.manifest_version === 3) {
  pass('manifest_version is 3 (MV3)');
} else {
  fail(`manifest_version is ${manifest.manifest_version}, expected 3`);
}

if (manifest.name && manifest.description) {
  pass(`Extension: "${manifest.name}" — ${manifest.description.slice(0, 60)}…`);
} else {
  fail('manifest.json missing name or description');
}

const requiredPerms = ['history', 'storage', 'activeTab', 'tabs'];
const missingPerms = requiredPerms.filter(p => !(manifest.permissions || []).includes(p));
if (missingPerms.length === 0) {
  pass(`Required permissions present: ${requiredPerms.join(', ')}`);
} else {
  fail(`Missing required permissions: ${missingPerms.join(', ')}`);
}

// ─────────────────────────────────────────────────
// Phase 4: dist/ Integrity
// ─────────────────────────────────────────────────
header('PHASE 4 — dist/ Integrity');

const distDir = join(root, 'dist');
if (!existsSync(distDir)) {
  fail('dist/ directory not found');
} else {
  pass('dist/ directory exists');

  // Check for forbidden underscore directories (Chrome MV3 rejects them)
  function findUnderscoreDirs(dir, results = []) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry.startsWith('_')) {
          results.push(full.replace(root + '\\', '').replace(root + '/', ''));
        }
        findUnderscoreDirs(full, results);
      }
    }
    return results;
  }

  const underscoreDirs = findUnderscoreDirs(distDir);
  if (underscoreDirs.length === 0) {
    pass('No underscore directories in dist/ (MV3 safe)');
  } else {
    fail(`Underscore directories found in dist/: ${underscoreDirs.join(', ')}`);
  }

  // Check critical files exist
  const criticalFiles = [
    'manifest.json',
    'background/service-worker.js',
    'popup/popup.html',
    'popup/popup.js',
    'content_scripts/quick-search.js',
    'content_scripts/extractor.js',
  ];
  const missing = criticalFiles.filter(f => !existsSync(join(distDir, f)));
  if (missing.length === 0) {
    pass(`All ${criticalFiles.length} critical files present in dist/`);
  } else {
    fail(`Missing from dist/: ${missing.join(', ')}`);
  }
}

// ─────────────────────────────────────────────────
// Phase 5: Package Zip
// ─────────────────────────────────────────────────
header('PHASE 5 — Package Zip');
try {
  runInherit('node ./scripts/package.mjs');
  pass('Package zip created successfully');
} catch {
  fail('Package zip creation failed');
}

// ─────────────────────────────────────────────────
// Phase 6: Git Status
// ─────────────────────────────────────────────────
header('PHASE 6 — Git Status');

try {
  const status = run('git status --porcelain').trim();
  if (status === '') {
    pass('Working tree clean — ready to tag and release');
  } else {
    const lines = status.split('\n').length;
    warn(`Working tree has ${lines} uncommitted change(s) — commit or stash before release`);
  }
} catch {
  warn('Could not check git status');
}

try {
  const branch = run('git rev-parse --abbrev-ref HEAD').trim();
  if (branch === 'main' || branch === 'master') {
    pass(`On release branch: ${branch}`);
  } else {
    warn(`On branch "${branch}" — releases typically go from main/master`);
  }
} catch {
  warn('Could not determine current branch');
}

// ─────────────────────────────────────────────────
// Phase 7: Store Prep Preview
// ─────────────────────────────────────────────────
header('PHASE 7 — Store Prep Preview');
try {
  const storeOutput = run('node ./scripts/store-prep.mjs');
  console.log(storeOutput);
  pass('store-prep output generated');
} catch {
  warn('store-prep script not available or failed');
}

// ─────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────
console.log(`\n${BOLD}${'═'.repeat(50)}${RESET}`);
console.log(`${BOLD}PREFLIGHT SUMMARY${RESET}`);
console.log(`${'═'.repeat(50)}`);

if (failCount === 0 && warnCount === 0) {
  console.log(`\n${GREEN}${BOLD}🚀 ALL CLEAR — Ready for takeoff!${RESET}`);
  console.log(`${GREEN}   Version ${pkg.version} is production-ready.${RESET}`);
  console.log(`\n   Next steps:`);
  console.log(`   1. node scripts/release.mjs <patch|minor|major>`);
  console.log(`   2. Upload zip from release/ to Chrome Web Store`);
} else if (failCount === 0) {
  console.log(`\n${YELLOW}${BOLD}⚠️  CLEAR WITH WARNINGS — ${warnCount} warning(s)${RESET}`);
  console.log(`${YELLOW}   Review warnings above before releasing.${RESET}`);
} else {
  console.log(`\n${RED}${BOLD}❌ PREFLIGHT FAILED — ${failCount} error(s), ${warnCount} warning(s)${RESET}`);
  console.log(`${RED}   Fix the errors above before releasing.${RESET}`);
}

console.log();
process.exit(failCount > 0 ? 1 : 0);
