// ─────────────────────────────────────────────────────────────────────────────
// Golden baseline for `classifyMatch`
// ─────────────────────────────────────────────────────────────────────────────
// This file is the REGRESSION FIREWALL for the search-core matching contract.
// Every row below asserts a (token, content) → MatchType expectation.
//
// Rules for editing this file:
//   1. Never weaken an existing assertion silently. If behaviour changes, flip
//      the row and document why in the commit message + ADR in the SAME commit.
//   2. All fixtures use synthetic / RFC-2606 placeholders — no company
//      literals. This is enforced by the blocklist scanner too.
//   3. If you add a row, add it to the right category and keep the category
//      balanced (we aim for ~80 rows covering real-world match shapes).
//   4. The `flex:` flag documents rows that are covered by the boundary-flex
//      contract (letter↔digit transition in the token with ≤1 separator in
//      the content). Flipping a `flex: true` row to NONE means we're
//      breaking the contract — don't.
//
// Read `docs/adr/0001-search-matching-contract.md` before changing the file.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { classifyMatch } from '../tokenizer';

// Inline MatchType numeric values — keeps the table compact and avoids a const-enum
// import hazard.
const NONE = 0;
const SUBSTRING = 1;
const PREFIX = 2;
const EXACT = 3;

type Expected = typeof NONE | typeof SUBSTRING | typeof PREFIX | typeof EXACT;

interface GoldenRow {
  token: string;
  content: string;
  expected: Expected;
  /**
   * True when the row exercises the boundary-flex contract: the token has a
   * letter↔digit transition and the content has the same runs separated by
   * at most one non-alphanumeric char. These rows are the reason flex
   * exists — do not weaken them.
   */
  flex?: boolean;
}

// ─── Category 1: pure-letter EXACT (word-boundary match) ─────────────────────
const CAT_EXACT_LETTERS: GoldenRow[] = [
  { token: 'hello', content: 'hello world', expected: EXACT },
  { token: 'world', content: 'hello world', expected: EXACT },
  { token: 'hello', content: 'hello-world', expected: EXACT },
  { token: 'react', content: 'react is a library', expected: EXACT },
  { token: 'react', content: '(react)', expected: EXACT },
  { token: 'cat',   content: 'cat', expected: EXACT },
  { token: 'cat',   content: '  cat  ', expected: EXACT },
  { token: 'api',   content: 'https://api.example.com/path', expected: EXACT },
  { token: 'foo',   content: 'foo,bar,baz', expected: EXACT },
  { token: 'baz',   content: 'foo,bar,baz', expected: EXACT },
];

// ─── Category 2: pure-letter PREFIX (starts at word boundary, no end boundary)
const CAT_PREFIX_LETTERS: GoldenRow[] = [
  { token: 'iss',   content: 'issue tracker', expected: PREFIX },
  { token: 'react', content: 'reactive programming', expected: PREFIX },
  { token: 'app',   content: 'application', expected: PREFIX },
  { token: 'nav',   content: 'navigator', expected: PREFIX },
  { token: 'hello', content: 'helloworld', expected: PREFIX },
  { token: 'tok',   content: 'tokens everywhere', expected: PREFIX },
  { token: 'mod',   content: 'modulate the signal', expected: PREFIX },
  { token: 'que',   content: 'queue length', expected: PREFIX },
];

// ─── Category 3: pure-letter SUBSTRING (inside a word, no word boundaries) ───
const CAT_SUBSTRING_LETTERS: GoldenRow[] = [
  { token: 'aviga', content: 'navigator', expected: SUBSTRING },
  { token: 'orl',   content: 'world', expected: SUBSTRING },
  { token: 'ell',   content: 'hello', expected: SUBSTRING },
  { token: 'ack',   content: 'stackoverflow', expected: SUBSTRING },
  { token: 'odu',   content: 'module', expected: SUBSTRING },
  { token: 'eact',  content: 'reactive', expected: SUBSTRING },
];

// ─── Category 4: pure-letter NONE (no match at all) ──────────────────────────
const CAT_NONE_LETTERS: GoldenRow[] = [
  { token: 'xyz',    content: 'hello world', expected: NONE },
  { token: 'foobar', content: 'foo bar',     expected: NONE },
  { token: 'cat',    content: 'dog', expected: NONE },
  { token: 'quick',  content: 'slow brown fox', expected: NONE },
  { token: 'hellow', content: 'hello world', expected: NONE },
];

