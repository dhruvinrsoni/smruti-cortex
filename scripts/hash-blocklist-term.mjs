#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// Generate a salted SHA-256 hash line for scripts/blocklist-terms.txt.
//
// Usage (argv):
//     node scripts/hash-blocklist-term.mjs "<term>"
//
// Usage (stdin, preferred — keeps the literal out of shell history):
//     node scripts/hash-blocklist-term.mjs --stdin
//     <type the term, press Enter, then Ctrl-D / Ctrl-Z>
//
// Output (stdout, one line per input term):
//     hash:<length>:<sha256-hex-64>
//
// Paste that line into scripts/blocklist-terms.txt. The literal term never
// touches any tracked file — only the hash does.
// ──────────────────────────────────────────────────────────────────────────────

import { hashTermSalted } from './check-blocklist.mjs';

function emit(raw) {
  const term = String(raw).trim().toLowerCase();
  if (!term) return;
  const hex = hashTermSalted(term);
  process.stdout.write('hash:' + term.length + ':' + hex + '\n');
}

async function readStdin() {
  return new Promise((resolveP) => {
    let buf = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => resolveP(buf));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stderr.write(
      'Usage:\n' +
      '  node scripts/hash-blocklist-term.mjs "<term>"\n' +
      '  node scripts/hash-blocklist-term.mjs --stdin   # one term per line\n'
    );
    process.exit(argv.length === 0 ? 2 : 0);
  }

  if (argv[0] === '--stdin') {
    const raw = await readStdin();
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim()) emit(line);
    }
    return;
  }

  for (const arg of argv) emit(arg);
}

main().catch((err) => {
  process.stderr.write('error: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exit(1);
});
