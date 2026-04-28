#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

// === Smart Skip: Non-product file patterns ===
// If ALL staged files match these patterns, skip builds entirely.
// Product files are "everything NOT in this list" — safe by default.
const SKIP_PATTERNS = [
  /^docs\//,              // Website, screenshots, docs
  /^\.github\//,          // Workflows, skills, copilot instructions
  /^\.claude\//,          // Claude Code config
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /^CONTRIBUTING\.md$/,
  /^LICENSE$/,
  /^CHROME_WEB_STORE\.md$/,
  /^\.gitignore$/,
  /^\.editorconfig$/,
  /^\.vscode\//,          // VS Code settings
];

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return null; // Fallback: can't determine → run builds (safe default)
  }
}

// === Manifest permission discipline ===
// Detect when manifest.json's permission arrays change without a corresponding
// docs/store-submissions/*.md edit staged in the same commit. Reproduces the
// invariant that the Chrome Web Store reviewer expects: every declared
// permission has a Section 4 justification, and that justification must travel
// with the manifest change (otherwise it gets forgotten — that's the
// v9.2.0 `idle` regression).
//
// Returns:
//   { changed: false }                              -- manifest unchanged or perms unchanged
//   { changed: true, docStaged, reqDelta, optDelta, totalChanges }
//
// `reqDelta` / `optDelta` shape: { added: [], removed: [] }
// `docStaged` is `true` iff at least one docs/store-submissions/*.md file is
// also staged. The hook treats `changed && !docStaged` as a hard fail.
function checkPermissionDocParity(stagedFiles) {
  if (!stagedFiles || !stagedFiles.includes('manifest.json')) {
    return { changed: false };
  }

  let stagedManifest;
  try {
    const raw = execSync('git show :manifest.json', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    stagedManifest = JSON.parse(raw);
  } catch {
    return { changed: false, reason: 'could not read staged manifest.json' };
  }

  let headManifest;
  try {
    const raw = execSync('git show HEAD:manifest.json', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    headManifest = JSON.parse(raw);
  } catch {
    // No HEAD manifest yet (initial commit) — treat all current perms as added.
    headManifest = {};
  }

  const diff = (prev, cur) => {
    const a = Array.isArray(prev) ? prev : [];
    const b = Array.isArray(cur) ? cur : [];
    return {
      added: b.filter(x => !a.includes(x)),
      removed: a.filter(x => !b.includes(x)),
    };
  };
  const reqDelta = diff(headManifest.permissions, stagedManifest.permissions);
  const optDelta = diff(headManifest.optional_permissions, stagedManifest.optional_permissions);
  const totalChanges = reqDelta.added.length + reqDelta.removed.length
    + optDelta.added.length + optDelta.removed.length;

  if (totalChanges === 0) return { changed: false };

  const docStaged = stagedFiles.some(
    f => f.startsWith('docs/store-submissions/') && f.endsWith('.md'),
  );
  return { changed: true, docStaged, reqDelta, optDelta, totalChanges };
}

// Use local node_modules/.bin binaries directly — no npm needed in PATH.
// This works in any environment (Husky, CI, broken global npm) because the
// binaries are always present after `npm install`.
const cwd = process.cwd();
const isWin = process.platform === 'win32';
const bin = (name) => path.join(cwd, 'node_modules', '.bin', name + (isWin ? '.cmd' : ''));

// Mirror the prod build chain from package.json without calling npm.
// Update here if package.json "build" script changes.
const buildProdCmd = [
  'node ./scripts/sync-version.mjs',
  `"${bin('rimraf')}" dist`,
  `"${bin('tsc')}" --project tsconfig.json`,
  'node ./scripts/copy-static.mjs',
  'node ./scripts/esbuild-prod.mjs',
].join(' && ');

const testCmd = `"${bin('vitest')}" run`;

function runCommand(command, description) {
  console.log(`\n🔨 RUNNING: ${description.toUpperCase()}`);
  console.log(`📝 Command: ${command}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);

  try {
    const startTime = Date.now();
    execSync(command, {
      stdio: 'inherit',
      shell: true,
      timeout: 300000, // 5 minute timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    const duration = Date.now() - startTime;
    console.log(`✅ SUCCESS: ${description} passed in ${duration}ms`);
    return true;
  } catch (error) {
    console.error(`\n❌ FAILURE: ${description} failed after ${Date.now() - Date.now()}ms`);
    console.error(`💥 Error code: ${error.status || 'unknown'}`);
    console.error(`📄 Error message: ${error.message}`);

    if (error.stdout) console.error(`📤 Stdout: ${error.stdout}`);
    if (error.stderr) console.error(`📥 Stderr: ${error.stderr}`);

    console.error(`\n🚨 CRITICAL: ${description} check failed!`);
    return false;
  }
}

function askToContinue() {
  return new Promise((resolve) => {
    console.log('\n🤔 Build checks failed. What would you like to do?');

    // Check if we're in an interactive environment
    const isInteractive = process.stdout.isTTY && process.stdin.isTTY && !process.env.CI;

    if (!isInteractive) {
      console.log('🤖 Non-interactive environment detected (CI/husky/non-TTY)');
      console.log('🚫 Automatically failing build checks to prevent bad commits');
      console.log('💡 Fix the issues above and try again');
      resolve(false);
      return;
    }

    console.log('🔍 Interactive environment detected');
    console.log('❓ You can choose to continue anyway (not recommended) or abort');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('\nDo you want to continue with the commit despite failures? (y/N): ', (answer) => {
      rl.close();
      const shouldContinue = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      console.log(`\n📝 User choice: ${shouldContinue ? 'CONTINUE' : 'ABORT'}`);
      resolve(shouldContinue);
    });
  });
}

async function main() {
  console.log('🚀 PRE-COMMIT HOOK STARTED');
  console.log('='.repeat(50));
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`📂 Working directory: ${process.cwd()}`);
  console.log(`🟢 Node version: ${process.version}`);
  console.log(`🖥️  Platform: ${process.platform}`);
  console.log(`🔧 Is TTY: stdout=${process.stdout.isTTY}, stdin=${process.stdin.isTTY}`);
  console.log(`🤖 CI Environment: ${process.env.CI ? 'YES' : 'NO'}`);
  console.log('='.repeat(50));

  const stagedFiles = getStagedFiles();

  // === Manifest permission discipline gate (runs BEFORE smart-skip) ===
  // Hard-fail when manifest.json's permission arrays change without a matching
  // docs/store-submissions/*.md edit staged in the same commit. This is the
  // last-line defense behind the v9.2.0 `idle` regression: even if the
  // operator forgot to run `--init`, even if they ignored the scaffolder's
  // PERMISSION DELTA banner, this gate refuses the commit.
  if (!process.env.FORCE_PRE_COMMIT) {
    const parity = checkPermissionDocParity(stagedFiles);
    if (parity.changed && !parity.docStaged) {
      console.log('\n🚫 PERMISSION DISCIPLINE FAIL');
      console.log('='.repeat(50));
      console.log('manifest.json permission array(s) changed but NO');
      console.log('docs/store-submissions/*.md is staged in this commit.');
      console.log('');
      console.log('Permission delta vs HEAD:');
      console.log(`  Required added:   ${JSON.stringify(parity.reqDelta.added)}`);
      console.log(`  Required removed: ${JSON.stringify(parity.reqDelta.removed)}`);
      console.log(`  Optional added:   ${JSON.stringify(parity.optDelta.added)}`);
      console.log(`  Optional removed: ${JSON.stringify(parity.optDelta.removed)}`);
      console.log('');
      console.log('Required action:');
      console.log('  1. Open docs/store-submissions/v<latest>-chrome-web-store.md');
      console.log('  2. Update Section 4 (Permission Justifications) for every added/removed perm');
      console.log('  3. git add docs/store-submissions/v<latest>-chrome-web-store.md');
      console.log('  4. git commit again');
      console.log('');
      console.log('Or, if scaffolding for a new release:');
      console.log('  npm run store init <new-version>');
      console.log('  (the scaffolder injects a PERMISSION DELTA banner showing exactly what to add)');
      console.log('');
      console.log('Escape hatch (NOT recommended — Chrome Web Store will reject):');
      console.log('  FORCE_PRE_COMMIT=1 git commit ...');
      console.log('='.repeat(50));
      process.exit(1);
    }
    if (parity.changed && parity.docStaged) {
      console.log(`\n✅ Manifest permission discipline: ${parity.totalChanges} perm change(s) staged with submission doc edit. Audit will run in 'npm run store check'.`);
    }
  } else if (process.env.FORCE_PRE_COMMIT) {
    // Surface the bypass loud — operator should know they're skipping the gate.
    const parity = checkPermissionDocParity(stagedFiles);
    if (parity.changed) {
      console.log(`\n⚠️  FORCE_PRE_COMMIT bypass — ${parity.totalChanges} manifest perm change(s) NOT verified against submission doc.`);
    }
  }

  // === Smart skip: only run builds if product files are staged ===
  let productFiles = [];
  if (stagedFiles !== null && stagedFiles.length > 0 && !process.env.FORCE_PRE_COMMIT) {
    productFiles = stagedFiles.filter(f => !SKIP_PATTERNS.some(p => p.test(f)));
    if (productFiles.length === 0) {
      console.log('📂 Only non-product files staged:');
      stagedFiles.forEach(f => console.log(`   ✅ ${f}`));
      console.log('\n⏭️  Skipping build checks — no product code changed.');
      console.log('💡 To force checks: FORCE_PRE_COMMIT=1 git commit ...');
      console.log('='.repeat(50));
      return; // Exit successfully, skip builds
    }
    console.log(`📂 ${stagedFiles.length} file(s) staged, ${productFiles.length} product file(s) — running full checks`);
    productFiles.forEach(f => console.log(`   🔧 ${f}`));
  } else if (process.env.FORCE_PRE_COMMIT) {
    console.log('🔒 FORCE_PRE_COMMIT set — running all checks regardless of file types');
  }

  // Auto-fix lint errors on staged .ts files before build.
  // Shift-left gate: code is corrected at commit time regardless of origin.
  const tsFiles = productFiles.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  if (tsFiles.length > 0) {
    console.log(`\n🧹 PHASE 0: Lint auto-fix (${tsFiles.length} TypeScript file(s))`);
    try {
      const lintCmd = `"${bin('eslint')}" --fix ${tsFiles.map(f => `"${f}"`).join(' ')}`;
      execSync(lintCmd, { stdio: 'inherit', shell: true, timeout: 30000 });
      execSync(`git add ${tsFiles.map(f => `"${f}"`).join(' ')}`, {
        stdio: 'inherit', shell: true, timeout: 10000
      });
      console.log('✅ Lint auto-fix complete — changes re-staged');
    } catch {
      console.log('⚠️  Lint auto-fix had issues (non-blocking, build will catch errors)');
    }
  }

  let allPassed = true;
  const results = [];

  // Run production build (blocking) — fail commit if this fails
  console.log('\n🏗️  PHASE 1: Build:prod (blocking)');
  const buildProdResult = runCommand(buildProdCmd, 'Build (prod)');
  results.push({ name: 'Build (prod)', passed: buildProdResult });
  if (!buildProdResult) allPassed = false;

  // Run tests (non-blocking) via local vitest binary
  console.log('\n🧪 PHASE 2: Test Suite (non-blocking)');
  const testResult = runCommand(testCmd, 'Vitest test suite');
  results.push({ name: 'Tests (non-blocking)', passed: testResult });

  // Summary
  console.log('\n📊 BUILD CHECK SUMMARY');
  console.log('='.repeat(30));
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name}`);
  });

  if (allPassed) {
    console.log('\n🎉 ALL CHECKS PASSED!');
    console.log('🚀 Proceeding with commit...');
    console.log('='.repeat(50));
    return; // Exit successfully, allowing commit to proceed
  } else {
    console.log('\n⚠️  SOME CHECKS FAILED!');
    console.log('💥 The following checks did not pass:');
    results.filter(r => !r.passed).forEach(result => {
      console.log(`   ❌ ${result.name}`);
    });

    const shouldContinue = await askToContinue();

    if (shouldContinue) {
      console.log('\n⚠️  CONTINUING WITH COMMIT DESPITE FAILURES');
      console.log('🚨 This is not recommended!');
      console.log('🔧 Please fix the issues and commit again');
      console.log('='.repeat(50));
      return; // Allow commit to proceed despite failures
    } else {
      console.log('\n🛑 COMMIT ABORTED');
      console.log('🔧 Fix the issues above and try again');
      console.log('='.repeat(50));
      process.exit(1); // Exit with error to prevent commit
    }
  }
}

// Run the pre-commit checks
(async () => {
  try {
    console.log('\n🔍 Starting pre-commit quality checks...\n');
    await main();
    console.log('\n✅ Pre-commit hook completed successfully');
  } catch (error) {
    console.error('\n💥 CRITICAL ERROR in pre-commit hook:');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    console.error('\n🚨 Hook failed with unhandled error');
    console.error('🔧 This should not happen - please report this bug');
    process.exit(1);
  }
})();