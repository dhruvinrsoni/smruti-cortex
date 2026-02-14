#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');

function runCommand(command, description) {
  try {
    console.log(`🔨 Running ${description}...`);
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} passed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed`);
    return false;
  }
}

function askToContinue() {
  return new Promise((resolve) => {
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

  let allPassed = true;

  // Run regular build
  if (!runCommand('npm run build', 'npm run build')) {
    allPassed = false;
  }

  // Run production build
  if (!runCommand('npm run build:prod', 'npm run build:prod')) {
    allPassed = false;
  }

  if (allPassed) {
    console.log('\n🎉 All builds passed! Proceeding with commit.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some builds failed.');
    const shouldContinue = await askToContinue();
    if (shouldContinue) {
      console.log('Continuing with commit...');
      process.exit(0);
    } else {
      console.log('Commit aborted.');
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Error in pre-commit hook:', error);
  process.exit(1);
});