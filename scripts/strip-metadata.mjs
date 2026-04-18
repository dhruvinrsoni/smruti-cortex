/**
 * strip-metadata.mjs
 * Recovery tool for loading CWS-downloaded extensions via "Load Unpacked".
 *
 * Chrome Web Store adds _metadata/ to published CRX packages for integrity
 * verification. Chrome rejects _metadata/ when using "Load Unpacked" because
 * underscore-prefixed names are reserved. This script strips those entries.
 *
 * Usage:
 *   node scripts/strip-metadata.mjs <folder-path>
 *   npm run unpack:cws -- <folder-path>
 *
 * The folder is modified in-place — any _* entries at the top level are removed.
 */

import { existsSync, readdirSync, rmSync, statSync } from 'fs';
import { resolve, basename } from 'path';

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/strip-metadata.mjs <folder-path>');
  console.error('  Strips _metadata/ and other _* entries so Chrome accepts "Load Unpacked".');
  process.exit(1);
}

const absPath = resolve(target);

if (!existsSync(absPath)) {
  console.error(`❌ Path not found: ${absPath}`);
  process.exit(1);
}

const stat = statSync(absPath);
if (!stat.isDirectory()) {
  console.error(`❌ Not a directory: ${absPath}`);
  console.error('   Unzip your CWS download first, then pass the resulting folder.');
  process.exit(1);
}

const entries = readdirSync(absPath);
const underscored = entries.filter(e => e.startsWith('_'));

if (underscored.length === 0) {
  console.log(`✅ No underscore-prefixed entries found in ${basename(absPath)}/ — already clean.`);
  process.exit(0);
}

console.log(`🧹 Stripping ${underscored.length} reserved entr${underscored.length === 1 ? 'y' : 'ies'}:`);

for (const name of underscored) {
  const full = resolve(absPath, name);
  const isDir = statSync(full).isDirectory();
  rmSync(full, { recursive: true, force: true });
  console.log(`   ✗ ${name}${isDir ? '/' : ''}`);
}

console.log(`\n✅ Done. Load this folder via chrome://extensions → "Load Unpacked":`);
console.log(`   ${absPath}`);
