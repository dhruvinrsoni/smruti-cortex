#!/usr/bin/env node

/**
 * test.mjs — tiny dispatcher for `npm run test [watch] [...vitest args]`.
 *
 *   npm run test                  -> vitest run                    (one-shot, CI-safe; the default)
 *   npm run test -- --reporter=x  -> vitest run --reporter=x       (flags forwarded)
 *   npm run test watch            -> vitest                        (watch mode for local dev)
 *   npm run test watch -- foo     -> vitest foo                    (watch + filter, flags forwarded)
 *
 * Coverage and E2E are intentionally NOT subcommands here — they're top-level
 * verbs (`npm run coverage`, `npm run e2e`) because both terms are unambiguous
 * in JS dev parlance. See plan: scripts_and_npm_refactor / Naming principles.
 */

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const first = args[0];

let bin, vitestArgs;
if (first === 'watch') {
  bin = 'vitest';
  vitestArgs = args.slice(1);
} else if (first === undefined || first.startsWith('-')) {
  // No subcommand or only flags -> default 'run' subcommand, forward all flags.
  bin = 'vitest';
  vitestArgs = ['run', ...args];
} else {
  console.error(`Unknown 'test' subcommand: ${first}`);
  console.error('Usage: npm run test [watch] [-- ...vitest flags]');
  process.exit(2);
}

const r = spawnSync(bin, vitestArgs, { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
