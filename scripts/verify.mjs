#!/usr/bin/env node

/**
 * verify.mjs — Full codebase verification pipeline.
 *
 * Default mode: runs ALL core checks regardless of individual failures so you
 * get a complete picture in one go. Exit code is non-zero if any step fails.
 *
 * Steps (default):
 *   lint -> build (prod) -> unit tests + coverage -> coverage ratchet -> E2E
 *
 * Release mode (`--release`) appends prod-release gates after the core run:
 *   bundle benchmark -> version & manifest sync (MV3, name+description) ->
 *   dist integrity (no underscore dirs, all critical files) -> git tree status.
 *   B2 will add: npm audit, store check inline, LICENSE, privacy URL, prev tag.
 *
 * `--release` is what `npm run ship check` invokes (via release.mjs). It used
 * to live in scripts/preflight.mjs; folded in here to avoid drift.
 *
 * Usage:
 *   npm run verify                    # core checks (E2E at full speed)
 *   npm run verify -- --no-e2e        # skip E2E (faster, ~2min)
 *   npm run verify -- --e2e-slowmo    # run E2E with SLOW_MO (visual debugging)
 *   npm run verify -- --release       # core checks + release-only gates
 *   node ./scripts/verify.mjs --release --no-e2e   # CI-friendly release gate
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const skipE2E = process.argv.includes('--no-e2e');
const e2eSlowMo = process.argv.includes('--e2e-slowmo');
const releaseMode = process.argv.includes('--release');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const results = [];

function step(name, cmd) {
  console.log(`\n${BOLD}${CYAN}▶ ${name}${RESET}`);
  console.log(`${DIM}  ${cmd}${RESET}\n`);
  const t0 = Date.now();
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, timeout: 600_000 });
    const ms = Date.now() - t0;
    results.push({ name, passed: true, ms });
    console.log(`${GREEN}  ✅ ${name} passed (${(ms / 1000).toFixed(1)}s)${RESET}`);
  } catch {
    const ms = Date.now() - t0;
    results.push({ name, passed: false, ms });
    console.log(`${RED}  ❌ ${name} FAILED (${(ms / 1000).toFixed(1)}s)${RESET}`);
  }
}

// Inline check helper for release-only gates that don't shell out (or where we
// want richer pass/warn semantics than `step` provides).
function check(name, fn) {
  console.log(`\n${BOLD}${CYAN}▶ ${name}${RESET}`);
  const t0 = Date.now();
  let outcome = 'pass';
  let detail = '';
  try {
    detail = fn() ?? '';
    if (detail === 'WARN') {
      outcome = 'warn';
      detail = '';
    } else if (detail.startsWith?.('WARN: ')) {
      outcome = 'warn';
      detail = detail.slice(6);
    }
  } catch (err) {
    outcome = 'fail';
    detail = err.message;
  }
  const ms = Date.now() - t0;
  if (outcome === 'pass') {
    results.push({ name, passed: true, ms });
    console.log(`${GREEN}  ✅ ${name}${RESET}${detail ? ' — ' + detail : ''}`);
  } else if (outcome === 'warn') {
    results.push({ name, passed: true, warned: true, ms });
    console.log(`${YELLOW}  ⚠️  ${name}${RESET}${detail ? ' — ' + detail : ''}`);
  } else {
    results.push({ name, passed: false, ms });
    console.log(`${RED}  ❌ ${name} — ${detail}${RESET}`);
  }
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf-8', shell: true, timeout: 60_000 }).trim();
}

console.log(`${BOLD}${'═'.repeat(50)}${RESET}`);
console.log(`${BOLD}  SmrutiCortex — ${releaseMode ? 'Ship Check (release gate)' : 'Full Verification'}${RESET}`);
console.log(`${'═'.repeat(50)}`);

// ─────────────────────────────────────────────────
// Core phases (always run)
// ─────────────────────────────────────────────────
step('Lint', 'npm run lint');
step('Build (prod)', 'npm run build');
step('Unit Tests + Coverage', 'npx vitest run --coverage');
step('Coverage Ratchet (soft ±1%)', 'node scripts/coverage-ratchet.mjs');

if (skipE2E) {
  results.push({ name: 'E2E Tests', passed: true, ms: 0, skipped: true });
  console.log(`\n${DIM}  ⏭️  E2E tests skipped (--no-e2e)${RESET}`);
} else if (e2eSlowMo) {
  step('E2E Tests (slow-mo)', 'node ./scripts/e2e-slowmo.mjs');
} else {
  step('E2E Tests', 'npx playwright test');
}

// ─────────────────────────────────────────────────
// Release-only gates (folded from preflight.mjs)
// ─────────────────────────────────────────────────
if (releaseMode) {
  console.log(`\n${BOLD}${CYAN}═══ Release-only gates ═══${RESET}`);

  step('Bundle Size Benchmark', 'node ./scripts/benchmark-performance.mjs');

  check('Version sync (package.json <-> manifest.json)', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));
    if (pkg.version !== manifest.version) {
      throw new Error(`package.json=${pkg.version}, manifest.json=${manifest.version}`);
    }
    return `v${pkg.version}`;
  });

  check('Manifest V3 + identity', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));
    if (manifest.manifest_version !== 3) {
      throw new Error(`manifest_version=${manifest.manifest_version}, expected 3`);
    }
    if (!manifest.name || !manifest.description) {
      throw new Error('manifest.json missing name or description');
    }
    return `"${manifest.name}" — ${manifest.description.slice(0, 50)}…`;
  });

  // NOTE: Hardcoded perm list (history/storage/activeTab/tabs) was removed in
  // the v9.2.0 scripts refactor. The authoritative manifest <-> doc parity
  // audit lives in store-check.mjs (D1 perm-gap fix). B2 will inline a call
  // to `npm run store check` from this gate so the audit fires automatically.

  check('dist/ integrity (no underscore dirs, critical files present)', () => {
    const distDir = join(root, 'dist');
    if (!existsSync(distDir)) throw new Error('dist/ directory not found — run `npm run build` first');

    const findUnderscoreDirs = (dir, results = []) => {
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
    };

    const underscoreDirs = findUnderscoreDirs(distDir);
    if (underscoreDirs.length > 0) {
      throw new Error(`underscore directories found in dist/: ${underscoreDirs.join(', ')}`);
    }

    const criticalFiles = [
      'manifest.json',
      'background/service-worker.js',
      'popup/popup.html',
      'popup/popup.js',
      'content_scripts/quick-search.js',
      'content_scripts/extractor.js',
    ];
    const missing = criticalFiles.filter(f => !existsSync(join(distDir, f)));
    if (missing.length > 0) throw new Error(`missing from dist/: ${missing.join(', ')}`);

    return `${criticalFiles.length} critical files present, MV3 safe`;
  });

  check('Git working tree clean', () => {
    let status;
    try {
      status = runCapture('git status --porcelain');
    } catch {
      return 'WARN: could not check git status';
    }
    if (status === '') return 'clean';
    const lines = status.split('\n').length;
    return `WARN: ${lines} uncommitted change(s) — commit or stash before release`;
  });

  check('On release branch', () => {
    let branch;
    try {
      branch = runCapture('git rev-parse --abbrev-ref HEAD');
    } catch {
      return 'WARN: could not determine current branch';
    }
    if (branch === 'main' || branch === 'master') return branch;
    return `WARN: on "${branch}" — releases typically go from main/master`;
  });
}

// ─────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────
console.log(`\n${BOLD}${'═'.repeat(50)}${RESET}`);
console.log(`${BOLD}  ${releaseMode ? 'SHIP CHECK SUMMARY' : 'VERIFICATION SUMMARY'}${RESET}`);
console.log(`${'═'.repeat(50)}`);

const totalMs = results.reduce((s, r) => s + r.ms, 0);
for (const r of results) {
  let icon, time;
  if (r.skipped) { icon = '⏭️ '; time = 'skipped'; }
  else if (!r.passed) { icon = '❌'; time = `${(r.ms / 1000).toFixed(1)}s`; }
  else if (r.warned) { icon = '⚠️ '; time = `${(r.ms / 1000).toFixed(1)}s`; }
  else { icon = '✅'; time = `${(r.ms / 1000).toFixed(1)}s`; }
  console.log(`  ${icon} ${r.name.padEnd(48)} ${time}`);
}
console.log(`${'─'.repeat(50)}`);
console.log(`  Total: ${(totalMs / 1000).toFixed(1)}s`);

const failed = results.filter(r => !r.passed);
const warned = results.filter(r => r.warned);
if (failed.length === 0) {
  if (warned.length === 0) {
    console.log(`\n${GREEN}${BOLD}  ✅ ${releaseMode ? '🚀 Ship check passed — ready to ship.' : 'ALL CHECKS PASSED'}${RESET}\n`);
  } else {
    console.log(`\n${YELLOW}${BOLD}  ⚠️  PASSED with ${warned.length} warning(s) — review before releasing.${RESET}\n`);
  }
} else {
  console.log(`\n${RED}${BOLD}  ❌ ${failed.length} CHECK(S) FAILED:${RESET}`);
  for (const f of failed) {
    console.log(`${RED}     - ${f.name}${RESET}`);
  }
  console.log();
}

process.exit(failed.length > 0 ? 1 : 0);
