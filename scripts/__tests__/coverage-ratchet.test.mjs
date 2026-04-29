// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for scripts/coverage-ratchet.mjs
// ──────────────────────────────────────────────────────────────────────────────
// Run with:   node --test scripts/__tests__/coverage-ratchet.test.mjs
//
// These tests exercise the pure decision helpers exported from the ratchet
// script. No disk I/O, no process.exit, no child processes — importing the
// module is safe because the CLI body is gated behind an `invokedAsMain` check.
// ──────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  METRICS,
  DEFAULT_THRESHOLDS,
  classifyAbsolute,
  resolveThresholdsForPath,
  evaluateThresholds,
  loadThresholds,
} from '../coverage-ratchet.mjs';

// Helper: build a `coverage-summary.total`-shaped object from a flat map.
function asSummaryTotal(pcts) {
  const out = {};
  for (const m of METRICS) {
    out[m] = { pct: pcts[m] };
  }
  return out;
}

// Helper: build a full coverage-summary.json shape with optional per-file entries.
function asSummary(totalPcts, perFile = {}) {
  const summary = { total: asSummaryTotal(totalPcts) };
  for (const [path, pcts] of Object.entries(perFile)) {
    summary[path] = asSummaryTotal(pcts);
  }
  return summary;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

test('METRICS covers the four v8 summary metrics in fixed order', () => {
  assert.deepEqual(METRICS, ['lines', 'branches', 'functions', 'statements']);
});

test('DEFAULT_THRESHOLDS encodes the 70/80/90 tier model uniformly', () => {
  for (const m of METRICS) {
    assert.equal(DEFAULT_THRESHOLDS.floor[m], 70);
    assert.equal(DEFAULT_THRESHOLDS.target[m], 80);
    assert.equal(DEFAULT_THRESHOLDS.goal[m], 90);
  }
});

test('DEFAULT_THRESHOLDS is frozen so callers cannot mutate it', () => {
  assert.ok(Object.isFrozen(DEFAULT_THRESHOLDS));
});

// ──────────────────────────────────────────────────────────────────────────────
// classifyAbsolute
// ──────────────────────────────────────────────────────────────────────────────

test('classifyAbsolute: at goal returns "at-goal"', () => {
  assert.equal(classifyAbsolute(95.5, DEFAULT_THRESHOLDS, 'lines'), 'at-goal');
  assert.equal(classifyAbsolute(90.0, DEFAULT_THRESHOLDS, 'lines'), 'at-goal');
});

test('classifyAbsolute: at target but below goal returns "on-target"', () => {
  assert.equal(classifyAbsolute(80.0, DEFAULT_THRESHOLDS, 'lines'), 'on-target');
  assert.equal(classifyAbsolute(89.99, DEFAULT_THRESHOLDS, 'lines'), 'on-target');
});

test('classifyAbsolute: at floor but below target returns "below-target"', () => {
  assert.equal(classifyAbsolute(70.0, DEFAULT_THRESHOLDS, 'lines'), 'below-target');
  assert.equal(classifyAbsolute(79.99, DEFAULT_THRESHOLDS, 'lines'), 'below-target');
});

test('classifyAbsolute: below floor returns "fail"', () => {
  assert.equal(classifyAbsolute(69.99, DEFAULT_THRESHOLDS, 'lines'), 'fail');
  assert.equal(classifyAbsolute(0, DEFAULT_THRESHOLDS, 'lines'), 'fail');
});

test('classifyAbsolute: missing floor entry treats metric as informational only', () => {
  // Custom thresholds with no floor for branches.
  const t = { floor: {}, target: { branches: 80 }, goal: { branches: 90 } };
  assert.equal(classifyAbsolute(50, t, 'branches'), 'below-target');
  assert.equal(classifyAbsolute(85, t, 'branches'), 'on-target');
  assert.equal(classifyAbsolute(95, t, 'branches'), 'at-goal');
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveThresholdsForPath
// ──────────────────────────────────────────────────────────────────────────────

test('resolveThresholdsForPath: empty perDir returns the default thresholds', () => {
  const cfg = { default: DEFAULT_THRESHOLDS, perDir: [] };
  const t = resolveThresholdsForPath('/repo/src/foo.ts', cfg);
  assert.equal(t, DEFAULT_THRESHOLDS);
});

test('resolveThresholdsForPath: missing perDir is also fine', () => {
  const cfg = { default: DEFAULT_THRESHOLDS };
  const t = resolveThresholdsForPath('/repo/src/foo.ts', cfg);
  assert.equal(t, DEFAULT_THRESHOLDS);
});

test('resolveThresholdsForPath: path match overrides only the floor tier', () => {
  const cfg = {
    default: DEFAULT_THRESHOLDS,
    perDir: [
      { path: 'src/background/search/', floor: { lines: 90, branches: 85, functions: 90, statements: 90 } },
    ],
  };
  const t = resolveThresholdsForPath('/repo/src/background/search/scorer.ts', cfg);
  assert.equal(t.floor.lines, 90);
  assert.equal(t.floor.branches, 85);
  assert.deepEqual(t.target, DEFAULT_THRESHOLDS.target);
  assert.deepEqual(t.goal, DEFAULT_THRESHOLDS.goal);
});

test('resolveThresholdsForPath: longest-prefix wins among multiple matches', () => {
  const cfg = {
    default: DEFAULT_THRESHOLDS,
    perDir: [
      { path: 'src/', floor: { lines: 75, branches: 75, functions: 75, statements: 75 } },
      { path: 'src/background/search/', floor: { lines: 90, branches: 85, functions: 90, statements: 90 } },
    ],
  };
  const t = resolveThresholdsForPath('/repo/src/background/search/scorer.ts', cfg);
  assert.equal(t.floor.lines, 90, 'longer prefix wins');
});

test('resolveThresholdsForPath: no match falls back to default', () => {
  const cfg = {
    default: DEFAULT_THRESHOLDS,
    perDir: [{ path: 'src/popup/', floor: { lines: 50, branches: 50, functions: 50, statements: 50 } }],
  };
  const t = resolveThresholdsForPath('/repo/src/background/foo.ts', cfg);
  assert.equal(t, DEFAULT_THRESHOLDS);
});

test('resolveThresholdsForPath: tolerates Windows-style backslashes', () => {
  const cfg = {
    default: DEFAULT_THRESHOLDS,
    perDir: [{ path: 'src/popup/', floor: { lines: 50, branches: 50, functions: 50, statements: 50 } }],
  };
  const t = resolveThresholdsForPath('C:\\repo\\src\\popup\\popup-utils.ts', cfg);
  assert.equal(t.floor.lines, 50);
});

test('resolveThresholdsForPath: malformed perDir entries are skipped without throwing', () => {
  const cfg = {
    default: DEFAULT_THRESHOLDS,
    perDir: [null, undefined, {}, { path: '' }, { path: 42 }, { path: 'src/popup/' }],
  };
  const t = resolveThresholdsForPath('/repo/src/popup/foo.ts', cfg);
  // The only valid entry has no floor override, so result is default.
  assert.equal(t, DEFAULT_THRESHOLDS);
});

// ──────────────────────────────────────────────────────────────────────────────
// evaluateThresholds — totals
// ──────────────────────────────────────────────────────────────────────────────

test('evaluateThresholds: all totals at goal → exitCode 0, all "at-goal"', () => {
  const summary = asSummary({ lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 });
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS });
  assert.equal(r.exitCode, 0);
  for (const t of r.totals) assert.equal(t.zone, 'at-goal');
});

test('evaluateThresholds: totals between target and goal → exitCode 0, "on-target"', () => {
  const summary = asSummary({ lines: 85, branches: 82, functions: 88, statements: 84 });
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS });
  assert.equal(r.exitCode, 0);
  for (const t of r.totals) assert.equal(t.zone, 'on-target');
});

