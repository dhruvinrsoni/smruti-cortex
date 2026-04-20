#!/usr/bin/env node

/**
 * verify.mjs — Full codebase verification pipeline.
 *
 * Runs ALL checks regardless of individual failures so you get a complete
 * picture in one go. Exit code is non-zero if any step fails.
 *
 * Steps: lint → build:prod → unit tests + coverage → E2E tests
 *
 * Usage:
 *   npm run verify                    # run everything (E2E at full speed)
 *   npm run verify -- --no-e2e        # skip E2E (faster, ~2min)
 *   npm run verify -- --e2e-slowmo    # run E2E with SLOW_MO (visual debugging)
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const skipE2E = process.argv.includes('--no-e2e');
const e2eSlowMo = process.argv.includes('--e2e-slowmo');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const results = [];

function step(name, cmd) {
  console.log(`\n${BOLD}${CYAN}▶ ${name}${RESET}`);
  console.log(`${DIM}  ${cmd}${RESET}\n`);
  const t0 = Date.now();
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', shell: true, timeout: 600_000 });
    const ms = Date.now() - t0;
    results.push({ name, passed: true, ms });
    console.log(`${GREEN}  ✅ ${name} passed (${(ms / 1000).toFixed(1)}s)${RESET}`);
  } catch {
    const ms = Date.now() - t0;
    results.push({ name, passed: false, ms });
    console.log(`${RED}  ❌ ${name} FAILED (${(ms / 1000).toFixed(1)}s)${RESET}`);
  }
}

console.log(`${BOLD}${'═'.repeat(50)}${RESET}`);
console.log(`${BOLD}  SmrutiCortex — Full Verification${RESET}`);
console.log(`${'═'.repeat(50)}`);

step('Lint', 'npm run lint');
step('Build (prod)', 'npm run build:prod');
step('Unit Tests + Coverage', 'npx vitest run --coverage');
step('Coverage Ratchet', 'node scripts/coverage-ratchet.mjs');

if (skipE2E) {
  results.push({ name: 'E2E Tests', passed: true, ms: 0, skipped: true });
  console.log(`\n${DIM}  ⏭️  E2E tests skipped (--no-e2e)${RESET}`);
} else if (e2eSlowMo) {
  step('E2E Tests (slow-mo)', 'node ./scripts/e2e-slowmo.mjs');
} else {
  step('E2E Tests', 'npx playwright test');
}

// Summary
console.log(`\n${BOLD}${'═'.repeat(50)}${RESET}`);
console.log(`${BOLD}  VERIFICATION SUMMARY${RESET}`);
console.log(`${'═'.repeat(50)}`);

const totalMs = results.reduce((s, r) => s + r.ms, 0);
for (const r of results) {
  const icon = r.skipped ? '⏭️ ' : r.passed ? '✅' : '❌';
  const time = r.skipped ? 'skipped' : `${(r.ms / 1000).toFixed(1)}s`;
  console.log(`  ${icon} ${r.name.padEnd(28)} ${time}`);
}
console.log(`${'─'.repeat(50)}`);
console.log(`  Total: ${(totalMs / 1000).toFixed(1)}s`);

const failed = results.filter(r => !r.passed);
if (failed.length === 0) {
  console.log(`\n${GREEN}${BOLD}  ✅ ALL CHECKS PASSED${RESET}\n`);
} else {
  console.log(`\n${RED}${BOLD}  ❌ ${failed.length} CHECK(S) FAILED:${RESET}`);
  for (const f of failed) {
    console.log(`${RED}     - ${f.name}${RESET}`);
  }
  console.log();
}

process.exit(failed.length > 0 ? 1 : 0);
