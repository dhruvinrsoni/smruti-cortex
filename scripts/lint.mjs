#!/usr/bin/env node

/**
 * lint.mjs — dispatcher for `npm run lint [strict] [...eslint flags]`.
 *
 *   npm run lint              -> eslint                       (default; warnings allowed)
 *   npm run lint strict       -> eslint --max-warnings 0      (CI-grade; zero warnings)
 *   npm run lint -- --fix     -> eslint --fix                 (flags forwarded)
 *   npm run lint strict -- --fix -> eslint --fix --max-warnings 0
 *
 * Single source of truth for the eslint flag set; both modes share it.
 */

import { spawnSync } from 'node:child_process';

const BASE_FLAGS = ['src', '--ext', '.ts,.tsx', '--report-unused-disable-directives'];

const args = process.argv.slice(2);
const first = args[0];

let extra, modeFlags;
if (first === 'strict') {
  modeFlags = ['--max-warnings', '0'];
  extra = args.slice(1);
} else if (first === undefined || first.startsWith('-')) {
  modeFlags = [];
  extra = args;
} else {
  console.error(`Unknown 'lint' subcommand: ${first}`);
  console.error('Usage: npm run lint [strict] [-- ...eslint flags]');
  process.exit(2);
}

const r = spawnSync('eslint', [...BASE_FLAGS, ...modeFlags, ...extra], {
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
