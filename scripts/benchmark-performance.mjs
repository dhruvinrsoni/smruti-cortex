#!/usr/bin/env node
/**
 * benchmark-performance.mjs — Bundle size analysis and threshold enforcement.
 *
 * Reads dist/ bundle sizes, verifies required build outputs exist, and
 * compares sizes against TWO sets of limits:
 *   • A hard ceiling (per-bundle, defined in `thresholds` below) — exceeding
 *     this fails the gate.
 *   • A soft baseline (scripts/baselines/bundle-sizes.json) — current size
 *     >10% above baseline emits a WARN. Lets us catch silent bundle bloat
 *     long before it brushes the ceiling.
 *
 * Called automatically by verify.mjs --release (Bundle Size Benchmark gate).
 * Can also be run standalone after a production build.
 *
 * Usage:
 *   node scripts/benchmark-performance.mjs                   # run checks
 *   node scripts/benchmark-performance.mjs --update-baseline # write current
 *                                                            # sizes as new baseline
 *   node scripts/benchmark-performance.mjs -h                # show this help
 *
 * In CI (when $CI is set), writes performance-results.json for archiving.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(`
benchmark-performance.mjs — Bundle size analysis and threshold enforcement.

Usage:
  node scripts/benchmark-performance.mjs                    # run checks
  node scripts/benchmark-performance.mjs --update-baseline  # tighten baseline

What it does:
  1. Reads dist/ bundle sizes for key JS outputs
  2. Verifies all required build artifacts exist in dist/
  3. Compares sizes against the soft baseline (>10% drift -> WARN)
  4. Compares sizes against hard ceilings (over -> FAIL)
  5. Writes performance-results.json when \$CI is set

Prerequisite:
  dist/ must exist — run \`npm run build\` first.

Baseline file: scripts/baselines/bundle-sizes.json (committed; tighten by
running --update-baseline after intentional shrinks).
`.trim());
  process.exit(0);
}

const updateBaseline = process.argv.includes('--update-baseline');
const BASELINE_PATH = resolve(process.cwd(), 'scripts/baselines/bundle-sizes.json');
// 10% drift triggers a warning. Picked to match the coverage ratchet's soft
// drift policy — lets routine size noise (a few KB per release) through but
// catches a 30+ KB regression on a 200 KB bundle before it gets normalized.
const SOFT_DRIFT_PCT = 10;

const results = {
  bundleSizes: {},
  timing: {},
  status: 'pass'
};

console.log('\n  Bundle Size Benchmark\n');

// 1. Bundle Size Analysis
console.log('  1. Analyzing bundle sizes...');
const distFiles = [
  'background/service-worker.js',
  'content_scripts/quick-search.js',
  'content_scripts/extractor.js',
  'popup/popup.js'
];

for (const file of distFiles) {
  try {
    const filePath = resolve(process.cwd(), 'dist', file);
    const content = readFileSync(filePath);
    const sizeKB = (content.length / 1024).toFixed(2);
    results.bundleSizes[file] = sizeKB;
    console.log(`     ${file}: ${sizeKB} KB`);
  } catch {
    console.warn(`     [!] ${file}: Not found`);
  }
}

// 2. Dist integrity check
console.log('\n  2. Verifying dist output integrity...');
const requiredDistFiles = [
  'dist/manifest.json',
  'dist/background/service-worker.js',
  'dist/content_scripts/extractor.js',
  'dist/content_scripts/quick-search.js',
  'dist/popup/popup.js',
  'dist/popup/popup.html',
  'dist/popup/popup.css',
];

let allPresent = true;
for (const file of requiredDistFiles) {
  const exists = existsSync(resolve(process.cwd(), file));
  const icon = exists ? '[ok]' : '[MISSING]';
  console.log(`     ${icon} ${file}`);
  if (!exists) {
    allPresent = false;
    results.status = 'warn';
  }
}
results.timing['distIntegrity'] = allPresent ? 'pass' : 'fail';

// --update-baseline: snapshot the current sizes and exit. Always run this
// after an intentional bundle change (deps swapped, dead code removed,
// chunking tweaked) so the soft ratchet doesn't keep warning forever.
if (updateBaseline) {
  const baseline = {};
  for (const [file, sizeKB] of Object.entries(results.bundleSizes)) {
    baseline[file] = parseFloat(sizeKB);
  }
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\n  Updated bundle-size baseline at ${BASELINE_PATH}`);
  for (const [file, sizeKB] of Object.entries(baseline)) {
    console.log(`     ${file.padEnd(40)} ${sizeKB} KB`);
  }
  process.exit(0);
}

// 3. Hard ceiling checks
// Ceilings set at ~150% of current actual sizes (v9.0.0: 194, 1.8, 162, 162 KB).
// Tighten when sizes stabilize; loosen only with explicit justification.
console.log('\n  3. Checking hard ceilings...');
const thresholds = {
  'background/service-worker.js': 300,
  'content_scripts/extractor.js': 5,
  'content_scripts/quick-search.js': 250,
  'popup/popup.js': 250,
};

for (const [file, maxSize] of Object.entries(thresholds)) {
  const actualSize = parseFloat(results.bundleSizes[file] || '999');
  const status = actualSize <= maxSize ? '[ok]' : '[OVER]';
  console.log(`     ${status} ${file}: ${actualSize} KB / ${maxSize} KB`);

  if (actualSize > maxSize) {
    results.status = 'warn';
    console.warn(`     [!] Bundle size exceeds hard ceiling!`);
  }
}

// 4. Soft ratchet vs baseline
// Loud WARN when current size > baseline * (1 + SOFT_DRIFT_PCT/100). Drift
// signals creeping bloat that hasn't yet hit the ceiling — exactly the kind
// of thing that's easy to address now and nightmarish to undo three releases
// later.
console.log('\n  4. Checking soft baseline (drift > ' + SOFT_DRIFT_PCT + '%)...');
if (!existsSync(BASELINE_PATH)) {
  console.log(`     [info] No baseline yet at ${BASELINE_PATH}`);
  console.log(`     [info] Snapshot current sizes with: node scripts/benchmark-performance.mjs --update-baseline`);
} else {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  results.baselineDelta = {};
  for (const [file, baseSize] of Object.entries(baseline)) {
    const actual = parseFloat(results.bundleSizes[file] || '0');
    if (actual === 0) continue;
    const driftPct = ((actual - baseSize) / baseSize) * 100;
    results.baselineDelta[file] = driftPct.toFixed(1);
    const sign = driftPct >= 0 ? '+' : '';
    if (driftPct > SOFT_DRIFT_PCT) {
      results.status = results.status === 'pass' ? 'warn' : results.status;
      console.warn(`     [DRIFT] ${file}: ${actual} KB vs baseline ${baseSize} KB (${sign}${driftPct.toFixed(1)}%)`);
      console.warn(`             Investigate the bloat or, if intentional, run --update-baseline.`);
    } else {
      console.log(`     [ok]    ${file}: ${actual} KB vs baseline ${baseSize} KB (${sign}${driftPct.toFixed(1)}%)`);
    }
  }
}

// 5. Summary
console.log('\n  Benchmark complete.');
console.log(`     Status: ${results.status.toUpperCase()}`);
console.log(`     Bundles checked: ${Object.keys(results.bundleSizes).length}`);

if (process.env.CI) {
  writeFileSync(
    resolve(process.cwd(), 'performance-results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('     Results saved to performance-results.json');
}

process.exit(results.status === 'pass' ? 0 : 1);
