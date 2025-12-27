/**
 * package.mjs
 * Creates a distributable zip file for Chrome/Edge Web Store
 */

import { createWriteStream, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync } from 'fs';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const releaseDir = join(rootDir, 'release');

const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
const version = pkg.version;
const zipName = `smruti-cortex-v${version}.zip`;
const zipPath = join(releaseDir, zipName);

async function createZip() {
  console.log(`\n📦 Packaging SmrutiCortex v${version}...`);
  console.log('─'.repeat(50));

  if (!existsSync(distDir)) {
    console.error('❌ dist/ folder not found. Run `npm run build:prod` first.');
    process.exit(1);
  }

  // Create release directory if it doesn't exist
  if (!existsSync(releaseDir)) {
    mkdirSync(releaseDir, { recursive: true });
    console.log('✅ Created release/ directory');
  }

  // List files that will be included
  const files = getAllFiles(distDir);
  console.log(`\n📁 Files to package (${files.length} files):`);
  files.slice(0, 10).forEach(f => console.log(`  - ${relative(rootDir, f)}`));
  if (files.length > 10) {
    console.log(`  ... and ${files.length - 10} more`);
  }

  // Create zip archive
  console.log(`\n🗜️  Creating zip archive...`);
  
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`\n✅ Package created successfully!`);
      console.log(`   📦 ${relative(rootDir, zipPath)}`);
      console.log(`   📊 Size: ${sizeMB} MB`);
      console.log(`   📂 Location: ${zipPath}`);
      console.log(`\n🚀 Ready to upload to Chrome/Edge Web Store!`);
      resolve();
    });

    archive.on('error', (err) => {
      console.error('❌ Error creating zip:', err);
      reject(err);
    });

    archive.on('warning', (warn) => {
      if (warn.code === 'ENOENT') {
        console.warn('⚠️  Warning:', warn);
      } else {
        throw warn;
      }
    });

    archive.pipe(output);
    
    // Add all files from dist/ directory
    archive.directory(distDir, false);
    
    archive.finalize();
  });
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

createZip().catch(err => {
  console.error('❌ Packaging failed:', err);
  process.exit(1);
});

