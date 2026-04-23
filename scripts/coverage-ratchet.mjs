#!/usr/bin/env node

/**
 * coverage-ratchet.mjs — Graduated coverage drift policy.
 *
 * Compares the current coverage report against a checked-in baseline and
 * classifies each metric (lines, branches, functions, statements) into one
 * of three zones based on delta = current - baseline:
 *
 *   delta >= 0                        → GREEN    (PASS, exit 0)
 *   -SOFT_THRESHOLD_PCT < delta < 0   → SOFT     (ADVISORY warning, exit 0)
 *   delta <= -SOFT_THRESHOLD_PCT      → HARD     (FAIL, exit 1)
 *
 * Rationale: tiny per-release drift (e.g. -0.10%) is noise and should never
 * block `npm run verify` or the release pipeline (preflight chains through
 * verify). A drop of ≥ 1.00%, however, almost always means a test file got
 * deleted or a large module became uncovered — that still fails loud.
 *
 * Flags:
 *   --strict                  Zero-tolerance: ANY negative delta is HARD.
 *                             Use this in CI jobs that must never regress.
 *   --soft-threshold=<float>  Override SOFT_THRESHOLD_PCT (default 1.00).
 *   --update                  Write current coverage as the new baseline.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs                       # graduated (default)
 *   node scripts/coverage-ratchet.mjs --strict              # zero-tolerance
 *   node scripts/coverage-ratchet.mjs --soft-threshold=0.5  # tighter soft zone
 *   node scripts/coverage-ratchet.mjs --update              # tighten baseline
 *
 * Pure helpers (classifyMetric, evaluate, parseSoftThresholdArg) are exported
 * so that unit tests in scripts/__tests__/coverage-ratchet.test.mjs can
 * exercise the decision logic without touching disk or process.exit.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Default soft-zone width in percentage points. A drop < this is advisory. */
export const SOFT_THRESHOLD_PCT = 1.00;

const BASELINE_PATH = join(root, 'coverage-baseline.json');
const SUMMARY_PATH = join(root, 'coverage', 'coverage-summary.json');
export const METRICS = ['lines', 'branches', 'functions', 'statements'];

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

/**
 * Classify a single metric's delta into a green / soft / hard zone.
 *
 * @param {number} cur     Current percentage (rounded to 2 dp by caller).
 * @param {number} base    Baseline percentage.
 * @param {{ strict?: boolean, softThreshold?: number }} [opts]
 * @returns {{ zone: 'green'|'soft'|'hard', diff: number }}
 *
 * Notes:
 * - `diff` is rounded to 2 dp to avoid IEEE-754 noise like -0.09999999.
 * - In strict mode, ANY negative delta is hard (no soft zone).
 * - At the boundary (|diff| === softThreshold), the drop counts as HARD —
 *   we treat the threshold as "inclusive fail" so that `softThreshold=1.00`
 *   means "1.00% or more is a hard fail".
 */
export function classifyMetric(cur, base, { strict = false, softThreshold = SOFT_THRESHOLD_PCT } = {}) {
  const diff = +(cur - base).toFixed(2);
  if (diff >= 0) return { zone: 'green', diff };
  if (strict) return { zone: 'hard', diff };
  if (Math.abs(diff) >= softThreshold) return { zone: 'hard', diff };
  return { zone: 'soft', diff };
}

/**
 * Evaluate all four metrics against baseline and derive overall exit code.
 *
 * @param {Record<string, { pct: number }>} currentTotal  `coverage-summary.json`.total
 * @param {Record<string, number>} baseline               `coverage-baseline.json`
 * @param {{ strict?: boolean, softThreshold?: number }} [opts]
 * @returns {{
 *   rows: Array<{ metric: string, base: number, cur: number, diff: number, zone: 'green'|'soft'|'hard' }>,
 *   exitCode: 0 | 1,
 *   greenCount: number,
 *   softCount: number,
 *   hardCount: number,
 * }}
 */
export function evaluate(currentTotal, baseline, opts = {}) {
  const rows = [];
  let greenCount = 0;
  let softCount = 0;
  let hardCount = 0;
  for (const m of METRICS) {
    const base = baseline[m];
    const cur = parseFloat(currentTotal[m].pct.toFixed(2));
    const { zone, diff } = classifyMetric(cur, base, opts);
    if (zone === 'green') greenCount++;
    else if (zone === 'soft') softCount++;
    else hardCount++;
    rows.push({ metric: m, base, cur, diff, zone });
  }
  return {
    rows,
    exitCode: hardCount > 0 ? 1 : 0,
    greenCount,
    softCount,
    hardCount,
  };
}

