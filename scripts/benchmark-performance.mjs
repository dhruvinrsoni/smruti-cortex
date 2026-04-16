#!/usr/bin/env node
/**
 * benchmark-performance.mjs — Bundle size analysis and threshold enforcement.
 *
 * Reads dist/ bundle sizes, verifies required build outputs exist, and
 * compares sizes against thresholds. Exits non-zero if any threshold is
 * exceeded or required files are missing — suitable as a release gate.
 *
 * Called automatically by preflight.mjs (Phase 2). Can also be run standalone
 * after a production build.
 *
 * Usage:
 *   node scripts/benchmark-performance.mjs        # run checks
 *   node scripts/benchmark-performance.mjs -h     # show this help
 *
 * In CI (when $CI is set), writes performance-results.json for archiving.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(`
benchmark-performance.mjs — Bundle size analysis and threshold enforcement.

Usage:
  node scripts/benchmark-performance.mjs

What it does:
  1. Reads dist/ bundle sizes for key JS outputs
  2. Verifies all required build artifacts exist in dist/
  3. Compares sizes against thresholds (exits non-zero on breach)
  4. Writes performance-results.json when $CI is set

Prerequisite:
  dist/ must exist — run \`npm run build:prod\` first.
`.trim());
  process.exit(0);
}

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

// 3. Threshold Checks
// Thresholds set at ~150% of current actual sizes (v9.0.0: 194, 1.8, 162, 162 KB).
// Tighten when sizes stabilize; loosen only with explicit justification.
console.log('\n  3. Checking size thresholds...');
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
    console.warn(`     [!] Bundle size exceeds threshold!`);
  }
}

// 4. Summary
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
