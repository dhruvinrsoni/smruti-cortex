#!/usr/bin/env node

/**
 * SmrutiCortex Release Script — also serves as the dispatcher for `npm run ship`.
 *
 * Usage:
 *   npm run ship patch | minor | major   — full release flow (bump → tag → push → GH Release)
 *   npm run ship check                   — pre-release health gate only (no disk writes)
 *   npm run ship                         — prints help + exits 0
 *
 * Direct invocation (equivalent):
 *   node scripts/release.mjs <patch|minor|major|check> [--skip-e2e] [--dry-run]
 *
 * Release flow (verify-first — zero disk writes until everything is green):
 *   1. Validate prerequisites (main branch, clean tree, gh CLI)
 *   2. Ship check gate (delegates to verify.mjs --release → verify + benchmarks + integrity + manifest/dist/git checks)
 *   3. Compute new version from explicit bump arg
 *   4. Write: bump package.json, sync manifest, generate CHANGELOG, scaffold submission doc
 *   5. Re-build with new version baked in + package zip
 *   6. Post-bump integrity (version sync + zip exists)
 *   7. Single commit with all release files
 *   8. Tag, push, create GitHub Release
 *   9. Print next steps
 *
 * `check` mode skips steps 3-9 entirely and only runs the preflight gate (step 2).
 * That gate is the same one a real release would face — so a green `ship check`
 * means the next `ship patch/minor/major` won't fail at the gate.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ─────────────────────────────────────────────────────────────────────────
// Strict argv parser (B3)
//
// The dispatcher is the single source of truth for what the operator asked
// for. Reject anything ambiguous up front rather than silently picking the
// "first match wins" interpretation that the previous `argv.find(...)` soup
// produced (e.g. `npm run ship patch minor` quietly chose `patch`).
//
// Recognised subcommands and flags live in the constants below. Adding a
// new subcommand (e.g. `resume` in D1) or flag (e.g. `--strict` in D3) is a
// one-line change — just append to KNOWN_SUBCOMMANDS or KNOWN_FLAGS.
// ─────────────────────────────────────────────────────────────────────────
const KNOWN_SUBCOMMANDS = new Set(['patch', 'minor', 'major', 'check']);
const KNOWN_FLAGS = new Set(['--skip-e2e', '--dry-run']);

function printUsage(toStderr = true) {
  const out = toStderr ? console.error : console.log;
  out('Usage: npm run ship <patch|minor|major|check> [--skip-e2e] [--dry-run]');
  out('  patch        bug fixes (8.0.0 -> 8.0.1)');
  out('  minor        new features (8.0.0 -> 8.1.0)');
  out('  major        breaking changes (8.0.0 -> 9.0.0)');
  out('  check        pre-release health gate only (no disk writes, no tag, no push)');
  out('  --skip-e2e   skip E2E tests (emergency only; rejected by `check`)');
  out('  --dry-run    preview without pushing or tagging (release modes only)');
}

function parseArgv(rawArgs) {
  const subcommands = [];
  const flags = new Set();
  const unknown = [];
  for (const arg of rawArgs) {
    if (KNOWN_SUBCOMMANDS.has(arg)) subcommands.push(arg);
    else if (KNOWN_FLAGS.has(arg)) flags.add(arg);
    else unknown.push(arg);
  }
  return { subcommands, flags, unknown };
}

const { subcommands, flags, unknown } = parseArgv(process.argv.slice(2));

if (unknown.length > 0) {
  console.error(`${RED}❌ Unknown argument(s): ${unknown.join(', ')}${RESET}`);
  printUsage();
  process.exit(2);
}
if (subcommands.length === 0) {
  printUsage();
  process.exit(1);
}
if (subcommands.length > 1) {
  console.error(`${RED}❌ Multiple subcommands provided (${subcommands.join(', ')}). Pick exactly one.${RESET}`);
  printUsage();
  process.exit(2);
}

const SUBCOMMAND = subcommands[0];
const DRY_RUN = flags.has('--dry-run');
const SKIP_E2E = flags.has('--skip-e2e');
const BUMP_TYPE = ['patch', 'minor', 'major'].includes(SUBCOMMAND) ? SUBCOMMAND : null;
const CHECK_ONLY = SUBCOMMAND === 'check';

if (CHECK_ONLY && DRY_RUN) {
  console.error(`${YELLOW}⚠️  --dry-run is a no-op for \`ship check\` (check never writes anyway). Ignoring.${RESET}`);
}

// `ship check` IS the release-readiness gate. Letting --skip-e2e silently
// weaken it defeats the entire purpose of running the gate. Hard-error
// with a redirect to the lighter-weight local sanity check.
if (CHECK_ONLY && SKIP_E2E) {
  console.error(`${RED}❌ \`ship check --skip-e2e\` is rejected.${RESET}`);
  console.error(`${YELLOW}   Ship check is the release readiness gate; --skip-e2e defeats the gate.${RESET}`);
  console.error(`${YELLOW}   For a quick local sanity check that skips E2E, use:${RESET}`);
  console.error(`     npm run verify -- --no-e2e`);
  process.exit(2);
}

function run(cmd, opts = {}) {
  const stdio = opts.silent ? 'pipe' : 'inherit';
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio, timeout: opts.timeout ?? 600000 });
}

function runSilent(cmd, opts = {}) {
  return run(cmd, { ...opts, silent: true }).trim();
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

// Verify the gh token is alive NOW, not at Step 8 after a tagged-and-pushed
// commit. `gh auth status` exits non-zero on missing/expired/revoked tokens
// and writes diagnostic output to stderr (which we surface). 5s timeout
// covers slow networks; auth is a read-only check, no GitHub state changes.
try {
  runSilent('gh auth status', { timeout: 5_000 });
  console.log(`${GREEN}✅ gh auth OK${RESET}`);
} catch {
  console.error(`${RED}❌ gh auth status failed — token missing/expired/revoked.${RESET}`);
  console.error(`${YELLOW}   Fix: run \`gh auth login\` (or \`gh auth refresh\`) and retry.${RESET}`);
  process.exit(1);
}

// Sync remote refs so subsequent collision/ahead-of-remote checks see the
// real state of origin. Soft-fail: an offline operator can still ship a
// patch from a known-clean local repo; we just print a warning so they know
// the next checks ran without remote sync.
let remoteSynced = false;
try {
  runSilent('git fetch --tags origin', { timeout: 10_000 });
  console.log(`${GREEN}✅ Fetched remote tags${RESET}`);
  remoteSynced = true;
} catch {
  console.log(`${YELLOW}⚠️  git fetch failed (offline?) — collision checks will use local refs only${RESET}`);
}

// Tag-collision guard. If the tag we're about to create already exists
// (either locally OR on the remote we just fetched), abort BEFORE any disk
// writes happen. Most common cause: a previous `npm run ship <bump>` was
// interrupted between the tag and the push, leaving a half-state. Re-running
// the same command would silently bump again and try to create a second tag
// with the same name. The fix is `npm run ship resume` (D1) once it lands;
// for now, we tell the operator to clean up manually.
if (BUMP_TYPE) {
  const pkgEarly = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  const [maj, min, pat] = pkgEarly.version.split('.').map(Number);
  const probe =
    BUMP_TYPE === 'major' ? `${maj + 1}.0.0` :
    BUMP_TYPE === 'minor' ? `${maj}.${min + 1}.0` :
    `${maj}.${min}.${pat + 1}`;
  const probeTag = `v${probe}`;

  let localCollision = false;
  try {
    runSilent(`git rev-parse --verify --quiet refs/tags/${probeTag}`);
    localCollision = true;
  } catch { /* tag absent locally — good */ }

  let remoteCollision = false;
  if (remoteSynced) {
    // After `git fetch --tags origin`, a remote tag is observable as a local
    // ref under refs/tags/ (Git fetches tags into the local namespace by
    // default). The local probe above already covers this case. We do a
    // belt-and-braces check via `git ls-remote` only when local is clean
    // but we want to be sure no race created a tag remotely between fetch
    // and now.
    try {
      const remoteOut = runSilent(`git ls-remote --tags origin ${probeTag}`, { timeout: 10_000 });
      if (remoteOut) remoteCollision = true;
    } catch { /* offline/network blip — already warned above */ }
  }

  if (localCollision || remoteCollision) {
    const where = localCollision && remoteCollision ? 'locally and on origin'
                : localCollision ? 'locally'
                : 'on origin';
    console.error(`${RED}❌ Tag ${probeTag} already exists ${where}.${RESET}`);
    console.error(`${RED}   A previous \`npm run ship ${BUMP_TYPE}\` may have been interrupted.${RESET}`);
    console.error(`${YELLOW}   Recovery options:${RESET}`);
    console.error(`     • Inspect: git log -1 ${probeTag} && gh release view ${probeTag}`);
    console.error(`     • Resume the interrupted ship (after D1 lands): npm run ship resume`);
    console.error(`     • Or clean up: git tag -d ${probeTag} && git push origin :refs/tags/${probeTag}`);
    process.exit(1);
  }
  console.log(`${GREEN}✅ Tag ${probeTag} is available${RESET}`);
}

