#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');

function runCommand(command, description) {
  try {
    console.log(`🔨 Running ${description}...`);
    console.log(`Command: ${command}`);
    execSync(command, { stdio: 'inherit', timeout: 300000 }); // 5 minute timeout
    console.log(`✅ ${description} passed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed`);
    console.error(`Error: ${error.message}`);
    return false;
  }
}

function askToContinue() {
  return new Promise((resolve) => {
    // In non-interactive environments (like CI or husky), don't ask and just fail
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      console.log('Non-interactive environment detected, failing build checks.');
      resolve(false);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Build(s) failed. Do you want to continue with the commit? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  console.log('🔍 Pre-commit hook: Checking builds...\n');
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Node version: ${process.version}`);
  console.log(`Is TTY: stdout=${process.stdout.isTTY}, stdin=${process.stdin.isTTY}\n`);

  let allPassed = true;

  // Run TypeScript compilation
  if (!runCommand('npm run tsc', 'TypeScript compilation')) {
    allPassed = false;
  }

  // Run linting
  if (!runCommand('npm run lint:release', 'linting')) {
    allPassed = false;
  }

  // Run tests
  if (!runCommand('npm test', 'tests')) {
    allPassed = false;
  }

  if (allPassed) {
    console.log('\n🎉 All builds passed! Proceeding with commit.');
    return; // Exit successfully, allowing commit to proceed
  } else {
    console.log('\n⚠️  Some builds failed.');
    const shouldContinue = await askToContinue();
    if (shouldContinue) {
      console.log('Continuing with commit...');
      return; // Allow commit to proceed despite failures
    } else {
      console.log('Commit aborted.');
      process.exit(1); // Only exit with error when user explicitly chooses to abort
    }
  }
}

// Run the pre-commit checks
(async () => {
  try {
    await main();
  } catch (error) {
    console.error('Error in pre-commit hook:', error);
    process.exit(1);
  }
})();