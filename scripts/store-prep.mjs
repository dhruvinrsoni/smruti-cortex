#!/usr/bin/env node

/**
 * SmrutiCortex Chrome Web Store Submission Prep
 *
 * Usage: node scripts/store-prep.mjs
 *
 * Reads CHANGELOG.md and package.json, generates store submission text.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const changelog = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf-8');

// Extract latest version section from CHANGELOG
const versionMatch = changelog.match(/^## \[[\d.]+\][^\n]*\n([\s\S]*?)(?=\n---|\n## \[)/m);
const latestChanges = versionMatch ? versionMatch[1].trim() : 'See CHANGELOG.md for details.';

// Strip markdown formatting for plain text
const plainChanges = latestChanges
  .replace(/^### .+$/gm, '')        // Remove section headers
  .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold → plain
  .replace(/`([^`]+)`/g, '$1')       // Code → plain
  .replace(/^\s*- /gm, '- ')         // Normalize bullet indent
  .replace(/\n{3,}/g, '\n\n')        // Collapse blank lines
  .trim();

// Truncate to 500 chars for "What's new"
const MAX_WHATS_NEW = 500;
let whatsNew = plainChanges;
if (whatsNew.length > MAX_WHATS_NEW) {
  whatsNew = whatsNew.slice(0, MAX_WHATS_NEW - 3).replace(/\s+\S*$/, '') + '...';
}

console.log('='.repeat(60));
console.log(`  SmrutiCortex v${pkg.version} — Chrome Web Store Submission`);
console.log('='.repeat(60));

console.log('\n📋 WHAT\'S NEW (paste into "Changes in this version"):\n');
console.log(whatsNew);
console.log(`\n  [${whatsNew.length}/${MAX_WHATS_NEW} chars]`);

console.log('\n' + '-'.repeat(60));
console.log('\n🔐 PERMISSION JUSTIFICATIONS (paste if reviewer asks):\n');
console.log(`history     — Core feature: indexes visited page titles/URLs for full-text search`);
console.log(`bookmarks   — Merges bookmarks into search results alongside history`);
console.log(`storage     — Persists search index (IndexedDB), settings, and favicon cache locally`);
console.log(`tabs        — Opens results in new tabs; reads active tab URL for context`);
console.log(`alarms      — Schedules periodic background re-indexing when browser is idle`);
console.log(`scripting   — Re-injects the quick-search overlay into already-open tabs after an extension`);
console.log(`              update so the keyboard shortcut keeps working without a page reload.`);
console.log(`              Used ONLY for our own content script (content_scripts/quick-search.js),`);
console.log(`              NEVER to run arbitrary code. No user data is read, collected, or sent.`);
console.log(`<all_urls>  — Optional host permission for fetching favicons from Google API (display only)`);

console.log('\n' + '-'.repeat(60));
console.log('\n🔒 PRIVACY SUMMARY:\n');
console.log(`- All data stays local (IndexedDB in extension storage)`);
console.log(`- No browsing data sent to any server`);
console.log(`- AI features use local Ollama models only (opt-in)`);
console.log(`- scripting used ONLY to re-inject our own content script after updates — never arbitrary code`);
console.log(`- <all_urls> used only for favicon images, never for data collection`);
console.log(`- Privacy policy: https://dhruvinrsoni.github.io/smruti-cortex/privacy.html`);

console.log('\n' + '-'.repeat(60));
console.log('\n📦 UPLOAD:\n');
console.log(`  File: release/smruti-cortex-v${pkg.version}.zip`);
console.log(`  Dashboard: https://chrome.google.com/webstore/devconsole`);

console.log('\n' + '='.repeat(60));
