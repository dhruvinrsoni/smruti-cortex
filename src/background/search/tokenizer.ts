// tokenizer.ts — Fast tokenizer for URLs, titles, meta

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9.\-/]+/g, ' ')
        .split(' ')
        .filter(Boolean);
}

/**
 * Check if a token matches at a word boundary in the text.
 * A word boundary is a non-alphanumeric character or start/end of string.
 * This distinguishes exact keyword matches ("rar" in "RAR-My-All")
 * from partial substring matches ("rar" inside "library").
 */
export function isExactKeywordMatch(token: string, text: string): boolean {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    return regex.test(text);
}

/**
 * Count how many tokens have exact keyword (word-boundary) matches in text.
 */
export function countExactKeywordMatches(tokens: string[], text: string): number {
    return tokens.filter(token => isExactKeywordMatch(token, text)).length;
}