// ─── Category 5: letter↔digit tokens, SAME-WORD content (already match) ──────
const CAT_LD_SAMEWORD: GoldenRow[] = [
  { token: 'module42', content: 'module42 review', expected: EXACT },
  { token: 'module42', content: 'module42', expected: EXACT },
  { token: 'module42', content: 'module42review', expected: PREFIX },
  { token: 'id1234',   content: 'id1234-test', expected: EXACT },
  { token: 'id1234',   content: 'id1234', expected: EXACT },
  { token: 'v2rc1',    content: 'v2rc1 release', expected: EXACT },
  { token: 'python3',  content: 'python3 docs', expected: EXACT },
  { token: 'ios15',    content: 'ios15 beta', expected: EXACT },
  { token: 'build7',   content: 'build7-artifact', expected: EXACT },
  { token: 'v2',       content: 'v2 release', expected: EXACT },
  { token: 'v2',       content: 'v2.0', expected: EXACT },
];

// ─── Category 6: letter↔digit tokens, SEPARATOR-BROKEN content ───────────────
// These rows exercise the boundary-flex contract: a letter↔digit token
// matching content where the runs are split by ≤1 non-alphanumeric char.
// Classified SUBSTRING (not EXACT) so clean same-word hits always outrank.
const CAT_LD_FLEX_CANDIDATES: GoldenRow[] = [
  { token: 'module42', content: 'module 42',              expected: SUBSTRING, flex: true },
  { token: 'module42', content: 'Module 42 Review',       expected: SUBSTRING, flex: true },
  { token: 'module42', content: 'module-42',              expected: SUBSTRING, flex: true },
  { token: 'module42', content: 'module_42',              expected: SUBSTRING, flex: true },
  { token: 'module42', content: 'module.42',              expected: SUBSTRING, flex: true },
  { token: 'module42', content: 'module/42',              expected: SUBSTRING, flex: true },
  { token: 'id1234',   content: 'ID-1234',                expected: SUBSTRING, flex: true },
  { token: 'id1234',   content: 'id 1234',                expected: SUBSTRING, flex: true },
  { token: 'id1234',   content: 'ticket id_1234 status',  expected: SUBSTRING, flex: true },
  { token: 'v2rc1',    content: 'v2 rc1',                 expected: SUBSTRING, flex: true },
  { token: 'ios15',    content: 'ios 15',                 expected: SUBSTRING, flex: true },
  { token: 'ios15',    content: 'iOS-15',                 expected: SUBSTRING, flex: true },
  { token: 'python3',  content: 'python 3',               expected: SUBSTRING, flex: true },
  { token: 'build7',   content: 'build 7',                expected: SUBSTRING, flex: true },
  { token: 'v2',       content: 'v-2 tag',                expected: SUBSTRING, flex: true },
];

// ─── Category 7: letter↔digit tokens that must STAY NONE after the flex fix ──
// Guards against over-relaxation: no multi-char separator, no letter-letter
// break, no pre/suffix leakage.
const CAT_LD_STAY_NONE: GoldenRow[] = [
  { token: 'module42', content: 'module  42', expected: NONE },          // 2-space separator
  { token: 'module42', content: 'module -- 42', expected: NONE },        // multi-char separator
  { token: 'module42', content: 'modu le42', expected: NONE },           // letter-break inside token
  { token: 'module42', content: 'mod42', expected: NONE },               // truncated, not just a separator
  { token: 'foobar',   content: 'foo bar', expected: NONE },             // no letter↔digit transition → must not flex
  { token: 'hello',    content: 'hel lo', expected: NONE },              // pure-letter token, no flex
];

// ─── Category 8: URL-shaped content, common identifier tokens ────────────────
const CAT_URL: GoldenRow[] = [
  { token: 'example',  content: 'https://example.com', expected: EXACT },
  { token: 'com',      content: 'example.com', expected: EXACT },
  { token: 'tracker',  content: 'tracker.example.com', expected: EXACT },
  { token: 'example',  content: 'https://sub.example.com/path?q=1', expected: EXACT },
  { token: 'path',     content: 'https://example.com/path/to/resource', expected: EXACT },
  { token: 'sub',      content: 'sub.example.com', expected: EXACT },
  { token: 'ticket',   content: 'https://tracker.example.com/ticket/ID-1234', expected: EXACT },
  { token: 'id1234',   content: 'https://tracker.example.com/ticket/ID-1234', expected: SUBSTRING, flex: true },
];

