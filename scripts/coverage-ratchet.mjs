#!/usr/bin/env node

/**
 * coverage-ratchet.mjs — One-way coverage enforcement.
 *
 * Compares the current coverage report against a checked-in baseline.
 * Exits 1 if any metric (lines, branches, functions, statements) has dropped.
 * Pass --update to write the current coverage as the new baseline.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs            # check (CI / pre-commit)
 *   node scripts/coverage-ratchet.mjs --update   # tighten the ratchet
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const BASELINE_PATH = join(root, 'coverage-baseline.json');
const SUMMARY_PATH = join(root, 'coverage', 'coverage-summary.json');
const METRICS = ['lines', 'branches', 'functions', 'statements'];

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function loadJSON(path, label) {
  if (!existsSync(path)) {
    console.error(`${RED}${BOLD}ERROR:${RESET} ${label} not found at ${path}`);
    console.error('Run "npm run coverage" first to generate the report.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const update = process.argv.includes('--update');

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
const current = summary.total;

let failed = false;
console.log(`\n${BOLD}Coverage Ratchet Check${RESET}`);
console.log('─'.repeat(44));
console.log(`  ${'Metric'.padEnd(12)} ${'Baseline'.padStart(10)} ${'Current'.padStart(10)}  Result`);
console.log('─'.repeat(44));

for (const m of METRICS) {
  const base = baseline[m];
  const cur = parseFloat(current[m].pct.toFixed(2));
  const diff = cur - base;
  const sign = diff >= 0 ? '+' : '';

  if (cur < base) {
    console.log(`  ${m.padEnd(12)} ${(base + '%').padStart(10)} ${(cur + '%').padStart(10)}  ${RED}FAIL (${sign}${diff.toFixed(2)}%)${RESET}`);
    failed = true;
  } else if (cur > base) {
    console.log(`  ${m.padEnd(12)} ${(base + '%').padStart(10)} ${(cur + '%').padStart(10)}  ${GREEN}PASS (${sign}${diff.toFixed(2)}%)${RESET}`);
  } else {
    console.log(`  ${m.padEnd(12)} ${(base + '%').padStart(10)} ${(cur + '%').padStart(10)}  PASS (=)`);
  }
}

console.log('─'.repeat(44));

if (failed) {
  console.log(`\n${RED}${BOLD}RATCHET FAILED${RESET} — coverage must not decrease.`);
  console.log('Write more tests or revert the change that lowered coverage.\n');
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}RATCHET OK${RESET}`);
  const improved = METRICS.some(m => parseFloat(current[m].pct.toFixed(2)) > baseline[m]);
  if (improved) {
    console.log(`${YELLOW}Tip: run "node scripts/coverage-ratchet.mjs --update" to tighten the baseline.${RESET}`);
  }
  console.log();
}
