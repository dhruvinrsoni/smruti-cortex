#!/usr/bin/env node

/**
 * SmrutiCortex Release Script
 *
 * Usage: node scripts/release.mjs <patch|minor|major> [--dry-run]
 *
 * Automates: version bump → sync manifest → changelog → commit → tag → push → GitHub Release → package zip
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const BUMP_TYPE = process.argv.find(a => ['patch', 'minor', 'major'].includes(a));

if (!BUMP_TYPE) {
  console.error('Usage: node scripts/release.mjs <patch|minor|major> [--dry-run]');
  console.error('  patch  — bug fixes (8.0.0 → 8.0.1)');
  console.error('  minor  — new features (8.0.0 → 8.1.0)');
  console.error('  major  — breaking changes (8.0.0 → 9.0.0)');
  console.error('  --dry-run  — preview without pushing or tagging');
  process.exit(1);
}

function run(cmd, opts = {}) {
  const stdio = opts.silent ? 'pipe' : 'inherit';
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio, timeout: 300000 });
}

function runSilent(cmd) {
  return run(cmd, { silent: true }).trim();
}

// ===== Step 1: Validate prerequisites =====
console.log('🔍 Validating prerequisites...\n');

// Check branch
const branch = runSilent('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`❌ Must be on 'main' branch (currently on '${branch}')`);
  process.exit(1);
}

// Check clean working tree
const status = runSilent('git status --porcelain');
if (status) {
  console.error('❌ Working tree is not clean. Commit or stash changes first.');
  console.error(status);
  process.exit(1);
}

// Check gh CLI available
try {
  runSilent('gh --version');
} catch {
  console.error('❌ GitHub CLI (gh) not found. Install: https://cli.github.com/');
  process.exit(1);
}

console.log('✅ On main, clean tree, gh available\n');

// ===== Step 2: Bump version =====
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
let newVersion;
switch (BUMP_TYPE) {
  case 'major': newVersion = `${major + 1}.0.0`; break;
  case 'minor': newVersion = `${major}.${minor + 1}.0`; break;
  case 'patch': newVersion = `${major}.${minor}.${patch + 1}`; break;
}

console.log(`📦 Version bump: ${pkg.version} → ${newVersion} (${BUMP_TYPE})\n`);

// Update package.json
pkg.version = newVersion;
writeFileSync(resolve(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

// Sync to manifest.json
run('node scripts/sync-version.mjs');

// ===== Step 3: Generate changelog from git log =====
const lastTag = runSilent('git describe --tags --abbrev=0 2>/dev/null || echo ""');
const logRange = lastTag ? `${lastTag}..HEAD` : 'HEAD';
const rawLog = runSilent(`git log ${logRange} --oneline --no-merges`);

const commits = rawLog.split('\n').filter(Boolean);
const categorized = { feat: [], fix: [], refactor: [], docs: [], chore: [], style: [], other: [] };

for (const line of commits) {
  const match = line.match(/^[a-f0-9]+ (\w+)(?:\(.*?\))?[!]?:\s*(.+)$/);
  if (match) {
    const [, type, msg] = match;
    const cat = categorized[type] || categorized.other;
    cat.push(msg);
  } else {
    // Non-conventional commit
    const msg = line.replace(/^[a-f0-9]+ /, '');
    categorized.other.push(msg);
  }
}

const today = new Date().toISOString().split('T')[0];
let changelogSection = `## [${newVersion}] — ${today}\n\n`;

if (categorized.feat.length) {
  changelogSection += '### Features\n' + categorized.feat.map(m => `- ${m}`).join('\n') + '\n\n';
}
if (categorized.fix.length) {
  changelogSection += '### Bug Fixes\n' + categorized.fix.map(m => `- ${m}`).join('\n') + '\n\n';
}
if (categorized.refactor.length) {
  changelogSection += '### Refactoring\n' + categorized.refactor.map(m => `- ${m}`).join('\n') + '\n\n';
}
const misc = [...categorized.docs, ...categorized.chore, ...categorized.style, ...categorized.other];
if (misc.length) {
  changelogSection += '### Other\n' + misc.map(m => `- ${m}`).join('\n') + '\n\n';
}

console.log('📝 Generated changelog:\n');
console.log(changelogSection);

// ===== Step 4: Update CHANGELOG.md =====
const changelogPath = resolve(ROOT, 'CHANGELOG.md');
const existingChangelog = readFileSync(changelogPath, 'utf-8');

// Insert new section after the header line
const headerEnd = existingChangelog.indexOf('\n\n') + 2;
const header = existingChangelog.slice(0, headerEnd);
const rest = existingChangelog.slice(headerEnd);

writeFileSync(changelogPath, header + changelogSection + '---\n\n' + rest);
console.log('✅ CHANGELOG.md updated\n');

// ===== Step 5: Run tests =====
console.log('🧪 Running tests...\n');
try {
  run('npx vitest run');
  console.log('\n✅ All tests passed\n');
} catch {
  console.error('\n❌ Tests failed. Fix before releasing.');
  // Revert changes
  run('git checkout -- package.json manifest.json CHANGELOG.md');
  process.exit(1);
}

// ===== Step 6: Build =====
console.log('🏗️  Running production build...\n');
try {
  run('node scripts/sync-version.mjs && npx rimraf dist && npx tsc --project tsconfig.json && node scripts/copy-static.mjs && node scripts/esbuild-prod.mjs');
  console.log('\n✅ Production build passed\n');
} catch {
  console.error('\n❌ Build failed. Fix before releasing.');
  run('git checkout -- package.json manifest.json CHANGELOG.md');
  process.exit(1);
}

if (DRY_RUN) {
  console.log('🏁 DRY RUN COMPLETE — would have done:\n');
  console.log(`  git add package.json manifest.json CHANGELOG.md`);
  console.log(`  git commit -m "chore: release v${newVersion}"`);
  console.log(`  git tag -a v${newVersion} -m "SmrutiCortex v${newVersion}"`);
  console.log(`  git push origin main && git push origin v${newVersion}`);
  console.log(`  gh release create v${newVersion} ...`);
  console.log(`  npm run package`);
  console.log('\n💡 Reverting local changes...');
  run('git checkout -- package.json manifest.json CHANGELOG.md');
  process.exit(0);
}

// ===== Step 7: Commit, tag, push =====
console.log('📦 Committing release...\n');
run('git add package.json manifest.json CHANGELOG.md');
run(`git commit -m "chore: release v${newVersion}" --no-verify --no-gpg-sign`);
run(`git tag -a v${newVersion} -m "SmrutiCortex v${newVersion}" --no-sign`);

console.log('🚀 Pushing to origin...\n');
run('git push origin main');
run(`git push origin v${newVersion}`);

// ===== Step 8: GitHub Release =====
console.log('📋 Creating GitHub Release...\n');
const notesFile = resolve(ROOT, '.release-notes-tmp.md');
writeFileSync(notesFile, changelogSection);
try {
  const releaseUrl = runSilent(`gh release create v${newVersion} -t "v${newVersion}" -F "${notesFile}"`);
  console.log(`✅ GitHub Release created: ${releaseUrl}\n`);
} catch (e) {
  console.warn(`⚠️  GitHub Release creation failed (you may need to create it manually)`);
  console.warn(`  gh release create v${newVersion} -t "v${newVersion}" -F .release-notes-tmp.md`);
}

// ===== Step 9: Package zip =====
console.log('📦 Creating Chrome Web Store package...\n');
run('node scripts/package.mjs');

// ===== Summary =====
console.log('\n' + '='.repeat(50));
console.log(`🎉 SmrutiCortex v${newVersion} released!`);
console.log('='.repeat(50));
console.log(`\n📋 Next steps:`);
console.log(`  1. Run: node scripts/store-prep.mjs`);
console.log(`  2. Upload release/smruti-cortex-v${newVersion}.zip to Chrome Web Store`);
console.log(`  3. Paste the generated "What's new" text`);
console.log(`  4. Submit for review`);
