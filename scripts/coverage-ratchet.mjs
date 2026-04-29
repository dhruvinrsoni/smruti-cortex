#!/usr/bin/env node

/**
 * coverage-ratchet.mjs — Absolute tiered coverage floors.
 *
 * Compares the current coverage report against absolute thresholds organised
 * into three tiers per the user's mental model:
 *
 *   floor  (default 70)  — FAIL below this. Catches cliff drops, not noise.
 *   target (default 80)  — informational; "industry standard" tier.
 *   goal   (default 90)  — informational; "best practice" tier.
 *
 * Coverage will naturally drift down over time as code grows faster than
 * tests; the goal here is NOT to block on every per-release dip, but to
 * shout when a metric crosses below the floor (something deleted? a large
 * module went uncovered?).
 *
 * Defaults are baked in. `coverage-thresholds.json` at the repo root may
 * override them and add per-directory floor overrides:
 *
 *   {
 *     "default": {
 *       "floor":  { "lines": 70, "branches": 70, "functions": 70, "statements": 70 },
 *       "target": { "lines": 80, ... },
 *       "goal":   { "lines": 90, ... }
 *     },
 *     "perDir": [
 *       { "path": "src/background/search/",
 *         "floor": { "lines": 90, "branches": 85, "functions": 90, "statements": 90 } }
 *     ]
 *   }
 *
 * Per-directory floors only override the `floor` tier (target/goal stay at
 * the default values) to keep the config small.
 *
 * Flags:
 *   --per-file  Also classify every file in coverage-summary.json (default: totals only).
 *   --json      Emit NDJSON events to stdout; pretty output goes to stderr.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs                # totals-only, pretty
 *   node scripts/coverage-ratchet.mjs --per-file     # also check every file
 *   node scripts/coverage-ratchet.mjs --json         # NDJSON for CI
 *
 * Pure helpers (classifyAbsolute, resolveThresholdsForPath, evaluateThresholds,
 * loadThresholds) are exported so unit tests in
 * scripts/__tests__/coverage-ratchet.test.mjs can exercise the decision logic
 * without touching disk or process.exit.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const THRESHOLDS_PATH = join(root, 'coverage-thresholds.json');
const SUMMARY_PATH = join(root, 'coverage', 'coverage-summary.json');

export const METRICS = ['lines', 'branches', 'functions', 'statements'];

/** Baked-in defaults: 70 / 80 / 90 (market / industry / best practice). */
export const DEFAULT_THRESHOLDS = Object.freeze({
  floor:  { lines: 70, branches: 70, functions: 70, statements: 70 },
  target: { lines: 80, branches: 80, functions: 80, statements: 80 },
  goal:   { lines: 90, branches: 90, functions: 90, statements: 90 },
});

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Classify a single metric pct against the resolved thresholds.
 * Returns one of:
 *   'fail'         — pct < floor (only zone that fails the build)
 *   'below-target' — floor <= pct < target
 *   'on-target'    — target <= pct < goal
 *   'at-goal'      — pct >= goal
 *
 * @param {number} pct        Coverage percentage (0-100, rounded by caller).
 * @param {{ floor: object, target: object, goal: object }} thresholds
 * @param {'lines'|'branches'|'functions'|'statements'} metric
 */
export function classifyAbsolute(pct, thresholds, metric) {
  const floor = thresholds?.floor?.[metric];
  const target = thresholds?.target?.[metric];
  const goal = thresholds?.goal?.[metric];
  if (typeof floor === 'number' && pct < floor) return 'fail';
  if (typeof goal === 'number' && pct >= goal) return 'at-goal';
  if (typeof target === 'number' && pct >= target) return 'on-target';
  return 'below-target';
}

/**
 * Resolve thresholds for a given file path by longest-prefix match against
 * config.perDir. Only `floor` is overridden; target/goal stay default.
 *
 * @param {string} filePath  Absolute or relative path from coverage-summary.
 * @param {{ default?: object, perDir?: Array<{ path: string, floor: object }> }} config
 */
