#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// SmrutiCortex Repository Blocklist Scanner
// ──────────────────────────────────────────────────────────────────────────────
// Scans file CONTENTS for terms defined in scripts/blocklist-terms.txt.
//
// Usage:
//   node scripts/check-blocklist.mjs                # scan staged files (default)
//   node scripts/check-blocklist.mjs --all          # scan every tracked file
//   node scripts/check-blocklist.mjs --changed <base>  # PR mode: changes vs <base>
//   node scripts/check-blocklist.mjs --files a b c  # scan a fixed set of files
//   node scripts/check-blocklist.mjs --verbose      # show literals for SOFT hits only
//
// Exit codes:
//   0 = no hits
//   1 = one or more blocklist hits (commit / CI should fail)
//   2 = usage / configuration error
//
// Design notes
// ──────────────────────────────────────────────────────────────────────────────
//   - The terms file contains NO sensitive literals. Hard-blocked terms are
//     stored as salted SHA-256 hashes (line prefix `hash:<len>:<hex64>`), so
//     this repository can be published without leaking the very strings the
//     blocklist exists to contain. Soft-blocked terms (generic feature names)
//     remain plain because they are not sensitive.
//   - Add a new hard term locally with:
//         node scripts/hash-blocklist-term.mjs "<term>"
//     and paste the resulting `hash:...` line into scripts/blocklist-terms.txt.
//     The literal never enters any tracked file.
//   - Output always redacts the matched substring for hashed hits (independent
//     of --verbose / --ci), because finding a hard-term literal in the repo
//     already means it is sensitive. Soft-term output follows the usual
//     local-vs-CI rule.
//   - File PATHS are never scanned, only file contents. Developer machines
//     may have vendor strings in home-directory paths that are outside the
//     repo's control.
//   - Pure helpers are exported for unit testing (see
//     scripts/__tests__/check-blocklist.test.mjs).
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const TERMS_FILE_REL = 'scripts/blocklist-terms.txt';
const SELF_EXEMPT_REL = new Set([
  'scripts/blocklist-terms.txt',
  'scripts/check-blocklist.mjs',
  'scripts/hash-blocklist-term.mjs',
  'scripts/__tests__/check-blocklist.test.mjs',
]);

// Committed salt. Threat model here is accidental leakage, not an adversarial
// brute-force — the salt simply raises the bar above "paste the hash into a
// rainbow-table search" and forces a local hashing loop to reverse. Bumping
// the salt is a breaking change for the terms file.
export const HASH_SALT = 'smruticortex-blocklist-v1';

const MAX_FILE_BYTES = 1_000_000;
const BINARY_SNIFF_BYTES = 8192;

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for testing)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Salted SHA-256 of a lowercased term. Used for both terms-file entries and
 * for candidate substrings during scanning. Shared helper so both sides stay
 * byte-compatible.
 */
export function hashTermSalted(term) {
  return createHash('sha256')
    .update(HASH_SALT, 'utf-8')
    .update('\n', 'utf-8')
    .update(String(term).toLowerCase(), 'utf-8')
    .digest('hex');
}

/**
 * Parse the raw terms-file contents into:
 *   { hardHashes: Map<length, Set<hex>>, soft: string[] }
 *
 * Supported line kinds (after trim; '#'-comments and blank lines ignored):
 *   hash:<length>:<sha256-hex-64>   → hard term, stored by length for fast window sizing
 *   soft:<literal>                  → soft term (literal, not sensitive)
 *
 * Anything else is ignored with a silent skip. Hard terms MUST be provided as
 * hashes — literal hard-term lines are rejected by design so that the terms
 * file is safe to publish.
 */
export function parseTermsFile(raw) {
  const hardHashes = new Map();
  const soft = [];
  for (const rawLine of String(raw).split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const lowered = line.toLowerCase();

    if (lowered.startsWith('hash:')) {
      const rest = line.slice('hash:'.length);
      const m = /^(\d+):([0-9a-f]{64})$/i.exec(rest);
      if (!m) continue;
      const len = Number.parseInt(m[1], 10);
      if (!Number.isFinite(len) || len <= 0) continue;
      const hex = m[2].toLowerCase();
      if (!hardHashes.has(len)) hardHashes.set(len, new Set());
      hardHashes.get(len).add(hex);
      continue;
    }

    if (lowered.startsWith('soft:')) {
      const term = line.slice('soft:'.length).trim().toLowerCase();
      if (term) soft.push(term);
      continue;
    }

    // Unknown line format — silently ignore. (We deliberately do NOT fall back
    // to treating it as a literal hard term; see design notes above.)
  }
  return { hardHashes, soft };
}

