#!/usr/bin/env node
/**
 * Performance Benchmark Script
 * Tests key operations and reports timing metrics
 */

import { performance } from 'perf_hooks';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const results = {
  bundleSizes: {},
  timing: {},
  status: 'pass'
};

console.log('📊 Performance Benchmark Starting...\n');

// 1. Bundle Size Analysis
console.log('1. Analyzing bundle sizes...');
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
    console.log(`   ${file}: ${sizeKB} KB`);
  } catch (e) {
    console.warn(`   ⚠️  ${file}: Not found`);
  }
}

// 2. Dist integrity check — verify all required build outputs exist
console.log('\n2. Verifying dist output integrity...');
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
  const icon = exists ? '✅' : '❌';
  console.log(`   ${icon} ${file}`);
  if (!exists) {
    allPresent = false;
    results.status = 'warn';
  }
}
results.timing['distIntegrity'] = allPresent ? 'pass' : 'fail';

// 3. Threshold Checks
console.log('\n3. Checking performance thresholds...');

// Thresholds set at ~150% of current actual sizes (v8.0.0: 102, 1.8, 55, 58 KB).
// Tighten when sizes are stable; loosen only with explicit justification.
const thresholds = {
  'background/service-worker.js': 150,  // actual ~102 KB
  'content_scripts/extractor.js': 5,    // actual ~1.8 KB
  'content_scripts/quick-search.js': 80, // actual ~55 KB
  'popup/popup.js': 85,                  // actual ~58 KB
};

for (const [file, maxSize] of Object.entries(thresholds)) {
  const actualSize = parseFloat(results.bundleSizes[file] || '999');
  const status = actualSize <= maxSize ? '✅' : '❌';
  console.log(`   ${status} ${file}: ${actualSize} KB / ${maxSize} KB`);
  
  if (actualSize > maxSize) {
    results.status = 'warn';
    console.warn(`   ⚠️  Bundle size exceeds threshold!`);
  }
}

// 4. Summary
console.log('\n📊 Performance Benchmark Complete\n');
console.log('Summary:');
console.log(`   Status: ${results.status.toUpperCase()}`);
console.log(`   Total Bundles: ${Object.keys(results.bundleSizes).length}`);
console.log(`   Total Tests: ${Object.keys(results.timing).length}`);

// Output JSON for CI
if (process.env.CI) {
  writeFileSync(
    resolve(process.cwd(), 'performance-results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Results saved to performance-results.json');
}

// Exit with appropriate code
process.exit(results.status === 'pass' ? 0 : 1);
