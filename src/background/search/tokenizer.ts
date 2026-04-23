/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SMRUTICORTEX SEARCH CORE — HIGH-IMPACT FILE                             ║
 * ║                                                                           ║
 * ║  Any change to this file affects EVERY scorer, EVERY search query, and   ║
 * ║  EVERY ranking report. Before modifying, you MUST:                        ║
 * ║    1. Read docs/adr/0001-search-matching-contract.md                      ║
 * ║    2. Ensure tokenizer-golden.test.ts stays green (or amend explicitly    ║
 * ║       in the SAME commit, and justify the flipped rows in the ADR)       ║
 * ║    3. Get approval from the search-core CODEOWNER                         ║
 * ║                                                                           ║
 * ║  Contract tag: search-core-boundary-flex-v1                               ║
 * ║  Revert:       git revert <sha-of-commit-that-broke-it>                   ║
 * ║                                                                           ║
 * ║  Invariants (see ADR for full list):                                      ║
 * ║    - classifyMatch never returns anything below SUBSTRING for a plain     ║
 * ║      includes() hit.                                                      ║
 * ║    - Boundary-flex relaxation fires ONLY at letter↔digit transitions     ║
 * ║      inside the QUERY TOKEN, with at most 1 non-alphanumeric separator    ║
 * ║      character between each pair of runs.                                 ║
 * ║    - Flex hits are classified SUBSTRING (0.4) — never EXACT/PREFIX.      ║
 * ║    - No letter↔letter or digit↔digit boundary relaxations. Ever.         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
// tokenizer.ts — Vivek Search tokenizer with graduated match classification
// Part of SmrutiCortex Vivek Search algorithm

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9.\-/]+/g, ' ')
        .split(' ')
        .filter(Boolean);
}

// ─── Vivek Search Match Classification ───────────────────────────────────────
// Graduated match types, ordered from strongest to weakest signal:
//   EXACT    (1.0) — Token matches at word boundaries: "app" in "App-My-Hub"
//   PREFIX   (0.75) — Token matches the start of a word: "iss" in "Issue"
//   SUBSTRING(0.4) — Token appears inside a word: "aviga" in "Navigator"
//                    OR the token is an alphanumeric identifier with a
//                    letter↔digit transition, and the content has the same
//                    runs separated by a single non-alphanumeric char
//                    (e.g. "module42" matching "Module 42" / "Module-42").
//   NONE     (0.0) — No match
//
// This graduated system replaces the binary includes() approach,
// giving proper credit to partial matches while still prioritizing exact hits.

export const enum MatchType {
    NONE = 0,
    SUBSTRING = 1,
    PREFIX = 2,
    EXACT = 3,
}

/** Numeric weight for each MatchType — used in scoring formulas */
export const MATCH_WEIGHTS: Record<MatchType, number> = {
    [MatchType.NONE]: 0.0,
    [MatchType.SUBSTRING]: 0.4,
    [MatchType.PREFIX]: 0.75,
    [MatchType.EXACT]: 1.0,
};

/**
 * Classify how a token matches within text. Returns the strongest match type.
 *
 * Graduated classification:
 * - EXACT: word‐boundary match — "(^|\\W)token(\\W|$)"
 * - PREFIX: token matches the start of any word — "(^|\\W)token"
 * - SUBSTRING: plain includes() hit, OR boundary-flex hit at letter↔digit
 *   transitions inside the token (max 1 separator char per transition)
 * - NONE: no match
 */
// Regex cache: avoids recompiling the same regex 3000+ times per search
const regexCache = new Map<string, { exact: RegExp; prefix: RegExp }>();
const consecutiveRegexCache = new Map<string, RegExp>();
// Boundary-flex regex cache. `null` entries mean "token has no letter↔digit
// transition — no flex regex applicable" and are cached so repeated queries
// on pure-letter / pure-digit tokens never re-analyze character classes.
const flexRegexCache = new Map<string, RegExp | null>();
const REGEX_CACHE_MAX = 200;

function getTokenRegexes(escapedToken: string): { exact: RegExp; prefix: RegExp } {
    let cached = regexCache.get(escapedToken);
    if (cached) { return cached; }
    if (regexCache.size >= REGEX_CACHE_MAX) { regexCache.clear(); }
    cached = {
        exact: new RegExp(`(^|[^a-z0-9])${escapedToken}([^a-z0-9]|$)`),
        prefix: new RegExp(`(^|[^a-z0-9])${escapedToken}`),
    };
    regexCache.set(escapedToken, cached);
    return cached;
}

/**
 * Boundary-flex regex for a token, or `null` when the token has no
 * letter↔digit transitions (in which case plain `includes()` already fully
 * describes its matching behaviour).
 *
 * Contract:
 *   - Split the lowercased token into maximal runs of letters vs digits.
 *     Non-alphanumeric characters inside the token (e.g. `.` in `v2.0`)
 *     attach to whichever run they currently belong to and do NOT count as
 *     transitions.
 *   - If there are fewer than two runs, return `null` — no flex applicable.
 *   - Otherwise, escape each run for regex safety and join the runs with
 *     `[^a-z0-9]?`. The `?` caps the separator at exactly one character,
 *     which is the whole point of the contract: `module 42` matches,
 *     `module  42` (two spaces) does not.
 *
 * The returned regex is cached (capped at REGEX_CACHE_MAX entries) for the
 * hot-path: the same query tokens are evaluated against thousands of
 * haystacks per search.
 */