test('evaluateThresholds: any total below floor → exitCode 1', () => {
  const summary = asSummary({ lines: 69, branches: 90, functions: 90, statements: 90 });
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS });
  assert.equal(r.exitCode, 1);
  assert.equal(r.totals[0].zone, 'fail');
});

test('evaluateThresholds: rows preserve metric order and carry tier numbers', () => {
  const summary = asSummary({ lines: 95, branches: 85, functions: 75, statements: 90 });
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS });
  assert.deepEqual(r.totals.map(x => x.metric), METRICS);
  for (const row of r.totals) {
    assert.equal(row.floor, 70);
    assert.equal(row.target, 80);
    assert.equal(row.goal, 90);
  }
});

test('evaluateThresholds: pct values are rounded to 2 decimal places', () => {
  // 96.314159 should be reported as 96.31, not the raw float.
  const summary = asSummary({ lines: 96.314159, branches: 90.28, functions: 96.00, statements: 95.72 });
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS });
  assert.equal(r.totals[0].pct, 96.31);
});

// ──────────────────────────────────────────────────────────────────────────────
// evaluateThresholds — per-file
// ──────────────────────────────────────────────────────────────────────────────

test('evaluateThresholds: per-file off by default — under-covered files do NOT fail the run', () => {
  const summary = asSummary(
    { lines: 95, branches: 90, functions: 95, statements: 95 },
    { '/repo/src/background/foo.ts': { lines: 0, branches: 0, functions: 0, statements: 0 } },
  );
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS });
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.perFileFailures, []);
});

