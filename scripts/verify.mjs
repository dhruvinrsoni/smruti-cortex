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
 *   bundle benchmark -> npm audit (HIGH/CRITICAL CVEs) -> store check inline
 *   (manifest <-> doc parity audit) -> version & manifest sync (MV3, name+description)
 *   -> dist integrity (no underscore dirs, all critical files) -> LICENSE present
 *   -> privacy policy URL HTTP 200 -> previous-version git tag exists -> git tree status.
 *
 * `--release` is what `npm run ship check` invokes (via release.mjs). It used
 * to live in scripts/preflight.mjs; folded in here to avoid drift.
 *
 * Usage:
 *   npm run verify                    # core checks (E2E at full speed)
 *   npm run verify -- --no-e2e        # skip E2E (faster, ~2min)
 *   npm run verify -- --e2e-slowmo    # run E2E with SLOW_MO (visual debugging)
 *   npm run verify -- --release       # core checks + release-only gates
 *   npm run verify -- --release --no-network  # skip phases that need internet
 *   node ./scripts/verify.mjs --release --no-e2e   # CI-friendly release gate
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const skipE2E = process.argv.includes('--no-e2e');
const e2eSlowMo = process.argv.includes('--e2e-slowmo');
const releaseMode = process.argv.includes('--release');
const noNetwork = process.argv.includes('--no-network');
const jsonMode = process.argv.includes('--json');
// Strict mode promotes every WARN to FAIL. release.mjs Step 2 always passes
// --strict so a warning blocks a real release; standalone `npm run verify`
// keeps the lenient default. Operators who want a paranoid pre-flight can
// pass --strict explicitly.
const strictMode = process.argv.includes('--strict');

// In --json mode we keep stdout pristine for NDJSON events and route the
// pretty human-readable output to stderr. CI scrapers can pipe stdout into
// jq / python while a watching operator still sees the formatted version
// in their terminal (stderr).
if (jsonMode) {
  console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
  console.warn = (...args) => process.stderr.write(args.join(' ') + '\n');
  console.error = (...args) => process.stderr.write(args.join(' ') + '\n');
}

// Emit one NDJSON event per line on stdout. Schema kept tiny on purpose:
//   { ts, phase, name?, status?, ms?, detail? }
// Schema additions are non-breaking — consumers should ignore unknown keys.
function emitJson(phase, fields = {}) {
  if (!jsonMode) return;
  const event = { ts: new Date().toISOString(), phase, ...fields };
  process.stdout.write(JSON.stringify(event) + '\n');
}

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const results = [];

// How many tail lines of a failed step's output to surface in the SUMMARY
// footer. Big enough to capture a typical stack trace + a vitest failure
// header; small enough that a multi-failure summary still fits in a normal
// terminal scrollback.
const FAILURE_TAIL_LINES = 50;

