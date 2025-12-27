#!/usr/bin/env node
/**
 * Syncs version from package.json to manifest.json
 * Run this before building to ensure versions stay in sync
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Read version from package.json (single source of truth)
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
const version = packageJson.version;

console.log(`[sync-version] Syncing version ${version} to manifest.json...`);

// Update manifest.json
const manifestPath = resolve(rootDir, 'manifest.json');
const manifestContent = readFileSync(manifestPath, 'utf-8');
const manifest = JSON.parse(manifestContent);
manifest.version = version;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

console.log(`[sync-version] ✓ manifest.json updated to version ${version}`);
