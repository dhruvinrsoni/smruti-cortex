#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

// Use local node_modules/.bin binaries directly — no npm needed in PATH.
// This works in any environment (Husky, CI, broken global npm) because the
// binaries are always present after `npm install`.
const cwd = process.cwd();
const isWin = process.platform === 'win32';
const bin = (name) => path.join(cwd, 'node_modules', '.bin', name + (isWin ? '.cmd' : ''));

// Mirror the build chains from package.json without calling npm.
// Update here if package.json "build" or "build:prod" scripts change.
const buildDevCmd = [
  'node ./scripts/sync-version.mjs',
  `"${bin('rimraf')}" dist`,
  `"${bin('tsc')}" --project tsconfig.json`,
  'node ./scripts/copy-static.mjs',
  'node ./scripts/esbuild-dev.mjs',
].join(' && ');

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

  let allPassed = true;
  const results = [];

  // Run build (blocking) — fail commit if this fails
  console.log('\n🏗️  PHASE 1: Build (blocking)');
  const buildResult = runCommand(buildDevCmd, 'Build (dev)');
  results.push({ name: 'Build (dev)', passed: buildResult });
  if (!buildResult) allPassed = false;

  // Run production build (blocking) — fail commit if this fails
  console.log('\n🏗️  PHASE 1b: Build:prod (blocking)');
  const buildProdResult = runCommand(buildProdCmd, 'Build (prod)');
  results.push({ name: 'Build (prod)', passed: buildProdResult });
  if (!buildProdResult) allPassed = false;

  // Run tests (non-blocking) via local vitest binary
  console.log('\n🧪 PHASE 3: Test Suite (non-blocking)');
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