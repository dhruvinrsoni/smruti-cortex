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
  SOFT_THRESHOLD_PCT,
  METRICS,
  classifyMetric,
  evaluate,
  parseSoftThresholdArg,
} from '../coverage-ratchet.mjs';

// Helper: build a `coverage-summary.total`-shaped object from a flat map.
function asSummary(pcts) {
  const out = {};
  for (const m of METRICS) {
    out[m] = { pct: pcts[m] };
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

test('SOFT_THRESHOLD_PCT default is 1.00 (one percentage point)', () => {
  assert.equal(SOFT_THRESHOLD_PCT, 1.00);
});

test('METRICS covers the four v8 summary metrics in fixed order', () => {
  assert.deepEqual(METRICS, ['lines', 'branches', 'functions', 'statements']);
});

// ──────────────────────────────────────────────────────────────────────────────
// classifyMetric
// ──────────────────────────────────────────────────────────────────────────────

test('classifyMetric: equal → green with diff 0', () => {
  const r = classifyMetric(90.00, 90.00);
  assert.equal(r.zone, 'green');
  assert.equal(r.diff, 0);
});

test('classifyMetric: improvement → green with positive diff', () => {
  const r = classifyMetric(92.50, 90.00);
  assert.equal(r.zone, 'green');
  assert.equal(r.diff, 2.50);
});

test('classifyMetric: tiny drop (0.02%) → soft with default 1% threshold', () => {
  const r = classifyMetric(96.29, 96.31);
  assert.equal(r.zone, 'soft');
  assert.equal(r.diff, -0.02);
});

test('classifyMetric: drop near but below 1% → soft', () => {
  const r = classifyMetric(95.32, 96.31);
  assert.equal(r.zone, 'soft');
  assert.equal(r.diff, -0.99);
});

test('classifyMetric: drop exactly 1% → hard (threshold is inclusive fail)', () => {
  const r = classifyMetric(95.31, 96.31);
  assert.equal(r.zone, 'hard');
  assert.equal(r.diff, -1.00);
});

test('classifyMetric: large drop (> 1%) → hard', () => {
  const r = classifyMetric(90.00, 96.31);
  assert.equal(r.zone, 'hard');
  assert.equal(r.diff, -6.31);
});

test('classifyMetric: strict=true forces ANY negative delta into hard', () => {
  const r = classifyMetric(96.30, 96.31, { strict: true });
  assert.equal(r.zone, 'hard');
  assert.equal(r.diff, -0.01);
});

test('classifyMetric: strict=true leaves non-negative deltas green', () => {
  assert.equal(classifyMetric(96.31, 96.31, { strict: true }).zone, 'green');
  assert.equal(classifyMetric(97.00, 96.31, { strict: true }).zone, 'green');
});

test('classifyMetric: softThreshold=0.5 narrows the soft zone', () => {
  // -0.6% would be soft at default (1.00) but hard at 0.5.
  const r = classifyMetric(95.71, 96.31, { softThreshold: 0.5 });
  assert.equal(r.zone, 'hard');
  assert.equal(r.diff, -0.60);
});

test('classifyMetric: softThreshold=2.0 widens the soft zone', () => {
  // -1.50% would be hard at default (1.00) but soft at 2.0.
  const r = classifyMetric(94.81, 96.31, { softThreshold: 2.0 });
  assert.equal(r.zone, 'soft');
  assert.equal(r.diff, -1.50);
});

test('classifyMetric: IEEE-754 drift is rounded out of the diff', () => {
  // 96.31 - 96.21 should be exactly 0.10, not 0.09999999999999432.
  const r = classifyMetric(96.21, 96.31);
  assert.equal(r.diff, -0.10);
});

// ──────────────────────────────────────────────────────────────────────────────
// evaluate — aggregate over all four metrics
// ──────────────────────────────────────────────────────────────────────────────

test('evaluate: all metrics equal/improved → exitCode 0, all green', () => {
  const baseline = { lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 };
  const current = asSummary({ lines: 96.50, branches: 90.28, functions: 96.10, statements: 95.72 });
  const r = evaluate(current, baseline);
  assert.equal(r.exitCode, 0);
  assert.equal(r.greenCount, 4);
  assert.equal(r.softCount, 0);
  assert.equal(r.hardCount, 0);
});

test('evaluate: today-like sub-1% drift → exitCode 0 with soft advisory', () => {
  // Real numbers from the failing verify run.
  const baseline = { lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 };
  const current = asSummary({ lines: 96.29, branches: 90.10, functions: 95.92, statements: 95.62 });
  const r = evaluate(current, baseline);
  assert.equal(r.exitCode, 0, 'sub-1% drift must not block the pipeline');
  assert.equal(r.greenCount, 0);
  assert.equal(r.softCount, 4);
  assert.equal(r.hardCount, 0);
});

test('evaluate: mix of green + soft → exitCode 0', () => {
  const baseline = { lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 };
  const current = asSummary({ lines: 96.31, branches: 90.00, functions: 96.00, statements: 95.72 });
  const r = evaluate(current, baseline);
  assert.equal(r.exitCode, 0);
  assert.equal(r.greenCount, 3);
  assert.equal(r.softCount, 1);
  assert.equal(r.hardCount, 0);
});

test('evaluate: any hard → exitCode 1', () => {
  const baseline = { lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 };
  const current = asSummary({ lines: 94.00, branches: 90.28, functions: 96.00, statements: 95.72 });
  const r = evaluate(current, baseline);
  assert.equal(r.exitCode, 1);
  assert.equal(r.hardCount, 1);
});

test('evaluate: strict=true promotes every negative delta to hard', () => {
  const baseline = { lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 };
  const current = asSummary({ lines: 96.29, branches: 90.10, functions: 95.92, statements: 95.62 });
  const r = evaluate(current, baseline, { strict: true });
  assert.equal(r.exitCode, 1);
  assert.equal(r.hardCount, 4);
  assert.equal(r.softCount, 0);
});

test('evaluate: softThreshold=0.5 reclassifies 0.6% drops as hard', () => {
  const baseline = { lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 };
  // branches drops 0.60% — soft at default, hard at 0.5 threshold.
  const current = asSummary({ lines: 96.31, branches: 89.68, functions: 96.00, statements: 95.72 });
  const relaxed = evaluate(current, baseline);
  assert.equal(relaxed.exitCode, 0);
  assert.equal(relaxed.softCount, 1);
  const tight = evaluate(current, baseline, { softThreshold: 0.5 });
  assert.equal(tight.exitCode, 1);
  assert.equal(tight.hardCount, 1);
});

test('evaluate: rows preserve metric order and carry per-metric detail', () => {
  const baseline = { lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 };
  const current = asSummary({ lines: 96.31, branches: 90.28, functions: 96.00, statements: 95.72 });
  const r = evaluate(current, baseline);
  assert.deepEqual(r.rows.map(x => x.metric), METRICS);
  for (const row of r.rows) {
    assert.equal(row.zone, 'green');
    assert.equal(row.diff, 0);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// parseSoftThresholdArg
// ──────────────────────────────────────────────────────────────────────────────

test('parseSoftThresholdArg: extracts float from --soft-threshold=0.5', () => {
  assert.equal(parseSoftThresholdArg(['--soft-threshold=0.5']), 0.5);
});

test('parseSoftThresholdArg: extracts integer-like 2 as 2.0', () => {
  assert.equal(parseSoftThresholdArg(['--soft-threshold=2']), 2);
});

test('parseSoftThresholdArg: missing flag → fallback (default 1.00)', () => {
  assert.equal(parseSoftThresholdArg([]), SOFT_THRESHOLD_PCT);
  assert.equal(parseSoftThresholdArg(['--strict']), SOFT_THRESHOLD_PCT);
});

test('parseSoftThresholdArg: explicit fallback is honored', () => {
  assert.equal(parseSoftThresholdArg([], 0.25), 0.25);
});

test('parseSoftThresholdArg: invalid value falls back silently', () => {
  assert.equal(parseSoftThresholdArg(['--soft-threshold=abc']), SOFT_THRESHOLD_PCT);
  assert.equal(parseSoftThresholdArg(['--soft-threshold=']), SOFT_THRESHOLD_PCT);
});

test('parseSoftThresholdArg: negative value rejected → fallback', () => {
  assert.equal(parseSoftThresholdArg(['--soft-threshold=-1']), SOFT_THRESHOLD_PCT);
});

test('parseSoftThresholdArg: coexists with other flags in argv', () => {
  assert.equal(parseSoftThresholdArg(['--strict', '--soft-threshold=0.25', '--update']), 0.25);
});
