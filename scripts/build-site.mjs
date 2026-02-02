#!/usr/bin/env node

/**
 * Local build script for landing page
 * Copies site/ files to docs/ while preserving docs/privacy.html
 * 
 * Usage: node scripts/build-site.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const siteDir = path.join(rootDir, 'site');
const docsDir = path.join(rootDir, 'docs');
const privacyFile = path.join(docsDir, 'privacy.html');

async function buildSite() {
    console.log('🚀 Building landing page...\n');

    try {
        // Step 1: Backup privacy.html if it exists
        let privacyBackup = null;
        try {
            privacyBackup = await fs.readFile(privacyFile, 'utf-8');
            console.log('✅ Backed up privacy.html');
        } catch (err) {
            console.log('⚠️  No existing privacy.html found');
        }

        // Step 2: Clean docs directory
        try {
            const entries = await fs.readdir(docsDir);
            for (const entry of entries) {
                if (entry !== 'privacy.html') {
                    const fullPath = path.join(docsDir, entry);
                    const stat = await fs.stat(fullPath);
                    if (stat.isDirectory()) {
                        await fs.rm(fullPath, { recursive: true, force: true });
                    } else {
                        await fs.unlink(fullPath);
                    }
                }
            }
            console.log('✅ Cleaned docs directory (except privacy.html)');
        } catch (err) {
            // Directory doesn't exist, create it
            await fs.mkdir(docsDir, { recursive: true });
            console.log('✅ Created docs directory');
        }

        // Step 3: Copy all site files to docs
        const siteToDocs = async (src, dest) => {
            const entries = await fs.readdir(src, { withFileTypes: true });
            
            for (const entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                
                if (entry.isDirectory()) {
                    await fs.mkdir(destPath, { recursive: true });
                    await siteToDocs(srcPath, destPath);
                } else {
                    await fs.copyFile(srcPath, destPath);
                }
            }
        };

        await siteToDocs(siteDir, docsDir);
        console.log('✅ Copied site files to docs/');

        // Step 4: Restore privacy.html if it existed
        if (privacyBackup) {
            await fs.writeFile(privacyFile, privacyBackup, 'utf-8');
            console.log('✅ Restored privacy.html');
        }

        // Step 5: Verify deployment
        console.log('\n📁 Deployed files:');
        const deployedFiles = await fs.readdir(docsDir);
        deployedFiles.forEach(file => console.log(`   - ${file}`));

        // Verify critical files
        const indexExists = deployedFiles.includes('index.html');
        const privacyExists = deployedFiles.includes('privacy.html');

        console.log('\n🔍 Verification:');
        console.log(`   ${indexExists ? '✅' : '❌'} index.html`);
        console.log(`   ${privacyExists ? '✅' : '❌'} privacy.html`);

        if (!indexExists || !privacyExists) {
            throw new Error('Critical files missing!');
        }

        console.log('\n✨ Build completed successfully!');
        console.log('\n📍 Preview locally:');
        console.log('   Open: file://' + path.join(docsDir, 'index.html'));
        console.log('\n🌐 Live URLs (after push):');
        console.log('   Landing: https://dhruvinrsoni.github.io/smruti-cortex/');
        console.log('   Privacy: https://dhruvinrsoni.github.io/smruti-cortex/privacy.html');

    } catch (error) {
        console.error('\n❌ Build failed:', error.message);
        process.exit(1);
    }
}

buildSite();