/**
 * Parse `--soft-threshold=<float>` from argv; return fallback if absent/invalid.
 *
 * @param {string[]} argv
 * @param {number} [fallback]
 * @returns {number}
 */
export function parseSoftThresholdArg(argv, fallback = SOFT_THRESHOLD_PCT) {
  const prefix = '--soft-threshold=';
  for (const a of argv) {
    if (a.startsWith(prefix)) {
      const parsed = parseFloat(a.slice(prefix.length));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return fallback;
}

// ──────────────────────────────────────────────────────────────────────────
// CLI — only runs when invoked directly (not when imported by tests).
// ──────────────────────────────────────────────────────────────────────────

function loadJSON(path, label) {
  if (!existsSync(path)) {
    console.error(`${RED}${BOLD}ERROR:${RESET} ${label} not found at ${path}`);
    console.error('Run "npm run coverage" first to generate the report.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  const argv = process.argv.slice(2);
  const update = argv.includes('--update');
  const strict = argv.includes('--strict');
  const softThreshold = parseSoftThresholdArg(argv);

  if (update) {
    const summary = loadJSON(SUMMARY_PATH, 'Coverage summary');
    const total = summary.total;
    const baseline = {};
    for (const m of METRICS) {
      baseline[m] = parseFloat(total[m].pct.toFixed(2));
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`${GREEN}${BOLD}Ratchet updated:${RESET}`);
    for (const m of METRICS) {
      console.log(`  ${m.padEnd(12)} ${baseline[m]}%`);
    }
    process.exit(0);
  }

  const baseline = loadJSON(BASELINE_PATH, 'Coverage baseline');
  const summary = loadJSON(SUMMARY_PATH, 'Coverage summary');
  const { rows, softCount, hardCount } = evaluate(summary.total, baseline, { strict, softThreshold });

  const modeLabel = strict
    ? `strict (zero-tolerance)`
    : `graduated (soft zone: |drop| < ${softThreshold.toFixed(2)}%)`;

  console.log(`\n${BOLD}Coverage Ratchet Check${RESET} — ${modeLabel}`);
  console.log('─'.repeat(56));
  console.log(`  ${'Metric'.padEnd(12)} ${'Baseline'.padStart(10)} ${'Current'.padStart(10)}  Result`);
  console.log('─'.repeat(56));

  for (const r of rows) {
    const sign = r.diff >= 0 ? '+' : '';
    const deltaStr = `${sign}${r.diff.toFixed(2)}%`;
    let label;
    if (r.zone === 'green') {
      label = `${GREEN}PASS (${deltaStr})${RESET}`;
    } else if (r.zone === 'soft') {
      label = `${YELLOW}ADVISORY (${deltaStr})${RESET}`;
    } else {
      label = `${RED}FAIL (${deltaStr})${RESET}`;
    }
    console.log(`  ${r.metric.padEnd(12)} ${(r.base + '%').padStart(10)} ${(r.cur + '%').padStart(10)}  ${label}`);
  }

  console.log('─'.repeat(56));

  if (hardCount > 0) {
    const reason = strict
      ? `(strict mode — any decrease fails)`
      : `(drop of ≥ ${softThreshold.toFixed(2)}%)`;
    console.log(`\n${RED}${BOLD}RATCHET FAILED${RESET} — ${hardCount} metric(s) in hard zone ${reason}.`);
    console.log('Write more tests or revert the change that lowered coverage.\n');
    process.exit(1);
  } else if (softCount > 0) {
    console.log(`\n${YELLOW}${BOLD}RATCHET OK${RESET} ${YELLOW}(advisory: ${softCount} metric(s) down but within ±${softThreshold.toFixed(2)}%)${RESET}`);
    console.log(`${YELLOW}Drift is non-blocking. Pass --strict for zero-tolerance enforcement.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${GREEN}${BOLD}RATCHET OK${RESET}`);
    const improved = rows.some(r => r.diff > 0);
    if (improved) {
      console.log(`${YELLOW}Tip: run "node scripts/coverage-ratchet.mjs --update" to tighten the baseline.${RESET}`);
    }
    console.log();
    process.exit(0);
  }
}
