// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for scripts/sync-version.mjs
// ──────────────────────────────────────────────────────────────────────────────
// Run with:   node --test scripts/__tests__/sync-version.test.mjs
//
// Only the pure helper `isValidSemver` is unit-tested directly; the CLI body
// is exercised end-to-end via spawnSync covering the four code paths:
//   1. default mode rewrites manifest.json
//   2. --check mode passes when versions match
//   3. --check mode fails (exit 1) when versions disagree
//   4. malformed package.json.version aborts before touching manifest
// ──────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isValidSemver } from '../sync-version.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'sync-version.mjs');

// ──────────────────────────────────────────────────────────────────────────────
// isValidSemver
// ──────────────────────────────────────────────────────────────────────────────

test('isValidSemver: accepts plain MAJOR.MINOR.PATCH', () => {
  assert.equal(isValidSemver('1.2.3'), true);
  assert.equal(isValidSemver('0.0.0'), true);
  assert.equal(isValidSemver('99.0.1'), true);
});

test('isValidSemver: accepts pre-release and build metadata', () => {
  assert.equal(isValidSemver('1.2.3-rc.1'), true);
  assert.equal(isValidSemver('1.2.3-alpha'), true);
  assert.equal(isValidSemver('1.2.3-rc.1+build.42'), true);
  assert.equal(isValidSemver('1.2.3+build.42'), true);
});

test('isValidSemver: rejects too-few segments', () => {
  assert.equal(isValidSemver('1'), false);
  assert.equal(isValidSemver('1.2'), false);
  assert.equal(isValidSemver(''), false);
});

test('isValidSemver: rejects non-numeric segments', () => {
  assert.equal(isValidSemver('1.2.x'), false);
  assert.equal(isValidSemver('a.b.c'), false);
});

test('isValidSemver: rejects whitespace and leading/trailing junk', () => {
  assert.equal(isValidSemver(' 1.2.3'), false);
  assert.equal(isValidSemver('1.2.3 '), false);
  assert.equal(isValidSemver('v1.2.3'), false);
});

test('isValidSemver: rejects non-string inputs', () => {
  assert.equal(isValidSemver(undefined), false);
  assert.equal(isValidSemver(null), false);
  assert.equal(isValidSemver(123), false);
  assert.equal(isValidSemver({ version: '1.2.3' }), false);
});

// ──────────────────────────────────────────────────────────────────────────────
// CLI integration tests
// ──────────────────────────────────────────────────────────────────────────────

function makeFixtureRoot(pkgVersion, manifestVersion) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-version-test-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'test', version: pkgVersion, private: true }, null, 2),
    'utf-8',
  );
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ name: 'test', version: manifestVersion, manifest_version: 3 }, null, 2),
    'utf-8',
  );
  return dir;
}

/**
 * Runs the script against a fixture directory by copying it to `<dir>/scripts/`
 * (the script resolves package.json/manifest.json via `..` from its own
 * location).
 */
function runScript(fixtureDir, args = []) {
  const scriptsDir = join(fixtureDir, 'scripts');
  const fixtureScript = join(scriptsDir, 'sync-version.mjs');
  if (!existsSync(scriptsDir)) {
    mkdirSync(scriptsDir, { recursive: true });
  }
  copyFileSync(SCRIPT, fixtureScript);
  return spawnSync('node', [fixtureScript, ...args], { encoding: 'utf-8' });
}

test('CLI default mode: writes package version into manifest.json', () => {
  const dir = makeFixtureRoot('1.2.3', '1.0.0');
  try {
    const r = runScript(dir);
    assert.equal(r.status, 0, r.stderr);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.version, '1.2.3');
    assert.match(r.stdout, /1\.0\.0 -> 1\.2\.3/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI default mode: no-op when versions already match', () => {
  const dir = makeFixtureRoot('1.2.3', '1.2.3');
  try {
    const r = runScript(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /already at 1\.2\.3/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --check mode: exit 0 when versions match', () => {
  const dir = makeFixtureRoot('1.2.3', '1.2.3');
  try {
    const r = runScript(dir, ['--check']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /OK .* both at 1\.2\.3/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --check mode: exit 1 when versions disagree (no manifest mutation)', () => {
  const dir = makeFixtureRoot('1.2.3', '1.0.0');
  try {
    const r = runScript(dir, ['--check']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /MISMATCH/);
    assert.match(r.stderr, /package\.json=1\.2\.3/);
    assert.match(r.stderr, /manifest\.json=1\.0\.0/);
    // Manifest must not have been rewritten.
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.version, '1.0.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: malformed package.json version aborts before touching manifest', () => {
  const dir = makeFixtureRoot('not-a-version', '1.0.0');
  try {
    const r = runScript(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not a valid MAJOR\.MINOR\.PATCH/);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.version, '1.0.0', 'manifest.json must not have been modified');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --quiet: suppresses success log on default mode', () => {
  const dir = makeFixtureRoot('1.2.3', '1.0.0');
  try {
    const r = runScript(dir, ['--quiet']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'no stdout in --quiet mode on success');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
