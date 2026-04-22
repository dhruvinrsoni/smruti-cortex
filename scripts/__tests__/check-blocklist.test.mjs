// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for scripts/check-blocklist.mjs
// ──────────────────────────────────────────────────────────────────────────────
// Run with:   node --test scripts/__tests__/check-blocklist.test.mjs
//
// These tests exercise the pure helpers with SYNTHETIC markers only — no real
// blocklist term literals appear in this file. This file is also listed as
// self-exempt by the scanner as defense-in-depth.
// ──────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HASH_SALT,
  hashTermSalted,
  parseTermsFile,
  normalizePath,
  isSoftAllowedPath,
  isSelfExempt,
  termsForPath,
  scanText,
  buildSnippet,
  buildRedactedSnippet,
  hashPrefix,
  redactSnippet,
  looksBinary,
} from '../check-blocklist.mjs';

// Synthetic markers — tests must never depend on a real hard term. Purely
// alphanumeric so they survive the scanner's identifier-tokenizer (which
// splits on any non `[a-z0-9.]` char). Collision with real English is
// vanishingly unlikely.
const SYN_ALPHA = 'xblockedalphax';   // length 14
const SYN_BETA  = 'xblockedbetax';    // length 13
const SYN_GAMMA = 'xblockedgammax';   // length 14

const HASH_ALPHA = hashTermSalted(SYN_ALPHA);
const HASH_BETA  = hashTermSalted(SYN_BETA);

function makeTerms({ hard = [], soft = [] } = {}) {
  const hardHashes = new Map();
  for (const literal of hard) {
    const hex = hashTermSalted(literal);
    const L = literal.length;
    if (!hardHashes.has(L)) hardHashes.set(L, new Set());
    hardHashes.get(L).add(hex);
  }
  return { hardHashes, soft };
}

// ──────────────────────────────────────────────────────────────────────────────
// hashTermSalted
// ──────────────────────────────────────────────────────────────────────────────