function getFlexRegex(lowerToken: string): RegExp | null {
    if (flexRegexCache.has(lowerToken)) {
        return flexRegexCache.get(lowerToken) as RegExp | null;
    }
    if (flexRegexCache.size >= REGEX_CACHE_MAX) { flexRegexCache.clear(); }

    const runs: string[] = [];
    let current = '';
    let currentKind: 'letter' | 'digit' | 'other' | '' = '';
    for (let i = 0; i < lowerToken.length; i++) {
        const ch = lowerToken[i];
        const kind = ch >= 'a' && ch <= 'z' ? 'letter'
            : ch >= '0' && ch <= '9' ? 'digit'
            : 'other';
        if (current === '') {
            current = ch;
            currentKind = kind;
            continue;
        }
        // Only letter↔digit transitions split runs. Anything involving an
        // "other" char (e.g. `.`, `-`) stays inside the current run.
        const isLetterDigitTransition =
            (currentKind === 'letter' && kind === 'digit') ||
            (currentKind === 'digit' && kind === 'letter');
        if (isLetterDigitTransition) {
            runs.push(current);
            current = ch;
            currentKind = kind;
        } else {
            current += ch;
            // If we were 'other', inherit the new run's kind the first time
            // we see a letter or digit, so future comparisons are meaningful.
            if (currentKind === 'other' && kind !== 'other') {
                currentKind = kind;
            }
        }
    }
    if (current !== '') { runs.push(current); }

    if (runs.length < 2) {
        flexRegexCache.set(lowerToken, null);
        return null;
    }

    const escaped = runs.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const rx = new RegExp(escaped.join('[^a-z0-9]?'));
    flexRegexCache.set(lowerToken, rx);
    return rx;
}

export function classifyMatch(token: string, text: string): MatchType {
    const lowerText = text.toLowerCase();
    const lowerToken = token.toLowerCase();

    // Fast path: plain substring present → classify against word boundaries.
    if (lowerText.includes(lowerToken)) {
        const escaped = lowerToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const { exact, prefix } = getTokenRegexes(escaped);
        if (exact.test(lowerText)) { return MatchType.EXACT; }
        if (prefix.test(lowerText)) { return MatchType.PREFIX; }
        return MatchType.SUBSTRING;
    }

    // Boundary-flex path: only fires for tokens that mix letters and digits.
    // The contract is deliberately narrow — see the file-header banner and
    // docs/adr/0001-search-matching-contract.md for why we will NOT relax
    // any other boundary here.
    const flex = getFlexRegex(lowerToken);
    if (flex && flex.test(lowerText)) {
        return MatchType.SUBSTRING;
    }

    return MatchType.NONE;
}

/**
 * Classify all tokens against text, returning per‐token match types.
 */
export function classifyTokenMatches(tokens: string[], text: string): MatchType[] {
    return tokens.map(token => classifyMatch(token, text));
}

/**
 * Compute a graduated match score for tokens against text.
 * Returns a value in [0, 1] based on match quality of each token.
 *
 * Formula: sum(weight_i) / numTokens, where weight_i is the MATCH_WEIGHTS
 * for each token's best match type.
 *
 * Example: 2 EXACT + 1 PREFIX out of 3 tokens → (1.0 + 1.0 + 0.75) / 3 = 0.917
 */
export function graduatedMatchScore(tokens: string[], text: string): number {
    if (tokens.length === 0) {return 0;}
    const types = classifyTokenMatches(tokens, text);
    const total = types.reduce((sum, t) => sum + MATCH_WEIGHTS[t], 0);
    return total / tokens.length;
}

/**
 * Find the earliest position where a token matches in text.
 * Returns normalized position [0, 1] where 0 = start, 1 = end.
 * Returns 1.0 (worst) if no match.
 */
export function matchPosition(token: string, text: string): number {
    const lowerText = text.toLowerCase();
    const idx = lowerText.indexOf(token.toLowerCase());
    if (idx < 0) {return 1.0;}
    return lowerText.length > 0 ? idx / lowerText.length : 1.0;
}

/**
 * Check if tokens appear consecutively in text (phrase match).
 * Returns the count of consecutive pair matches.
 * Example: tokens ["app","my","hub"] in "App-My-Hub" → 2 consecutive pairs found.
 */
export function countConsecutiveMatches(tokens: string[], text: string): number {
    if (tokens.length < 2) {return 0;}

    const lowerText = text.toLowerCase();
    let consecutiveCount = 0;

    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i].toLowerCase();
        const b = tokens[i + 1].toLowerCase();

        // Look for pattern: tokenA followed by non-alpha separator(s) then tokenB
        const escaped_a = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escaped_b = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cacheKey = `${escaped_a}||${escaped_b}`;
        let consecutiveRegex = consecutiveRegexCache.get(cacheKey);
        if (!consecutiveRegex) {
            if (consecutiveRegexCache.size >= REGEX_CACHE_MAX) { consecutiveRegexCache.clear(); }
            consecutiveRegex = new RegExp(`${escaped_a}[^a-z0-9]{0,3}${escaped_b}`);
            consecutiveRegexCache.set(cacheKey, consecutiveRegex);
        }
        if (consecutiveRegex.test(lowerText)) {
            consecutiveCount++;
        }
    }

    return consecutiveCount;
}

// ─── Legacy API (backward compatibility) ────────────────────────────────────

/**
 * Check if a token matches at a word boundary in the text.
 * @deprecated Use classifyMatch(token, text) === MatchType.EXACT instead
 */
export function isExactKeywordMatch(token: string, text: string): boolean {
    return classifyMatch(token, text) === MatchType.EXACT;
}

/**
 * Count how many tokens have exact keyword (word-boundary) matches in text.
 * @deprecated Use classifyTokenMatches() for graduated scoring
 */
export function countExactKeywordMatches(tokens: string[], text: string): number {
    return tokens.filter(token => classifyMatch(token, text) === MatchType.EXACT).length;
}