export function resolveThresholdsForPath(filePath, config) {
  const base = config?.default || DEFAULT_THRESHOLDS;
  const perDir = Array.isArray(config?.perDir) ? config.perDir : [];
  if (perDir.length === 0) return base;
  const normalized = String(filePath).replace(/\\/g, '/');
  let bestMatch = null;
  for (const entry of perDir) {
    if (!entry || typeof entry.path !== 'string' || !entry.path) continue;
    if (normalized.includes(entry.path)) {
      if (!bestMatch || entry.path.length > bestMatch.path.length) {
        bestMatch = entry;
      }
    }
  }
  if (!bestMatch || !bestMatch.floor) return base;
  return {
    floor: { ...base.floor, ...bestMatch.floor },
    target: base.target,
    goal: base.goal,
  };
}

/**
 * Evaluate totals + (optionally) per-file against the config.
 *
 * @param {object} summary    `coverage-summary.json` parsed
 * @param {object} config     loaded thresholds config
 * @param {{ perFile?: boolean }} [opts]
 * @returns {{
 *   totals: Array<{ metric, pct, zone, floor, target, goal }>,
 *   perFileFailures: Array<{ file, metric, pct, floor }>,
 *   exitCode: 0 | 1,
 * }}
 */
export function evaluateThresholds(summary, config, { perFile = false } = {}) {
  const baseThresholds = config?.default || DEFAULT_THRESHOLDS;
  const totals = [];
  let exitCode = 0;
  for (const m of METRICS) {
    const pct = parseFloat(summary.total[m].pct.toFixed(2));
    const zone = classifyAbsolute(pct, baseThresholds, m);
    if (zone === 'fail') exitCode = 1;
    totals.push({
      metric: m,
      pct,
      zone,
      floor: baseThresholds.floor?.[m],
      target: baseThresholds.target?.[m],
      goal: baseThresholds.goal?.[m],
    });
  }
  const perFileFailures = [];
  if (perFile) {
    for (const [filePath, fileSummary] of Object.entries(summary)) {
      if (filePath === 'total') continue;
      if (!fileSummary || typeof fileSummary !== 'object') continue;
      const thresholds = resolveThresholdsForPath(filePath, config);
      for (const m of METRICS) {
        const raw = fileSummary[m]?.pct;
        if (typeof raw !== 'number') continue;
        const pct = parseFloat(raw.toFixed(2));
        const zone = classifyAbsolute(pct, thresholds, m);
        if (zone === 'fail') {
          exitCode = 1;
          perFileFailures.push({
            file: filePath,
            metric: m,
            pct,
            floor: thresholds.floor?.[m],
          });
        }
      }
    }
  }
  return { totals, perFileFailures, exitCode };
}

/**
 * Load the thresholds config from disk; fall back to defaults if absent
 * or unreadable. A parse error attaches a `_warning` for the CLI to print.
 */
