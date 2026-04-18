#!/usr/bin/env node

/**
 * SmrutiCortex Release Script
 *
 * Usage: node scripts/release.mjs <patch|minor|major> [--skip-e2e] [--dry-run]
 *
 * Flow (verify-first — zero disk writes until everything is green):
 *   1. Validate prerequisites (main branch, clean tree, gh CLI)
 *   2. Preflight gate (delegates to npm run preflight → verify + benchmarks + integrity)
 *   3. Compute new version from explicit bump arg
 *   4. Write: bump package.json, sync manifest, generate CHANGELOG, scaffold submission doc
 *   5. Re-build with new version baked in + package zip
 *   6. Post-bump integrity (version sync + zip exists)
 *   7. Single commit with all release files
 *   8. Tag, push, create GitHub Release
 *   9. Print next steps
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_E2E = process.argv.includes('--skip-e2e');
const BUMP_TYPE = process.argv.find(a => ['patch', 'minor', 'major'].includes(a));

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

if (!BUMP_TYPE) {
  console.error('Usage: node scripts/release.mjs <patch|minor|major> [--skip-e2e] [--dry-run]');
  console.error('  patch  — bug fixes (8.0.0 → 8.0.1)');
  console.error('  minor  — new features (8.0.0 → 8.1.0)');
  console.error('  major  — breaking changes (8.0.0 → 9.0.0)');
  console.error('  --skip-e2e  — skip E2E tests (emergency only)');
  console.error('  --dry-run   — preview without pushing or tagging');
  process.exit(1);
}

function run(cmd, opts = {}) {
  const stdio = opts.silent ? 'pipe' : 'inherit';
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio, timeout: 600000 });
}

function runSilent(cmd) {
  return run(cmd, { silent: true }).trim();
}

// ===== Step 1: Validate prerequisites =====
console.log(`\n${BOLD}═══ STEP 1: Validate Prerequisites ═══${RESET}\n`);

const branch = runSilent('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`${RED}❌ Must be on 'main' branch (currently on '${branch}')${RESET}`);
  process.exit(1);
}

const status = runSilent('git status --porcelain');
if (status) {
  console.error(`${RED}❌ Working tree is not clean. Commit or stash changes first.${RESET}`);
  console.error(status);
  process.exit(1);
}

try {
  runSilent('gh --version');
} catch {
  console.error(`${RED}❌ GitHub CLI (gh) not found. Install: https://cli.github.com/${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}✅ On main, clean tree, gh available${RESET}\n`);

// ===== Step 2: Preflight gate (BEFORE any disk changes) =====
console.log(`${BOLD}═══ STEP 2: Preflight Gate (zero disk changes) ═══${RESET}\n`);

if (SKIP_E2E) {
  console.log(`${YELLOW}${BOLD}┌─────────────────────────────────────────────────┐${RESET}`);
  console.log(`${YELLOW}${BOLD}│  ⚠️  WARNING: --skip-e2e is set                 │${RESET}`);
  console.log(`${YELLOW}${BOLD}│  E2E tests will be SKIPPED.                     │${RESET}`);
  console.log(`${YELLOW}${BOLD}│  [ship-override: skip-e2e] will be recorded.    │${RESET}`);
  console.log(`${YELLOW}${BOLD}│  Use this for emergencies only.                 │${RESET}`);
  console.log(`${YELLOW}${BOLD}└─────────────────────────────────────────────────┘${RESET}\n`);
}

const preflightCmd = SKIP_E2E ? 'npm run preflight -- --no-e2e' : 'npm run preflight';
try {
  run(preflightCmd);
  console.log(`\n${GREEN}✅ Preflight passed${RESET}\n`);
} catch {
  console.error(`\n${RED}❌ Preflight FAILED. Fix the errors above and retry.${RESET}`);
  console.error(`${RED}   No disk changes were made — your tree is still clean.${RESET}`);
  process.exit(1);
}

// ===== Step 3: Compute new version =====
console.log(`${BOLD}═══ STEP 3: Compute Version ═══${RESET}\n`);

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
let newVersion;
switch (BUMP_TYPE) {
  case 'major': newVersion = `${major + 1}.0.0`; break;
  case 'minor': newVersion = `${major}.${minor + 1}.0`; break;
  case 'patch': newVersion = `${major}.${minor}.${patch + 1}`; break;
}

console.log(`📦 Version bump: ${pkg.version} → ${newVersion} (${BUMP_TYPE})\n`);

if (DRY_RUN) {
  console.log(`${BOLD}🏁 DRY RUN COMPLETE${RESET} — verified successfully, would bump to ${newVersion}\n`);
  console.log('  No disk changes made.');
  process.exit(0);
}

// ===== Step 4: Write disk changes =====
console.log(`${BOLD}═══ STEP 4: Write Disk Changes ═══${RESET}\n`);

const submissionDocPath = resolve(ROOT, `docs/store-submissions/v${newVersion}-chrome-web-store.md`);

function revertOnFailure(msg) {
  console.error(`\n${RED}❌ ${msg}${RESET}`);
  console.error(`${YELLOW}⏪ Reverting disk changes...${RESET}`);
  try { run('git checkout -- .', { silent: true }); } catch { /* best effort */ }
  try {
    if (existsSync(submissionDocPath)) unlinkSync(submissionDocPath);
  } catch { /* best effort */ }
  console.error(`${GREEN}✅ Reverted. Tree is clean again.${RESET}`);
  process.exit(1);
}