// Tee a child process's stdout/stderr to our own streams (so the operator
// still sees live output) while accumulating a rolling tail buffer that
// we'll surface in the summary if the step fails. Returns a Promise that
// resolves with { code, tail } so the caller can decide pass/fail.
function spawnAndCapture(cmd) {
  return new Promise((resolveResult) => {
    const child = spawn(cmd, { cwd: root, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    const buf = [];
    const push = (chunk) => {
      const text = chunk.toString();
      // Keep tail bounded so a 10-minute build with 50k lines doesn't blow
      // memory. Split on newlines, trim to the last FAILURE_TAIL_LINES.
      const lines = (buf.join('') + text).split(/\r?\n/);
      const trimmed = lines.slice(-FAILURE_TAIL_LINES);
      buf.length = 0;
      buf.push(trimmed.join('\n'));
    };
    child.stdout.on('data', (c) => { process.stdout.write(c); push(c); });
    child.stderr.on('data', (c) => { process.stderr.write(c); push(c); });
    child.on('error', (err) => resolveResult({ code: 1, tail: `[spawn error] ${err.message}` }));
    child.on('close', (code) => resolveResult({ code: code ?? 0, tail: buf.join('') }));
  });
}

async function step(name, cmd) {
  console.log(`\n${BOLD}${CYAN}▶ ${name}${RESET}`);
  console.log(`${DIM}  ${cmd}${RESET}\n`);
  emitJson('step.start', { name, cmd });
  const t0 = Date.now();
  const { code, tail } = await spawnAndCapture(cmd);
  const ms = Date.now() - t0;
  if (code === 0) {
    results.push({ name, passed: true, ms });
    console.log(`${GREEN}  ✅ ${name} passed (${(ms / 1000).toFixed(1)}s)${RESET}`);
    emitJson('step.end', { name, status: 'pass', ms });
  } else {
    results.push({ name, passed: false, ms, tail });
    console.log(`${RED}  ❌ ${name} FAILED (${(ms / 1000).toFixed(1)}s, exit=${code})${RESET}`);
    emitJson('step.end', { name, status: 'fail', ms, exitCode: code, tail });
  }
}

// Inline check helper for release-only gates that don't shell out (or where we
// want richer pass/warn semantics than `step` provides).
function recordCheck(name, t0, outcome, detail) {
  const ms = Date.now() - t0;
  if (outcome === 'pass') {
    results.push({ name, passed: true, ms });
    console.log(`${GREEN}  ✅ ${name}${RESET}${detail ? ' — ' + detail : ''}`);
    emitJson('check.end', { name, status: 'pass', ms, detail });
  } else if (outcome === 'warn') {
    if (strictMode) {
      // Strict promotes WARN to FAIL: a release-blocking gate must not
      // ship with any soft signals. The detail line gets a "[strict]"
      // prefix so the operator can see the original outcome at a glance.
      results.push({ name, passed: false, ms, promotedFromWarn: true });
      console.log(`${RED}  ❌ ${name} [strict-promoted] — ${detail || 'warning'}${RESET}`);
      emitJson('check.end', { name, status: 'fail', ms, detail, promotedFromWarn: true });
    } else {
      results.push({ name, passed: true, warned: true, ms });
      console.log(`${YELLOW}  ⚠️  ${name}${RESET}${detail ? ' — ' + detail : ''}`);
      emitJson('check.end', { name, status: 'warn', ms, detail });
    }
  } else {
    results.push({ name, passed: false, ms });
    console.log(`${RED}  ❌ ${name} — ${detail}${RESET}`);
    emitJson('check.end', { name, status: 'fail', ms, detail });
  }
}

function classifyDetail(raw) {
  let detail = raw ?? '';
  if (detail === 'WARN') return { outcome: 'warn', detail: '' };
  if (detail.startsWith?.('WARN: ')) return { outcome: 'warn', detail: detail.slice(6) };
  return { outcome: 'pass', detail };
}

function check(name, fn) {
  console.log(`\n${BOLD}${CYAN}▶ ${name}${RESET}`);
  const t0 = Date.now();
  try {
    const { outcome, detail } = classifyDetail(fn());
    recordCheck(name, t0, outcome, detail);
  } catch (err) {
    recordCheck(name, t0, 'fail', err.message);
  }
}

async function checkAsync(name, fn) {
  console.log(`\n${BOLD}${CYAN}▶ ${name}${RESET}`);
  const t0 = Date.now();
  try {
    const { outcome, detail } = classifyDetail(await fn());
    recordCheck(name, t0, outcome, detail);
  } catch (err) {
    recordCheck(name, t0, 'fail', err.message);
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
await step('Version parity (manifest <-> package)', 'node scripts/sync-version.mjs --check');
await step('Lint', 'npm run lint');
await step('Build (prod)', 'npm run build');
await step('Unit Tests + Coverage', 'npx vitest run --coverage');
await step('Coverage Ratchet (absolute floors 70/80/90)', 'node scripts/coverage-ratchet.mjs');

if (skipE2E) {
  results.push({ name: 'E2E Tests', passed: true, ms: 0, skipped: true });
  console.log(`\n${DIM}  ⏭️  E2E tests skipped (--no-e2e)${RESET}`);
} else if (e2eSlowMo) {
  await step('E2E Tests (slow-mo)', 'node ./scripts/e2e-slowmo.mjs');
} else {
  await step('E2E Tests', 'npx playwright test');
}

// ─────────────────────────────────────────────────
// Release-only gates (folded from preflight.mjs)
// ─────────────────────────────────────────────────
if (releaseMode) {
  console.log(`\n${BOLD}${CYAN}═══ Release-only gates ═══${RESET}`);

  await step('Bundle Size Benchmark', 'node ./scripts/benchmark-performance.mjs');

  // (a) Dependency vulnerability scan. `--audit-level=high` exits non-zero only
  //     when HIGH or CRITICAL CVEs are present; lower-severity advisories pass.
  await step('npm audit (HIGH/CRITICAL only)', 'npm audit --audit-level=high');

  // (b) Manifest <-> submission-doc parity audit (the D1 perm-gap fix lives
  //     inside store-check.mjs). This is the same audit a release reviewer
  //     effectively runs, just enforced locally before any tag/push happens.
  //
  //     Under --no-network we *downgrade* this gate (pass --no-remote) instead
  //     of skipping entirely. The local checks — manifest<->doc parity,
  //     submission doc presence, CHANGELOG section, release zip presence —
  //     need zero network and are exactly the kind of audit an offline
  //     operator still wants to enforce. Only the public-store-reachable
  //     probe inside store-check is genuinely network-bound; --no-remote
  //     skips just that probe.
  if (noNetwork) {
    await step('Store check (manifest <-> doc parity, offline)', 'npm run store check -- --no-remote');
  } else {
    await step('Store check (manifest <-> doc parity)', 'npm run store check');
  }

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

  // (c) LICENSE file must exist and have real content. Cheap sanity that
  //     prevents the "we shipped without a LICENSE" failure mode the BUSL-1.1
  //     project would suffer from.
  check('LICENSE present + non-empty', () => {
    const licensePath = join(root, 'LICENSE');
    if (!existsSync(licensePath)) throw new Error('LICENSE file not found at repo root');
    const size = statSync(licensePath).size;
    if (size < 100) throw new Error(`LICENSE file is suspiciously small (${size} bytes)`);
    return `${size} bytes`;
  });

  // (d) Privacy policy URL must return HTTP 200. The CWS reviewer visits this
  //     URL — if it 404s the listing gets rejected. Skippable via --no-network.
  if (noNetwork) {
    results.push({ name: 'Privacy policy URL HTTP 200', passed: true, ms: 0, skipped: true });
    console.log(`\n${DIM}  ⏭️  Privacy policy URL check skipped (--no-network)${RESET}`);
  } else {
    await checkAsync('Privacy policy URL HTTP 200', async () => {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
      const homepage = (pkg.homepage || '').replace(/\/$/, '');
      if (!homepage) throw new Error('package.json has no homepage URL');
      const url = `${homepage}/privacy.html`;
      let res;
      try {
        res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      } catch (err) {
        return `WARN: could not reach ${url} (${err.message})`;
      }
      if (res.status !== 200) throw new Error(`${url} -> HTTP ${res.status}`);
      return url;
    });
  }

  // (e) The currently-released version's tag must exist. release.mjs depends
  //     on `git show v<current>:manifest.json` to compute the permission
  //     delta for the NEXT release; a missing tag would silently break the
  //     next ship init.
  //
  //     NOTE: This is named "Current release tag" not "Previous-version" —
  //     when this gate runs, package.json holds the *most recently released*
  //     version (release.mjs runs verify --release BEFORE bumping). What's
  //     "previous" from the perspective of the next release is "current"
  //     from the perspective of the file we're reading.
  check('Current release tag exists (v<X.Y.Z>)', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const tag = `v${pkg.version}`;
    // NOTE: don't use `${tag}^{commit}` — the `^` is a cmd.exe escape character
    // on Windows and breaks the rev-parse arg. `refs/tags/<tag>` is portable.
    try {
      runCapture(`git rev-parse --verify --quiet refs/tags/${tag}`);
    } catch {
      throw new Error(`tag ${tag} not found locally — run 'git fetch --tags' or release this version first`);
    }
    return tag;
  });

  // Sibling check: report (as WARN) any of the three possible next-bump tags
  // that already exist locally. release.mjs has its own pre-bump collision
  // guard (A3) that hard-fails for the *specific* bump the operator chose,
  // but seeing a stray patch/minor/major tag here often signals a previously
  // interrupted ship that someone forgot to clean up — surface it now so the
  // operator can sort it out before the next release attempt.
  check('Next-bump tags do not collide', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const [maj, min, pat] = pkg.version.split('.').map(Number);
    const candidates = {
      patch: `v${maj}.${min}.${pat + 1}`,
      minor: `v${maj}.${min + 1}.0`,
      major: `v${maj + 1}.0.0`,
    };
    const collisions = [];
    for (const [bump, tag] of Object.entries(candidates)) {
      try {
        runCapture(`git rev-parse --verify --quiet refs/tags/${tag}`);
        collisions.push(`${bump}=${tag}`);
      } catch { /* tag absent — good */ }
    }
    if (collisions.length === 0) return Object.values(candidates).join(', ') + ' all clear';
    return `WARN: pre-existing tag(s) found — ${collisions.join(', ')} — likely from an interrupted ship; clean up before the next release`;
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

  // Replay the captured tail of every step that failed. With long pipelines
  // (build → tests → coverage → e2e → release gates) the failing step's
  // output can be hundreds or thousands of lines back in scrollback by the
  // time we reach the summary. Surfacing the tail here means the operator
  // can copy-paste the diagnostic without scrolling.
  for (const f of failed) {
    if (!f.tail) continue;
    console.log(`${RED}${BOLD}┌─ tail of "${f.name}" (last ${FAILURE_TAIL_LINES} lines) ─${RESET}`);
    for (const line of f.tail.split(/\r?\n/)) {
      console.log(`${DIM}│${RESET} ${line}`);
    }
    console.log(`${RED}${BOLD}└────────────────────────────────────────${RESET}\n`);
  }
}

emitJson('summary', {
  totalMs,
  total: results.length,
  passed: results.filter(r => r.passed && !r.warned && !r.skipped).length,
  warned: warned.length,
  failed: failed.length,
  skipped: results.filter(r => r.skipped).length,
  status: failed.length > 0 ? 'fail' : (warned.length > 0 ? 'warn' : 'pass'),
});

process.exit(failed.length > 0 ? 1 : 0);