// ─── Category 9: edge cases ──────────────────────────────────────────────────
const CAT_EDGE: GoldenRow[] = [
  { token: 'a', content: 'apple', expected: PREFIX },
  { token: 'a', content: 'a', expected: EXACT },
  { token: 'a', content: 'ba', expected: SUBSTRING },
  { token: 'v', content: 'v2 release', expected: PREFIX },
  { token: '1', content: 'version 1', expected: EXACT },
  { token: '1', content: 'v1 release', expected: SUBSTRING },  // preceded by letter, no word boundary
  { token: '42', content: 'module 42', expected: EXACT },
  { token: '42', content: 'module42 review', expected: SUBSTRING },  // inside word, not at boundary
  { token: 'CAT', content: 'cat in hat', expected: EXACT },           // case-insensitivity
  { token: 'Module42', content: 'module42', expected: EXACT },        // case-insensitivity with letter↔digit
];

// ─── The full golden set ─────────────────────────────────────────────────────
const GOLDEN: GoldenRow[] = [
  ...CAT_EXACT_LETTERS,
  ...CAT_PREFIX_LETTERS,
  ...CAT_SUBSTRING_LETTERS,
  ...CAT_NONE_LETTERS,
  ...CAT_LD_SAMEWORD,
  ...CAT_LD_FLEX_CANDIDATES,
  ...CAT_LD_STAY_NONE,
  ...CAT_URL,
  ...CAT_EDGE,
];

const MATCH_NAME: Record<number, string> = {
  0: 'NONE',
  1: 'SUBSTRING',
  2: 'PREFIX',
  3: 'EXACT',
};

describe('tokenizer-golden: classifyMatch regression firewall', () => {
  it('has ~80 curated rows across categories', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(75);
    expect(GOLDEN.length).toBeLessThanOrEqual(100);
  });

  describe('category: EXACT (pure-letter)', () => {
    it.each(CAT_EXACT_LETTERS)('[$token] in "$content" → EXACT', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  describe('category: PREFIX (pure-letter)', () => {
    it.each(CAT_PREFIX_LETTERS)('[$token] in "$content" → PREFIX', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  describe('category: SUBSTRING (pure-letter)', () => {
    it.each(CAT_SUBSTRING_LETTERS)('[$token] in "$content" → SUBSTRING', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  describe('category: NONE (pure-letter)', () => {
    it.each(CAT_NONE_LETTERS)('[$token] in "$content" → NONE', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  describe('category: letter↔digit tokens, same-word content', () => {
    it.each(CAT_LD_SAMEWORD)('[$token] in "$content" → $expected', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  describe('category: letter↔digit tokens, separator-broken (boundary-flex contract)', () => {
    // Contract: letter↔digit-transition tokens match content with ≤1
    // non-alphanumeric separator between each pair of runs, classified as
    // SUBSTRING. These rows are the reason the contract exists.
    it.each(CAT_LD_FLEX_CANDIDATES)(
      '[$token] in "$content" → SUBSTRING (flex)',
      ({ token, content, expected }) => {
        expect(classifyMatch(token, content)).toBe(expected);
      },
    );
  });

  describe('category: letter↔digit tokens that must stay NONE (anti-relaxation guard)', () => {
    it.each(CAT_LD_STAY_NONE)('[$token] in "$content" → NONE (stays)', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  describe('category: URL-shaped content', () => {
    it.each(CAT_URL)('[$token] in "$content"', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  describe('category: edge cases', () => {
    it.each(CAT_EDGE)('[$token] in "$content"', ({ token, content, expected }) => {
      expect(classifyMatch(token, content)).toBe(expected);
    });
  });

  it('every row has a valid expected MatchType', () => {
    for (const row of GOLDEN) {
      expect([NONE, SUBSTRING, PREFIX, EXACT]).toContain(row.expected);
      expect(MATCH_NAME[row.expected]).toBeDefined();
    }
  });
});