try {
  // 4a. Bump package.json
  pkg.version = newVersion;
  writeFileSync(resolve(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  // 4b. Sync to manifest.json
  run('node scripts/sync-version.mjs');

  // 4c. Generate changelog from git log
  let lastTag = '';
  try { lastTag = runSilent('git describe --tags --abbrev=0'); } catch { /* no tags */ }
  const logRange = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const rawLog = runSilent(`git log ${logRange} --oneline --no-merges`);

  const commits = rawLog.split('\n').filter(Boolean);
  const categorized = { feat: [], fix: [], refactor: [], docs: [], chore: [], style: [], test: [], other: [] };

  for (const line of commits) {
    const match = line.match(/^[a-f0-9]+ (\w+)(?:\(.*?\))?[!]?:\s*(.+)$/);
    if (match) {
      const [, type, msg] = match;
      const cat = categorized[type] || categorized.other;
      cat.push(msg);
    } else {
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
  if (categorized.test.length) {
    changelogSection += '### Tests\n' + categorized.test.map(m => `- ${m}`).join('\n') + '\n\n';
  }
  const misc = [...categorized.docs, ...categorized.chore, ...categorized.style, ...categorized.other];
  if (misc.length) {
    changelogSection += '### Other\n' + misc.map(m => `- ${m}`).join('\n') + '\n\n';
  }

  console.log('📝 Generated changelog:\n');
  console.log(changelogSection);

  // 4d. Prepend to CHANGELOG.md
  const changelogPath = resolve(ROOT, 'CHANGELOG.md');
  const existingChangelog = readFileSync(changelogPath, 'utf-8');
  const headerEnd = existingChangelog.indexOf('\n\n') + 2;
  const header = existingChangelog.slice(0, headerEnd);
  const rest = existingChangelog.slice(headerEnd);
  writeFileSync(changelogPath, header + changelogSection + '---\n\n' + rest);
  console.log(`${GREEN}✅ CHANGELOG.md updated${RESET}`);

  // 4e. Scaffold submission doc
  try {
    run(`node scripts/store-check.mjs ${newVersion} --init`);
    console.log(`${GREEN}✅ Submission doc scaffolded${RESET}`);
  } catch {
    console.log(`${YELLOW}⚠️  Submission doc scaffold had issues (non-blocking)${RESET}`);
  }

} catch (e) {
  revertOnFailure(`Disk write phase failed: ${e.message}`);
}

// ===== Step 5: Re-build with new version + package zip =====
console.log(`\n${BOLD}═══ STEP 5: Re-build + Package ═══${RESET}\n`);

try {
  run('npm run build:prod');
  console.log(`${GREEN}✅ Production build with v${newVersion}${RESET}`);
  run('node scripts/package.mjs');
  console.log(`${GREEN}✅ Package zip created${RESET}`);
} catch (e) {
  revertOnFailure(`Build/package failed: ${e.message}`);
}

// ===== Step 6: Post-bump integrity (version sync + zip) =====
console.log(`\n${BOLD}═══ STEP 6: Post-bump Integrity ═══${RESET}\n`);

try {
  const builtManifest = JSON.parse(readFileSync(resolve(ROOT, 'dist/manifest.json'), 'utf-8'));
  if (builtManifest.version !== newVersion) throw new Error(`dist/manifest.json version is ${builtManifest.version}, expected ${newVersion}`);

  const zipPath = resolve(ROOT, `release/smruti-cortex-v${newVersion}.zip`);
  if (!existsSync(zipPath)) throw new Error(`Release zip not found at ${zipPath}`);

  console.log(`${GREEN}✅ dist/manifest.json version: ${newVersion}${RESET}`);
  console.log(`${GREEN}✅ Release zip exists${RESET}`);
} catch (e) {
  revertOnFailure(`Integrity check failed: ${e.message}`);
}

// ===== Step 7: Commit =====
console.log(`\n${BOLD}═══ STEP 7: Commit Release ═══${RESET}\n`);

const commitFiles = ['package.json', 'manifest.json', 'CHANGELOG.md'];
if (existsSync(submissionDocPath)) {
  commitFiles.push(`docs/store-submissions/v${newVersion}-chrome-web-store.md`);
}
run(`git add ${commitFiles.join(' ')}`);

let commitMsg = `chore: release v${newVersion}`;
if (SKIP_E2E) {
  commitMsg += '\n\n[ship-override: skip-e2e]';
}
run(`git commit -m "${commitMsg}" --no-verify`);
console.log(`${GREEN}✅ Release commit created${RESET}`);

// ===== Step 8: Tag, push, GitHub Release =====
console.log(`\n${BOLD}═══ STEP 8: Tag + Push + GitHub Release ═══${RESET}\n`);

run(`git tag -a v${newVersion} -m "SmrutiCortex v${newVersion}" --no-sign`);

console.log('🚀 Pushing to origin...');
run('git push origin main');
run(`git push origin v${newVersion}`);

const notesFile = resolve(ROOT, '.release-notes-tmp.md');
const changelogSection2 = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf-8');
const sectionMatch = changelogSection2.match(new RegExp(`## \\[${newVersion.replace(/\./g, '\\.')}\\].*?\n\n([\\s\\S]*?)(?=\n---|\n## \\[)`));
const notes = sectionMatch ? sectionMatch[0] : `Release v${newVersion}`;
writeFileSync(notesFile, notes);

try {
  const zipPath = `release/smruti-cortex-v${newVersion}.zip`;
  const releaseUrl = runSilent(`gh release create v${newVersion} -t "v${newVersion}" -F "${notesFile}" "${zipPath}"`);
  console.log(`${GREEN}✅ GitHub Release created: ${releaseUrl}${RESET}`);
} catch {
  console.log(`${YELLOW}⚠️  GitHub Release creation failed (create manually)${RESET}`);
  console.log(`  gh release create v${newVersion} -t "v${newVersion}" -F .release-notes-tmp.md`);
}

try { unlinkSync(notesFile); } catch { /* best effort */ }

// ===== Step 9: Summary + Next Steps =====
console.log(`\n${'═'.repeat(50)}`);
console.log(`${BOLD}${GREEN}🎉 SmrutiCortex v${newVersion} released!${RESET}`);
console.log(`${'═'.repeat(50)}`);

if (SKIP_E2E) {
  console.log(`\n${YELLOW}⚠️  This release was shipped with --skip-e2e.${RESET}`);
  console.log(`${YELLOW}   [ship-override: skip-e2e] is recorded in the commit body.${RESET}`);
}

console.log(`\n📋 Next steps:`);
console.log(`  1. Upload release/smruti-cortex-v${newVersion}.zip to Chrome Web Store`);
console.log(`     https://chrome.google.com/webstore/devconsole`);
console.log(`  2. Edit docs/store-submissions/v${newVersion}-chrome-web-store.md`);
console.log(`     — Fill in Section 7 (Changes) and Section 9 (Checklist)`);
console.log(`     — Delete the TODO preamble`);
console.log(`  3. After CWS upload: npm run store:check`);
