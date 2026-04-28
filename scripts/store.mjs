#!/usr/bin/env node

/**
 * store.mjs — dispatcher for `npm run store <subcommand> [args...]`.
 *
 *   npm run store check    -> store-check.mjs           (CWS submission audit)
 *   npm run store init     -> store-check.mjs --init    (scaffold new vX.Y.Z doc)
 *   npm run store unpack   -> strip-metadata.mjs        (un-pack CWS download)
 *
 * Each subcommand forwards remaining args to its underlying script unchanged
 * (e.g. `npm run store check 9.3.0` -> `node ./scripts/store-check.mjs 9.3.0`).
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scripts = (name, ...extra) => ['node', [join(__dirname, name), ...extra]];

const args = process.argv.slice(2);
const sub = args[0];
const rest = args.slice(1);

const ROUTES = {
  check:  () => scripts('store-check.mjs', ...rest),
  init:   () => scripts('store-check.mjs', '--init', ...rest),
  unpack: () => scripts('strip-metadata.mjs', ...rest),
};

if (!sub || !(sub in ROUTES)) {
  if (sub) console.error(`Unknown 'store' subcommand: ${sub}`);
  console.error('Usage: npm run store <check|init|unpack> [args...]');
  console.error('  check   Verify CWS submission readiness (manifest <-> doc parity, zip, CHANGELOG, etc.)');
  console.error('  init    Scaffold a new docs/store-submissions/vX.Y.Z-chrome-web-store.md');
  console.error('  unpack  Strip _metadata/ from a CWS-downloaded extension folder for "Load Unpacked"');
  process.exit(sub ? 2 : 0);
}

const [bin, binArgs] = ROUTES[sub]();
const r = spawnSync(bin, binArgs, { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
