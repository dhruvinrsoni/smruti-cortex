#!/usr/bin/env node
/**
 * e2e-slowmo.mjs — Run Playwright E2E tests with SLOW_MO for visual debugging.
 *
 * Sets the SLOW_MO environment variable in-process so slow-motion works
 * reliably on Windows (PowerShell/cmd variable syntax is easy to get wrong).
 * The fixture in e2e/fixtures/extension.ts reads SLOW_MO and patches
 * Locator.prototype to add a delay before each action (click, fill, etc.).
 *
 * Requires dist/ to exist (run `npm run build:prod` first if stale).
 * See docs/E2E_TESTING.md for the full slow-mo architecture.
 *
 * Usage:
 *   node scripts/e2e-slowmo.mjs              # default 400ms pause
 *   node scripts/e2e-slowmo.mjs 800          # custom delay (ms)
 *   node scripts/e2e-slowmo.mjs 400 e2e/popup-smoke.spec.ts  # single spec
 *   node scripts/e2e-slowmo.mjs -h           # show this help
 */

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
e2e-slowmo.mjs — Run Playwright E2E tests with visual slow-motion.

Usage:
  node scripts/e2e-slowmo.mjs [delay_ms] [playwright args...]

Arguments:
  delay_ms    Milliseconds to pause before each browser action (default: 400)
  ...rest     Extra arguments forwarded to \`npx playwright test\`

Examples:
  node scripts/e2e-slowmo.mjs              # 400ms default
  node scripts/e2e-slowmo.mjs 800          # slower — easier to watch
  node scripts/e2e-slowmo.mjs 400 e2e/popup-smoke.spec.ts
  node scripts/e2e-slowmo.mjs 1000 -g "search"

Environment:
  SLOW_MO   Overrides the default delay if no positional ms argument given

Prerequisite:
  dist/ must exist — run \`npm run build:prod\` if stale.
`.trim());
  process.exit(0);
}

let ms = process.env.SLOW_MO || '400';
const extra = [];

if (args.length > 0 && /^\d+$/.test(args[0])) {
  ms = args[0];
  extra.push(...args.slice(1));
} else {
  extra.push(...args);
}

process.env.SLOW_MO = ms;

const result = spawnSync(
  'npx',
  ['playwright', 'test', ...extra],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, SLOW_MO: ms },
  },
);

process.exit(result.status ?? 1);