test('evaluateThresholds: per-file mode fails when any file metric is below floor', () => {
  const summary = asSummary(
    { lines: 95, branches: 90, functions: 95, statements: 95 },
    {
      '/repo/src/background/foo.ts': { lines: 65, branches: 90, functions: 95, statements: 95 },
      '/repo/src/background/bar.ts': { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  );
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS }, { perFile: true });
  assert.equal(r.exitCode, 1);
  assert.equal(r.perFileFailures.length, 1);
  assert.equal(r.perFileFailures[0].file, '/repo/src/background/foo.ts');
  assert.equal(r.perFileFailures[0].metric, 'lines');
  assert.equal(r.perFileFailures[0].pct, 65);
  assert.equal(r.perFileFailures[0].floor, 70);
});

test('evaluateThresholds: per-file mode honours per-directory floor overrides', () => {
  const config = {
    default: DEFAULT_THRESHOLDS,
    perDir: [
      { path: 'src/background/search/', floor: { lines: 90, branches: 90, functions: 90, statements: 90 } },
    ],
  };
  const summary = asSummary(
    { lines: 95, branches: 90, functions: 95, statements: 95 },
    {
      // 80% lines passes the default 70 floor but fails the 90 floor for search/.
      '/repo/src/background/search/scorer.ts': { lines: 80, branches: 95, functions: 95, statements: 95 },
      // 80% lines is fine outside search/.
      '/repo/src/background/other.ts': { lines: 80, branches: 95, functions: 95, statements: 95 },
    },
  );
  const r = evaluateThresholds(summary, config, { perFile: true });
  assert.equal(r.exitCode, 1);
  assert.equal(r.perFileFailures.length, 1);
  assert.match(r.perFileFailures[0].file, /scorer\.ts$/);
});

test('evaluateThresholds: per-file mode tolerates files with missing/malformed pct entries', () => {
  const summary = {
    total: asSummaryTotal({ lines: 95, branches: 90, functions: 95, statements: 95 }),
    '/repo/src/odd.ts': { lines: { /* no pct */ }, branches: { pct: 'bad' }, functions: { pct: 95 }, statements: { pct: 95 } },
  };
  const r = evaluateThresholds(summary, { default: DEFAULT_THRESHOLDS }, { perFile: true });
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.perFileFailures, []);
});

// ──────────────────────────────────────────────────────────────────────────────
// loadThresholds
// ──────────────────────────────────────────────────────────────────────────────

test('loadThresholds: missing file falls back to defaults', () => {
  const r = loadThresholds('/definitely/not/a/real/path/coverage-thresholds.json');
  assert.equal(r.default, DEFAULT_THRESHOLDS);
  assert.deepEqual(r.perDir, []);
});

test('loadThresholds: malformed JSON attaches _warning and uses defaults', async () => {
  // Write a temp bad file
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: pjoin } = await import('node:path');
  const dir = mkdtempSync(pjoin(tmpdir(), 'ratchet-test-'));
  const bad = pjoin(dir, 'coverage-thresholds.json');
  writeFileSync(bad, '{ not valid json', 'utf-8');
  try {
    const r = loadThresholds(bad);
    assert.equal(r.default, DEFAULT_THRESHOLDS);
    assert.match(r._warning, /Failed to parse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadThresholds: valid file is read through verbatim', async () => {
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: pjoin } = await import('node:path');
  const dir = mkdtempSync(pjoin(tmpdir(), 'ratchet-test-'));
  const ok = pjoin(dir, 'coverage-thresholds.json');
  const cfg = {
    default: {
      floor: { lines: 75, branches: 75, functions: 75, statements: 75 },
      target: { lines: 85, branches: 85, functions: 85, statements: 85 },
      goal: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
    perDir: [{ path: 'src/popup/', floor: { lines: 60, branches: 60, functions: 60, statements: 60 } }],
  };
  writeFileSync(ok, JSON.stringify(cfg), 'utf-8');
  try {
    const r = loadThresholds(ok);
    assert.equal(r.default.floor.lines, 75);
    assert.equal(r.perDir.length, 1);
    assert.equal(r.perDir[0].path, 'src/popup/');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