console.log(`${GREEN}✅ On main, clean tree, gh available${RESET}\n`);

// ===== Step 2: Ship check gate (BEFORE any disk changes) =====
console.log(`${BOLD}═══ STEP 2: Ship Check Gate (zero disk changes) ═══${RESET}\n`);

if (SKIP_E2E) {
  console.log(`${YELLOW}${BOLD}┌─────────────────────────────────────────────────┐${RESET}`);
  console.log(`${YELLOW}${BOLD}│  ⚠️  WARNING: --skip-e2e is set                 │${RESET}`);
  console.log(`${YELLOW}${BOLD}│  E2E tests will be SKIPPED.                     │${RESET}`);
  console.log(`${YELLOW}${BOLD}│  [ship-override: skip-e2e] will be recorded.    │${RESET}`);
  console.log(`${YELLOW}${BOLD}│  Use this for emergencies only.                 │${RESET}`);
  console.log(`${YELLOW}${BOLD}└─────────────────────────────────────────────────┘${RESET}\n`);
}

const shipCheckCmd = SKIP_E2E
  ? 'node ./scripts/verify.mjs --release --no-e2e'
  : 'node ./scripts/verify.mjs --release';
try {
  run(shipCheckCmd);
  console.log(`\n${GREEN}✅ Ship check passed${RESET}\n`);
} catch {
  console.error(`\n${RED}❌ Ship check FAILED. Fix the errors above and retry.${RESET}`);
  console.error(`${RED}   No disk changes were made — your tree is still clean.${RESET}`);
  process.exit(1);
}

