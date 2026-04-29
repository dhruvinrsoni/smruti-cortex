// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for scripts/strip-metadata.mjs (S9 safety-net helper)
// ──────────────────────────────────────────────────────────────────────────────
// Run with:   node --test scripts/__tests__/strip-metadata.test.mjs
//
// These tests exercise the pure isProtectedDir helper. The CLI body in
// strip-metadata.mjs is gated behind an `invokedAsMain` check so importing
// the module here does NOT run any filesystem operations.
// ──────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';

import { isProtectedDir } from '../strip-metadata.mjs';

const REPO = 'C:/repo/smruti-cortex';
const REPO_POSIX = '/home/me/smruti-cortex';

// ──────────────────────────────────────────────────────────────────────────────
// Repo root and source-tree guard
// ──────────────────────────────────────────────────────────────────────────────

test('isProtectedDir: refuses the repo root itself', () => {
  const r = isProtectedDir(REPO, REPO);
  assert.equal(r.protected, true);
  assert.match(r.reason, /repo root/);
});

test('isProtectedDir: refuses inside dist/', () => {
  const r = isProtectedDir(`${REPO}/dist`, REPO);
  assert.equal(r.protected, true);
  assert.match(r.reason, /dist/);
});

test('isProtectedDir: refuses inside src/', () => {
  const r = isProtectedDir(`${REPO}/src/background`, REPO);
  assert.equal(r.protected, true);
  assert.match(r.reason, /src/);
});

test('isProtectedDir: refuses inside scripts/', () => {
  const r = isProtectedDir(`${REPO}/scripts`, REPO);
  assert.equal(r.protected, true);
  assert.match(r.reason, /scripts/);
});

test('isProtectedDir: refuses inside node_modules/', () => {
  const r = isProtectedDir(`${REPO}/node_modules/foo`, REPO);
  assert.equal(r.protected, true);
  assert.match(r.reason, /node_modules/);
});

test('isProtectedDir: allows directories outside the repo (typical CWS download)', () => {
  const r = isProtectedDir('C:/Downloads/cws-unpacked', REPO);
  assert.equal(r.protected, false);
});

test('isProtectedDir: allows the release/ directory (not in the source-tree guard)', () => {
  const r = isProtectedDir(`${REPO}/release/cws-download`, REPO);
  assert.equal(r.protected, false);
});

test('isProtectedDir: handles trailing slashes idempotently', () => {
  // Some shells append a trailing slash to argv when tab-completing folders.
  assert.equal(isProtectedDir(`${REPO}/dist/`, REPO).protected, true);
  assert.equal(isProtectedDir(`${REPO}/`, REPO).protected, true);
});

test('isProtectedDir: posix-style repo roots are handled too', () => {
  assert.equal(isProtectedDir(REPO_POSIX, REPO_POSIX).protected, true);
  assert.equal(isProtectedDir(`${REPO_POSIX}/scripts`, REPO_POSIX).protected, true);
  assert.equal(isProtectedDir('/tmp/cws-download', REPO_POSIX).protected, false);
});

test('isProtectedDir: empty / non-string inputs are treated as protected', () => {
  assert.equal(isProtectedDir('', REPO).protected, true);
  assert.equal(isProtectedDir(undefined, REPO).protected, true);
  assert.equal(isProtectedDir(null, REPO).protected, true);
});

test('isProtectedDir: directory whose name happens to start with "src" but is NOT inside src/ is allowed', () => {
  // Regression guard: substring matches must be at path-segment boundaries.
  // "<repo>/srclike-folder" should NOT be considered "inside src/".
  const r = isProtectedDir(`${REPO}/srclike-folder`, REPO);
  assert.equal(r.protected, false);
});