/** Normalize a path to forward-slash form. */
export function normalizePath(p) {
  return String(p).replace(/\\/g, '/');
}

/**
 * Soft-scope rule: soft terms are ALLOWED only inside non-test product
 * sources under src/ (TypeScript, plus product HTML / CSS that ships inside
 * the extension bundle), and inside machine-generated coverage reports that
 * literally embed those sources. This matches the Phase-B plan's decision
 * that certain feature names must exist in source to function, but must
 * never appear in docs, examples, tests, or user-facing copy outside those
 * generated / bundled surfaces.
 */
export function isSoftAllowedPath(relPath) {
  const p = normalizePath(relPath);

  if (p.startsWith('docs/quality-report/coverage/')) return true;

  if (!p.startsWith('src/')) return false;
  if (!/\.(ts|tsx|html|css)$/.test(p)) return false;
  if (p.includes('/__tests__/')) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(p)) return false;
  if (p.startsWith('src/__test-utils__/')) return false;
  return true;
}

/** Repo-relative paths that must never be scanned. */
export function isSelfExempt(relPath) {
  return SELF_EXEMPT_REL.has(normalizePath(relPath));
}

/**
 * Returns the terms that apply to a given file:
 *   { hardHashes, soft }
 * Self-exempt files get nothing. Soft-allowed paths get hard hashes only.
 * Everything else gets the full set.
 */
export function termsForPath(relPath, { hardHashes, soft }) {
  if (isSelfExempt(relPath)) {
    return { hardHashes: new Map(), soft: [] };
  }
  if (isSoftAllowedPath(relPath)) {
    return { hardHashes, soft: [] };
  }
  return { hardHashes, soft };
}

/** Best-effort binary detection: NUL byte in the first ~8 KB. */
export function looksBinary(buf) {
  const len = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

/**
 * Scan text for both hashed hard terms and literal soft terms.
 * Returns `[{ kind, term, line, col, snippet, length? }]`.
 *
 *   kind === 'hard'  → matched a hashed term. `term` is '#<hash-prefix>'.
 *   kind === 'soft'  → matched a literal soft term. `term` is the literal.
 *
 * Hashed hits are always reported with the literal substring redacted from
 * the snippet. Soft hits return the raw snippet; the CLI chooses whether to
 * redact at print time.
 *
 * Honors the line-level allow pragmas:
 *   - "blocklist-allow"       on the same line → skip that line
 *   - "blocklist-allow-next"  on the previous non-empty line → skip the next
 */
export function scanText(text, terms, hashCache) {
  const { hardHashes, soft } = normalizeTerms(terms);
  if (hardHashes.size === 0 && soft.length === 0) return [];

  const cache = hashCache instanceof Map ? hashCache : new Map();
  const lines = String(text).split(/\r?\n/);
  const hits = [];

  const softSorted = soft.length > 0 ? [...soft].sort((a, b) => b.length - a.length) : [];

  let skipNext = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (skipNext) { skipNext = false; continue; }
    if (/blocklist-allow-next/.test(lower)) { skipNext = true; continue; }
    if (/blocklist-allow\b/.test(lower)) continue;

    // Soft-literal hits (plain substring, same as before).
    for (const term of softSorted) {
      let from = 0;
      while (from < lower.length) {
        const idx = lower.indexOf(term, from);
        if (idx === -1) break;
        hits.push({
          kind: 'soft',
          term,
          line: i + 1,
          col: idx + 1,
          snippet: buildSnippet(line, idx, term.length),
        });
        from = idx + term.length;
      }
    }

    // Hash hits. Walk each identifier-ish run (`[a-z0-9.]+`) and, for every
    // requested window length, hash each substring and probe the set. The
    // cache dedups repeated substrings within the same scan.
    if (hardHashes.size > 0) {
      const tokenRe = /[a-z0-9.]+/g;
      let m;
      while ((m = tokenRe.exec(lower)) !== null) {
        const token = m[0];
        const tokenStart = m.index;
        for (const [L, hashSet] of hardHashes) {
          if (token.length < L) continue;
          for (let k = 0; k + L <= token.length; k++) {
            const sub = token.slice(k, k + L);
            let hex = cache.get(sub);
            if (hex === undefined) {
              hex = hashTermSalted(sub);
              cache.set(sub, hex);
            }
            if (hashSet.has(hex)) {
              const col = tokenStart + k + 1;
              hits.push({
                kind: 'hard',
                term: '#' + hex.slice(0, 8),
                length: L,
                line: i + 1,
                col,
                snippet: buildRedactedSnippet(line, tokenStart + k, L),
              });
            }
          }
        }
      }
    }
  }
  return hits;
}

