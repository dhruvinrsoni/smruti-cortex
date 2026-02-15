#!/usr/bin/env node
/**
 * Performance Benchmark Script
 * Tests key operations and reports timing metrics
 */

import { performance } from 'perf_hooks';
import { readFileSync } from 'fs';
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

// 2. Module Import Performance
console.log('\n2. Testing module import speed...');
const importTests = [
  'src/core/logger.ts',
  'src/core/settings.ts',
  'src/core/helpers.ts'
];

for (const module of importTests) {
  const start = performance.now();
  try {
    await import(resolve(process.cwd(), module));
    const duration = (performance.now() - start).toFixed(2);
    results.timing[`import_${module}`] = duration;
    console.log(`   ${module}: ${duration}ms`);
  } catch (e) {
    console.warn(`   ⚠️  ${module}: Failed to import`);
  }
}

// 3. Threshold Checks
console.log('\n3. Checking performance thresholds...');

const thresholds = {
  'background/service-worker.js': 500,  // 500 KB max
  'content_scripts/quick-search.js': 200, // 200 KB max
  'popup/popup.js': 300 // 300 KB max
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