test('hashTermSalted: deterministic 64-char lowercase hex', () => {
  const h1 = hashTermSalted('anything');
  const h2 = hashTermSalted('anything');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('hashTermSalted: case-insensitive (lowercases the input)', () => {
  assert.equal(hashTermSalted('ABC'), hashTermSalted('abc'));
});

test('hashTermSalted: different salt would produce different digest (smoke)', () => {
  // Just ensure our salt is actually baked in: hashing 'SALT' + term directly
  // with the WRONG separator should NOT match the helper's output.
  assert.notEqual(hashTermSalted('x'), hashTermSalted(HASH_SALT + 'x'));
});

// ──────────────────────────────────────────────────────────────────────────────
// parseTermsFile
// ──────────────────────────────────────────────────────────────────────────────

test('parseTermsFile: parses hash lines into length-keyed sets', () => {
  const raw = [
    '# comment',
    '',
    'hash:' + SYN_ALPHA.length + ':' + HASH_ALPHA,
    'hash:' + SYN_BETA.length + ':' + HASH_BETA,
    'soft:gamma',
    '  soft:  delta  ',
  ].join('\n');

  const out = parseTermsFile(raw);
  assert.ok(out.hardHashes.get(SYN_ALPHA.length).has(HASH_ALPHA));
  assert.ok(out.hardHashes.get(SYN_BETA.length).has(HASH_BETA));
  assert.deepEqual(out.soft, ['gamma', 'delta']);
});

test('parseTermsFile: rejects literal (non-hash, non-soft) lines silently', () => {
  // This is a safety property: the terms file must be publishable, so any
  // attempt to add a plain-literal hard term is ignored rather than picked
  // up as a soft term.
  const raw = ['literal_not_allowed', 'soft:kept'].join('\n');
  const out = parseTermsFile(raw);
  assert.equal(out.hardHashes.size, 0);
  assert.deepEqual(out.soft, ['kept']);
});

test('parseTermsFile: ignores malformed hash lines', () => {
  const raw = [
    'hash:abc:not-a-number',
    'hash:5:not-hex',
    'hash:5:' + 'z'.repeat(64),
    'hash:5:' + 'a'.repeat(63),
  ].join('\n');
  const out = parseTermsFile(raw);
  assert.equal(out.hardHashes.size, 0);
});

test('parseTermsFile: ignores BOM and blank lines', () => {
  const raw = '\uFEFFsoft:alpha\n\n\nsoft:beta\n';
  const out = parseTermsFile(raw);
  assert.deepEqual(out.soft, ['alpha', 'beta']);
});

test('parseTermsFile: tolerates empty / comment-only input', () => {
  const out = parseTermsFile('# just a comment\n\n');
  assert.equal(out.hardHashes.size, 0);
  assert.deepEqual(out.soft, []);
});

// ──────────────────────────────────────────────────────────────────────────────
// normalizePath
// ──────────────────────────────────────────────────────────────────────────────

test('normalizePath: converts backslashes to forward slashes', () => {
  assert.equal(normalizePath('src\\foo\\bar.ts'), 'src/foo/bar.ts');
  assert.equal(normalizePath('src/foo/bar.ts'), 'src/foo/bar.ts');
});

// ──────────────────────────────────────────────────────────────────────────────
// isSoftAllowedPath
// ──────────────────────────────────────────────────────────────────────────────

test('isSoftAllowedPath: non-src paths are NOT soft-allowed', () => {
  for (const p of [
    'README.md',
    'docs/VIVEK_SEARCH_ALGORITHM.md',
    'CHANGELOG.md',
    'e2e/foo.spec.ts',
    '.github/workflows/x.yml',
  ]) {
    assert.equal(isSoftAllowedPath(p), false, p);
  }
});

test('isSoftAllowedPath: src .ts product files ARE soft-allowed', () => {
  for (const p of [
    'src/core/settings.ts',
    'src/background/search/tokenizer.ts',
    'src/popup/popup-utils.ts',
    'src\\background\\database.ts',
  ]) {
    assert.equal(isSoftAllowedPath(p), true, p);
  }
});

test('isSoftAllowedPath: src test files are NOT soft-allowed', () => {
  for (const p of [
    'src/core/__tests__/settings.test.ts',
    'src/background/search/scorer.test.ts',
    'src/foo/bar.spec.ts',
    'src/__test-utils__/chrome.ts',
  ]) {
    assert.equal(isSoftAllowedPath(p), false, p);
  }
});

test('isSoftAllowedPath: src product html/css files ARE soft-allowed (bundled UI)', () => {
  for (const p of ['src/popup/popup.html', 'src/popup/popup.css']) {
    assert.equal(isSoftAllowedPath(p), true, p);
  }
});

test('isSoftAllowedPath: generated coverage HTML IS soft-allowed (mirrors product source)', () => {
  for (const p of [
    'docs/quality-report/coverage/core/settings.ts.html',
    'docs/quality-report/coverage/lcov-report/shared/web-search.ts.html',
  ]) {
    assert.equal(isSoftAllowedPath(p), true, p);
  }
});

test('isSoftAllowedPath: other non-code files under src are NOT soft-allowed', () => {
  for (const p of ['src/manifest.json', 'src/assets/icon.svg']) {
    assert.equal(isSoftAllowedPath(p), false, p);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// isSelfExempt / termsForPath
// ──────────────────────────────────────────────────────────────────────────────

test('isSelfExempt: recognizes scanner, terms file, helper, and test file', () => {
  assert.equal(isSelfExempt('scripts/blocklist-terms.txt'), true);
  assert.equal(isSelfExempt('scripts/check-blocklist.mjs'), true);
  assert.equal(isSelfExempt('scripts/hash-blocklist-term.mjs'), true);
  assert.equal(isSelfExempt('scripts\\__tests__\\check-blocklist.test.mjs'), true);
  assert.equal(isSelfExempt('scripts/other.mjs'), false);
});

test('termsForPath: self-exempt returns empty hard + empty soft', () => {
  const terms = makeTerms({ hard: [SYN_ALPHA], soft: ['beta'] });
  const out = termsForPath('scripts/blocklist-terms.txt', terms);
  assert.equal(out.hardHashes.size, 0);
  assert.deepEqual(out.soft, []);
});

test('termsForPath: soft-allowed paths get hard hashes but no soft literals', () => {
  const terms = makeTerms({ hard: [SYN_ALPHA], soft: ['beta'] });
  const out = termsForPath('src/core/settings.ts', terms);
  assert.equal(out.hardHashes.size, 1);
  assert.deepEqual(out.soft, []);
});

test('termsForPath: other paths get hard + soft', () => {
  const terms = makeTerms({ hard: [SYN_ALPHA], soft: ['beta'] });
  const readme = termsForPath('README.md', terms);
  assert.equal(readme.hardHashes.size, 1);
  assert.deepEqual(readme.soft, ['beta']);
});

// ──────────────────────────────────────────────────────────────────────────────
// scanText — hashed (hard) matches
// ──────────────────────────────────────────────────────────────────────────────

test('scanText: hashed term matches case-insensitively as whole identifier', () => {
  const text = 'line one OK\nleak here ' + SYN_ALPHA.toUpperCase() + ' inside\n';
  const hits = scanText(text, makeTerms({ hard: [SYN_ALPHA] }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'hard');
  assert.equal(hits[0].line, 2);
  assert.equal(hits[0].length, SYN_ALPHA.length);
  // Redacted snippet must NOT contain the literal.
  assert.ok(!hits[0].snippet.toLowerCase().includes(SYN_ALPHA.toLowerCase()));
  assert.match(hits[0].snippet, /\[R×\d+\]/);
  // Hash prefix is exposed for correlation.
  assert.match(hits[0].term, /^#[0-9a-f]{8}$/);
});

test('scanText: hashed term matches when embedded inside a larger identifier', () => {
  // e.g. blocked term buried inside another run like "pre__blocked_alpha__suffix"
  const text = 'something pre' + SYN_ALPHA + 'suffix else';
  const hits = scanText(text, makeTerms({ hard: [SYN_ALPHA] }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'hard');
});

test('scanText: hashed term matches across dot-separated identifier parts', () => {
  const dotted = SYN_ALPHA + '.example';   // longer identifier containing our term
  const text = 'see https://' + dotted + '/path';
  const hits = scanText(text, makeTerms({ hard: [SYN_ALPHA] }));
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].kind, 'hard');
});

test('scanText: no hit for clean text', () => {
  const text = 'nothing suspicious here, just prose.';
  const hits = scanText(text, makeTerms({ hard: [SYN_ALPHA] }));
  assert.deepEqual(hits, []);
});

test('scanText: "blocklist-allow" pragma skips the same line (hard term)', () => {
  const text = 'exempt ' + SYN_ALPHA + ' reference // blocklist-allow legit\n';
  const hits = scanText(text, makeTerms({ hard: [SYN_ALPHA] }));
  assert.deepEqual(hits, []);
});

test('scanText: "blocklist-allow-next" pragma skips the following line only', () => {
  const text = [
    '// blocklist-allow-next doc reference',
    'allowed ' + SYN_ALPHA + ' here',
    'blocked ' + SYN_ALPHA + ' here',
  ].join('\n');
  const hits = scanText(text, makeTerms({ hard: [SYN_ALPHA] }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
});

// ──────────────────────────────────────────────────────────────────────────────
// scanText — soft (literal) matches
// ──────────────────────────────────────────────────────────────────────────────

test('scanText: soft term matches case-insensitively as plain substring', () => {
  const text = 'a Soft-Term here\nand soft-term again';
  const hits = scanText(text, makeTerms({ soft: ['soft-term'] }));
  assert.equal(hits.length, 2);
  assert.equal(hits[0].kind, 'soft');
  assert.equal(hits[0].term, 'soft-term');
});

test('scanText: soft pragma "blocklist-allow" still skips the line', () => {
  const text = 'this Soft-Term is ok // blocklist-allow\n';
  assert.deepEqual(scanText(text, makeTerms({ soft: ['soft-term'] })), []);
});

test('scanText: legacy array-of-soft-terms still works (backward compat)', () => {
  const text = 'hit XBLOCKEDBETAX here';
  const hits = scanText(text, ['xblockedbetax']);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'soft');
});

// ──────────────────────────────────────────────────────────────────────────────
// buildSnippet / buildRedactedSnippet / hashPrefix / redactSnippet / looksBinary
// ──────────────────────────────────────────────────────────────────────────────

test('buildSnippet: trims long context and adds ellipsis', () => {
  const line = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxTARGETyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';
  const idx = line.indexOf('TARGET');
  const snip = buildSnippet(line, idx, 'TARGET'.length);
  assert.ok(snip.startsWith('…'));
  assert.ok(snip.endsWith('…'));
  assert.ok(snip.includes('TARGET'));
});

test('buildRedactedSnippet: hides the matched range behind [R×N]', () => {
  const line = 'prose before ' + SYN_ALPHA + ' prose after';
  const idx = line.indexOf(SYN_ALPHA);
  const snip = buildRedactedSnippet(line, idx, SYN_ALPHA.length);
  assert.ok(!snip.includes(SYN_ALPHA));
  assert.ok(snip.includes('[R×' + SYN_ALPHA.length + ']'));
});

test('hashPrefix: stable 8-char hex prefix', () => {
  const h1 = hashPrefix('sentinel_value');
  const h2 = hashPrefix('sentinel_value');
  assert.equal(h1, h2);
  assert.equal(h1.length, 8);
  assert.match(h1, /^[0-9a-f]{8}$/);
  assert.notEqual(h1, hashPrefix('different_value'));
});

test('redactSnippet: replaces literal term with length-bucketed marker', () => {
  const red = redactSnippet('before XBLOCKEDALPHAX after', 'xblockedalphax');
  assert.ok(!/XBLOCKEDALPHAX/.test(red));
  assert.match(red, /\[R×\d+\]/);
});

test('looksBinary: NUL byte in first 8KB is treated as binary', () => {
  const buf = Buffer.from([65, 66, 0, 67, 68]);
  assert.equal(looksBinary(buf), true);
});

test('looksBinary: pure ASCII text is not binary', () => {
  const buf = Buffer.from('hello world\n');
  assert.equal(looksBinary(buf), false);
});
