#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const screenshotsDir = path.join(process.cwd(), 'site', 'screenshots');
const outFile = path.join(screenshotsDir, 'list.json');

async function main(){
  try{
    const files = await fs.readdir(screenshotsDir);
    const images = files.filter(f => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f)).sort();
    // Write safe JSON array of filenames
    await fs.writeFile(outFile, JSON.stringify(images, null, 2), 'utf8');
    console.log(`[generate-screenshots-index] Wrote ${images.length} entries to ${outFile}`);
  }catch(err){
    if (err.code === 'ENOENT'){
      console.warn('[generate-screenshots-index] screenshots directory not found. Skipping.');
      return;
    }
    console.error('[generate-screenshots-index] Error:', err);
    process.exitCode = 1;
  }
}

main();
