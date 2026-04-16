#!/usr/bin/env node
/**
 * site-screenshots-index.mjs — Generate a JSON index of screenshot images.
 *
 * Scans site/screenshots/ for image files (png, jpg, jpeg, webp, gif, svg),
 * then writes a sorted JSON array of filenames to site/screenshots/list.json.
 * The GitHub Pages site reads this file to display the screenshot gallery.
 *
 * This script is NOT wired into any npm lifecycle — run it manually whenever
 * you add or remove screenshots from the site/screenshots/ directory.
 *
 * Usage:
 *   node scripts/site-screenshots-index.mjs        # generate the index
 *   node scripts/site-screenshots-index.mjs -h     # show this help
 */

import fs from 'fs/promises';
import path from 'path';

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(`
site-screenshots-index.mjs — Generate a JSON index of screenshot images.

Usage:
  node scripts/site-screenshots-index.mjs

What it does:
  1. Reads all files in site/screenshots/
  2. Filters to image extensions: png, jpg, jpeg, webp, gif, svg
  3. Writes a sorted JSON array to site/screenshots/list.json

When to run:
  After adding or removing screenshots from site/screenshots/.
  The GitHub Pages site reads list.json to display the gallery.
`.trim());
  process.exit(0);
}

const screenshotsDir = path.join(process.cwd(), 'site', 'screenshots');
const outFile = path.join(screenshotsDir, 'list.json');

async function main() {
  try {
    const files = await fs.readdir(screenshotsDir);
    const images = files.filter(f => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f)).sort();
    await fs.writeFile(outFile, JSON.stringify(images, null, 2), 'utf8');
    console.log(`[site-screenshots-index] Wrote ${images.length} entries to ${outFile}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('[site-screenshots-index] site/screenshots/ not found. Skipping.');
      return;
    }
    console.error('[site-screenshots-index] Error:', err);
    process.exitCode = 1;
  }
}

main();
