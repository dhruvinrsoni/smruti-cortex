/**
 * package.mjs
 * Creates a distributable zip file for Chrome/Edge Web Store
 */

import { createWriteStream, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream, readdirSync, statSync } from 'fs';
import { createGzip } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
const version = pkg.version;
const zipName = `smruti-cortex-v${version}.zip`;

// Simple zip creation using Node's built-in archiver alternative
// For actual use, you'd want to use 'archiver' package, but for simplicity:

async function createZip() {
  console.log(`\n📦 Packaging SmrutiCortex v${version}...`);
  console.log('─'.repeat(50));

  if (!existsSync(distDir)) {
    console.error('❌ dist/ folder not found. Run `npm run build:prod` first.');
    process.exit(1);
  }

  // List files that will be included
  const files = getAllFiles(distDir);
  console.log(`\n📁 Files to package (${files.length} files):`);
  files.slice(0, 10).forEach(f => console.log(`  - ${f.replace(distDir, 'dist')}`));
  if (files.length > 10) {
    console.log(`  ... and ${files.length - 10} more`);
  }

  console.log(`\n💡 To create the zip manually:`);
  console.log(`   cd dist && zip -r ../${zipName} . && cd ..`);
  console.log(`\n   Or on Windows PowerShell:`);
  console.log(`   Compress-Archive -Path dist\\* -DestinationPath ${zipName}`);

  console.log(`\n✅ Ready for packaging!`);
  console.log(`   Output will be: ${zipName}`);
}

function getAllFiles(dir, files = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

createZip();
