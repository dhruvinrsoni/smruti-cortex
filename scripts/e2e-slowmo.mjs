#!/usr/bin/env node
/**
 * Runs Playwright E2E tests with SLOW_MO set in-process so slow-motion works
 * reliably on Windows (PowerShell/cmd variable syntax is easy to get wrong).
 *
 * Usage:
 *   node scripts/e2e-slowmo.mjs              # default 400ms pause before each action
 *   node scripts/e2e-slowmo.mjs 600          # custom ms
 *   node scripts/e2e-slowmo.mjs 400 e2e/foo.spec.ts   # extra args passed to playwright
 */

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
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