export function loadThresholds(thresholdsPath = THRESHOLDS_PATH) {
  if (!existsSync(thresholdsPath)) {
    return { default: DEFAULT_THRESHOLDS, perDir: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(thresholdsPath, 'utf-8'));
    return {
      default: parsed.default || DEFAULT_THRESHOLDS,
      perDir: Array.isArray(parsed.perDir) ? parsed.perDir : [],
    };
  } catch (err) {
    return {
      default: DEFAULT_THRESHOLDS,
      perDir: [],
      _warning: `Failed to parse ${thresholdsPath}: ${err.message}; using built-in defaults.`,
    };
  }
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

function zoneLabel(zone) {
  switch (zone) {
    case 'fail':         return `${RED}FAIL${RESET}`;
    case 'below-target': return `${YELLOW}BELOW TARGET${RESET}`;
    case 'on-target':    return `${CYAN}ON TARGET${RESET}`;
    case 'at-goal':      return `${GREEN}AT GOAL${RESET}`;
    default:             return zone;
  }
}

const invokedAsMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const perFile = argv.includes('--per-file');
  const help = argv.includes('--help') || argv.includes('-h');

  if (help) {
    console.log(`Usage: node scripts/coverage-ratchet.mjs [--per-file] [--json]

Checks coverage-summary.json against absolute tiered floors (70/80/90 by
default). Override via coverage-thresholds.json at the repo root.

Flags:
  --per-file   Also classify each file (default: totals only).
  --json       Emit NDJSON events to stdout (pretty output -> stderr).
  -h, --help   Show this help.`);
    process.exit(0);
  }

  // In --json mode, route pretty output to stderr so stdout is parseable NDJSON.
  const log = jsonMode ? (...args) => console.error(...args) : (...args) => console.log(...args);
  const emit = (event) => {
    if (jsonMode) process.stdout.write(JSON.stringify(event) + '\n');
  };

  const config = loadThresholds();
  if (config._warning) log(`${YELLOW}[warn] ${config._warning}${RESET}`);

  const summary = loadJSON(SUMMARY_PATH, 'Coverage summary');
  const { totals, perFileFailures, exitCode } = evaluateThresholds(summary, config, { perFile });

  log(`\n${BOLD}Coverage Ratchet${RESET} — absolute floors (${perFile ? 'totals + per-file' : 'totals only'})`);
  log('─'.repeat(64));
  log(`  ${'Metric'.padEnd(11)} ${'Current'.padStart(8)}  ${'Floor'.padStart(6)} ${'Target'.padStart(6)} ${'Goal'.padStart(6)}  Result`);
  log('─'.repeat(64));
  for (const r of totals) {
    log(`  ${r.metric.padEnd(11)} ${(r.pct + '%').padStart(8)}  ${String(r.floor).padStart(6)} ${String(r.target).padStart(6)} ${String(r.goal).padStart(6)}  ${zoneLabel(r.zone)}`);
    emit({ event: 'metric.checked', scope: 'total', metric: r.metric, pct: r.pct, floor: r.floor, target: r.target, goal: r.goal, zone: r.zone });
  }
  log('─'.repeat(64));

  if (perFile) {
    if (perFileFailures.length > 0) {
      log(`\n${RED}${BOLD}Per-file failures (${perFileFailures.length})${RESET}`);
      for (const f of perFileFailures) {
        log(`  ${RED}FAIL${RESET}  ${f.file}  ${f.metric}=${f.pct}% (floor ${f.floor}%)`);
        emit({ event: 'metric.checked', scope: 'file', file: f.file, metric: f.metric, pct: f.pct, floor: f.floor, zone: 'fail' });
      }
    } else {
      log(`${DIM}  All files at or above their floor.${RESET}`);
    }
  }

  emit({
    event: 'summary',
    exitCode,
    totals: totals.map(t => ({ metric: t.metric, pct: t.pct, zone: t.zone })),
    perFileFailures: perFileFailures.length,
    perFile,
  });

  if (exitCode !== 0) {
    log(`\n${RED}${BOLD}RATCHET FAILED${RESET} — at least one metric below floor.`);
    log('Add tests for the regressed area, or adjust coverage-thresholds.json with justification.\n');
    process.exit(1);
  }

  const allAtGoal = totals.every(t => t.zone === 'at-goal');
  const anyBelowTarget = totals.some(t => t.zone === 'below-target');
  if (allAtGoal) {
    log(`\n${GREEN}${BOLD}RATCHET OK${RESET} — all metrics at or above goal (${totals[0].goal}%+).\n`);
  } else if (anyBelowTarget) {
    log(`\n${YELLOW}${BOLD}RATCHET OK${RESET} ${YELLOW}(below target on at least one metric — informational only)${RESET}\n`);
  } else {
    log(`\n${GREEN}${BOLD}RATCHET OK${RESET}\n`);
  }
  process.exit(0);
}
