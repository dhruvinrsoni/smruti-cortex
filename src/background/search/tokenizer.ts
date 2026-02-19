// tokenizer.ts — Deep Search tokenizer with graduated match classification
// Part of SmrutiCortex Deep Search™ algorithm

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9.\-/]+/g, ' ')
        .split(' ')
        .filter(Boolean);
}

// ─── Deep Search Match Classification ───────────────────────────────────────
// Graduated match types, ordered from strongest to weakest signal:
//   EXACT    (1.0) — Token matches at word boundaries: "rar" in "RAR-My-All"
//   PREFIX   (0.75) — Token matches the start of a word: "iss" in "Issue"
//   SUBSTRING(0.4) — Token appears inside a word: "aviga" in "Navigator"
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
 * - SUBSTRING: simple includes()
 * - NONE: no match
 */
export function classifyMatch(token: string, text: string): MatchType {
    const lowerText = text.toLowerCase();
    const lowerToken = token.toLowerCase();

    // Fast path: no match at all
    if (!lowerText.includes(lowerToken)) return MatchType.NONE;

    // Check exact word-boundary match (strongest signal)
    const escaped = lowerToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactRegex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    if (exactRegex.test(lowerText)) return MatchType.EXACT;

    // Check prefix match: token appears at the start of a word
    const prefixRegex = new RegExp(`(^|[^a-z0-9])${escaped}`);
    if (prefixRegex.test(lowerText)) return MatchType.PREFIX;

    // It matched via includes() but not at boundaries → substring
    return MatchType.SUBSTRING;
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
    if (tokens.length === 0) return 0;
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
    if (idx < 0) return 1.0;
    return lowerText.length > 0 ? idx / lowerText.length : 1.0;
}

/**
 * Check if tokens appear consecutively in text (phrase match).
 * Returns the count of consecutive pair matches.
 * Example: tokens ["rar","my","all"] in "RAR-My-All" → 2 consecutive pairs found.
 */
export function countConsecutiveMatches(tokens: string[], text: string): number {
    if (tokens.length < 2) return 0;

    const lowerText = text.toLowerCase();
    let consecutiveCount = 0;

    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i].toLowerCase();
        const b = tokens[i + 1].toLowerCase();

        // Look for pattern: tokenA followed by non-alpha separator(s) then tokenB
        const escaped_a = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escaped_b = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const consecutiveRegex = new RegExp(`${escaped_a}[^a-z0-9]{0,3}${escaped_b}`);
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