/** Build a ±24-char snippet centered on the match, trimmed to single-line. */
export function buildSnippet(line, idx, len) {
  const before = Math.max(0, idx - 24);
  const after = Math.min(line.length, idx + len + 24);
  const prefix = before > 0 ? '…' : '';
  const suffix = after < line.length ? '…' : '';
  return (prefix + line.slice(before, after) + suffix).replace(/\s+/g, ' ');
}

/**
 * Like buildSnippet, but replaces the matched range with a length-bucketed
 * marker so the literal never reaches the output. Used for hashed hits.
 */
export function buildRedactedSnippet(line, idx, len) {
  const before = Math.max(0, idx - 24);
  const after = Math.min(line.length, idx + len + 24);
  const prefix = before > 0 ? '…' : '';
  const suffix = after < line.length ? '…' : '';
  const mid = line.slice(before, idx) + '[R×' + len + ']' + line.slice(idx + len, after);
  return (prefix + mid + suffix).replace(/\s+/g, ' ');
}

/** 8-char hash prefix used to reference a term without logging its literal. */
export function hashPrefix(value) {
  return createHash('sha1').update(String(value), 'utf8').digest('hex').slice(0, 8);
}

/** Replace the literal term inside a snippet with a redacted marker. */
export function redactSnippet(snippet, term) {
  if (!term) return snippet;
  const safe = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return snippet.replace(new RegExp(safe, 'gi'), (m) => '[R×' + m.length + ']');
}

/**
 * Accept several shapes for backward compatibility:
 *   - Array of literal soft terms (legacy tests).
 *   - { hardHashes: Map, soft: string[] } (primary).
 *   - { hard: string[] } (legacy: literal hard terms — treated as soft).
 */
function normalizeTerms(terms) {
  if (Array.isArray(terms)) return { hardHashes: new Map(), soft: terms };
  if (!terms || typeof terms !== 'object') return { hardHashes: new Map(), soft: [] };

  const hardHashes = terms.hardHashes instanceof Map ? terms.hardHashes : new Map();
  let soft = Array.isArray(terms.soft) ? terms.soft.slice() : [];
  if (Array.isArray(terms.hard) && terms.hardHashes === undefined) {
    soft = soft.concat(terms.hard);
  }
  return { hardHashes, soft };
}

// ──────────────────────────────────────────────────────────────────────────────
// I/O + orchestration
// ──────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { mode: 'staged', base: null, files: [], verbose: false, ci: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.mode = 'all';
    else if (a === '--staged') out.mode = 'staged';
    else if (a === '--changed') { out.mode = 'changed'; out.base = argv[++i]; }
    else if (a === '--files') { out.mode = 'files'; while (argv[i + 1] && !argv[i + 1].startsWith('--')) out.files.push(argv[++i]); }
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--ci') out.ci = true;
    else if (a === '-h' || a === '--help') { out.mode = 'help'; }
    else { console.error('Unknown argument: ' + a); process.exit(2); }
  }
  return out;
}

function printHelp() {
  const script = 'scripts/check-blocklist.mjs';
  console.log('Usage: node ' + script + ' [options]');
  console.log('');
  console.log('Options:');
  console.log('  --staged             Scan staged files (default)');
  console.log('  --all                Scan every tracked file');
  console.log('  --changed <base>     Scan files changed vs <base> (e.g., origin/main)');
  console.log('  --files <a> <b> ...  Scan a fixed set of paths');
  console.log('  --verbose            Show literal soft terms/snippets (ignored when --ci)');
  console.log('  --ci                 Force CI-style redacted output for soft hits');
  console.log('  -h, --help           Show this help');
  console.log('');
  console.log('Hard hits are always reported with literals redacted, regardless of flags.');
}

function listStagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    cwd: REPO_ROOT, encoding: 'utf-8',
  });
  return out.split(/\r?\n/).filter(Boolean);
}

function listAllTrackedFiles() {
  const out = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf-8' });
  return out.split(/\r?\n/).filter(Boolean);
}

function listChangedFiles(base) {
  const out = execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`, {
    cwd: REPO_ROOT, encoding: 'utf-8',
  });
  return out.split(/\r?\n/).filter(Boolean);
}

function readStagedContent(relPath) {
  try {
    return execSync(`git show :"${relPath}"`, {
      cwd: REPO_ROOT, encoding: 'buffer', stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

function readDiskContent(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  try {
    if (!existsSync(abs)) return null;
    const s = statSync(abs);
    if (!s.isFile()) return null;
    if (s.size > MAX_FILE_BYTES) return null;
    return readFileSync(abs);
  } catch {
    return null;
  }
}

async function run(argv) {
  const opts = parseArgs(argv);
  if (opts.mode === 'help') { printHelp(); return 0; }

  const termsPath = resolve(REPO_ROOT, TERMS_FILE_REL);
  if (!existsSync(termsPath)) {
    console.error('Blocklist terms file missing: ' + TERMS_FILE_REL);
    return 2;
  }
  const terms = parseTermsFile(readFileSync(termsPath, 'utf-8'));
  if (terms.hardHashes.size === 0 && terms.soft.length === 0) {
    console.error('Blocklist terms file has no hard hashes or soft literals: ' + TERMS_FILE_REL);
    return 2;
  }

  const isCI = opts.ci || process.env.CI === 'true';
  const redactSoft = isCI && !opts.verbose;

  let files;
  if (opts.mode === 'staged') files = listStagedFiles();
  else if (opts.mode === 'all') files = listAllTrackedFiles();
  else if (opts.mode === 'changed') {
    if (!opts.base) { console.error('--changed requires <base>'); return 2; }
    files = listChangedFiles(opts.base);
  } else if (opts.mode === 'files') files = opts.files;
  else { printHelp(); return 2; }

  if (files.length === 0) {
    console.log('[blocklist] No files to scan.');
    return 0;
  }

  const readContent = opts.mode === 'staged' ? readStagedContent : readDiskContent;
  const hashCache = new Map();
  const allHits = [];

  for (const rel of files) {
    const relN = normalizePath(rel);
    if (isSelfExempt(relN)) continue;
    const applicable = termsForPath(relN, terms);
    if (applicable.hardHashes.size === 0 && applicable.soft.length === 0) continue;

    const buf = readContent(rel);
    if (!buf) continue;
    if (looksBinary(buf)) continue;
    if (buf.length > MAX_FILE_BYTES) continue;

    const text = buf.toString('utf-8');
    const hits = scanText(text, applicable, hashCache);
    for (const h of hits) {
      allHits.push({ file: relN, ...h });
    }
  }

  if (allHits.length === 0) {
    console.log('[blocklist] OK — scanned ' + files.length + ' file(s), 0 hit(s).');
    return 0;
  }

  console.error('[blocklist] FAIL — ' + allHits.length + ' hit(s) across ' + new Set(allHits.map((h) => h.file)).size + ' file(s):');
  console.error('');
  for (const h of allHits) {
    let label;
    let snippet;
    if (h.kind === 'hard') {
      label = 'hard=' + h.term;
      snippet = h.snippet;
    } else {
      label = redactSoft ? 'soft=#' + hashPrefix(h.term) : 'soft="' + h.term + '"';
      snippet = redactSoft ? redactSnippet(h.snippet, h.term) : h.snippet;
    }
    console.error('  ' + h.file + ':' + h.line + ':' + h.col + '  ' + label);
    console.error('      context: ' + snippet);
  }
  console.error('');
  console.error('Blocked terms are configured in ' + TERMS_FILE_REL + '.');
  console.error('Hard hits are redacted by design — use the hash prefix above to');
  console.error('correlate with the local blocklist. Remove the offending text or,');
  console.error('if the match is a genuine false positive, add a line-level pragma:');
  console.error('    // blocklist-allow    (same-line)');
  console.error('    // blocklist-allow-next   (following line)');
  console.error('Use sparingly. Pragmas themselves are reviewed.');
  return 1;
}

// Entry point — only when executed directly.
const invokedDirect = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (invokedDirect) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