// ===== `ship check` mode: stop here, the gate IS the whole goal. =====
if (CHECK_ONLY) {
  console.log(`${BOLD}${GREEN}🟢 Ship check passed.${RESET}`);
  console.log(`   The next \`npm run ship <patch|minor|major>\` will not fail at the gate.`);
  process.exit(0);
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

  // 1. Restore tracked files (package.json, manifest.json, CHANGELOG.md).
  try { run('git checkout -- .', { silent: true }); } catch { /* best effort */ }

  // 2. Untracked submission doc — only the scaffolder created it; safe to nuke.
  try {
    if (existsSync(submissionDocPath)) unlinkSync(submissionDocPath);
  } catch { /* best effort */ }

  // 3. Release zip created by Step 5 — must be deleted, otherwise next ship
  //    sees a stale zip with the would-be version and store-check warns about
  //    a "release zip exists" for a version that was never tagged.
  try {
    const newZip = resolve(ROOT, `release/zips/smruti-cortex-v${newVersion}.zip`);
    if (existsSync(newZip)) {
      unlinkSync(newZip);
      console.error(`${YELLOW}   ⏪ Removed orphaned zip: ${newZip}${RESET}`);
    }
  } catch { /* best effort */ }

  // 4. dist/ was rebuilt with the new manifest.version, but manifest.json on
  //    disk has been reverted to the previous version. They now disagree.
  //    Wipe dist/ — the next operator command will rebuild it from source.
  //    Faster and safer than re-running the full build chain inside a revert
  //    handler that might also be failing.
  try {
    rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
    console.error(`${YELLOW}   ⏪ Cleared dist/ (manifest mismatch after partial bump)${RESET}`);
  } catch { /* best effort */ }

  console.error(`${GREEN}✅ Reverted. Tree is clean again.${RESET}`);
  console.error(`${YELLOW}   Run \`npm run build\` to regenerate dist/ when you continue.${RESET}`);
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
  run('npm run build');
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

  const zipPath = resolve(ROOT, `release/zips/smruti-cortex-v${newVersion}.zip`);
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

console.log('🚀 Pushing to origin (atomic — main + tag in one transaction)...');
// --atomic: either both refs are accepted by the remote or neither is. Without
// this, a network blip between two separate pushes leaves a committed-but-
// untagged remote (commit on main, no v<X.Y.Z> tag), which then trips up the
// next release that tries to compute the previous tag.
run(`git push --atomic origin main v${newVersion}`);

const notesFile = resolve(ROOT, '.release-notes-tmp.md');
const changelogSection2 = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf-8');
const sectionMatch = changelogSection2.match(new RegExp(`## \\[${newVersion.replace(/\./g, '\\.')}\\].*?\n\n([\\s\\S]*?)(?=\n---|\n## \\[)`));
const notes = sectionMatch ? sectionMatch[0] : `Release v${newVersion}`;
writeFileSync(notesFile, notes);

try {
  const zipPath = `release/zips/smruti-cortex-v${newVersion}.zip`;
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
console.log(`  1. Upload release/zips/smruti-cortex-v${newVersion}.zip to Chrome Web Store`);
console.log(`     https://chrome.google.com/webstore/devconsole`);
console.log(`  2. Edit docs/store-submissions/v${newVersion}-chrome-web-store.md`);
console.log(`     — Fill in Section 7 (Changes) and Section 9 (Checklist)`);
console.log(`     — Delete the TODO preamble`);
console.log(`  3. After CWS upload: npm run store check`);
