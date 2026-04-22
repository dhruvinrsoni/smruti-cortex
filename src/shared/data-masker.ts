// data-masker.ts — Privacy-first data anonymization for ranking reports
// Keeps matched query tokens visible while redacting everything else
//
// Three-level gradient contract (locked by tests in ranking-report.test.ts and
// data-masker.test.ts — do not soften without updating both):
//
//   Field                  | none | partial                    | full
//   -----------------------|------|----------------------------|----------------------------
//   Title (row)            | raw  | partial redact             | [hash] **matched**
//   Domain (row)           | raw  | partial hostname mask      | [hash].tld/•••
//   Query (report header)  | raw  | raw (repro hook)           | [hash] (N tokens)
//   Token (report header)  | raw  | raw (already in Tokens)    | first-char + dots + (len)
//   Meta description       | raw  | first 10 chars + …         | •••
//
// The goal is a visible redaction gradient when the report is pasted into a
// GitHub issue, not just per-field correctness. `partial` keeps the query and
// token list readable (they are the repro key); `full` hashes them too so the
// GitHub issue never contains the literal search query.

export type MaskingLevel = 'none' | 'partial' | 'full';

/**
 * Simple deterministic hash for anonymization (not cryptographic).
 */
export function simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0;
    }
    return Math.abs(hash).toString(36).slice(0, 8);
}

/**
 * Redact a single word by keeping first/last characters and replacing the
 * middle with bullet dots. Scales by word length:
 *   1-3 chars  → all dots          ("PTO" → "•••")
 *   4-5 chars  → 1 + dots + 1      ("Page" → "P••e")
 *   6-8 chars  → 2 + dots + 2      ("Sprint" → "Sp••nt")
 *   9+  chars  → 3 + dots + 2      ("Dashboard" → "Das•••rd")
 */
export function redactWord(word: string): string {
    const len = word.length;
    if (len <= 3) {
        return '•'.repeat(len);
    }
    if (len <= 5) {
        return word[0] + '•'.repeat(len - 2) + word[len - 1];
    }
    if (len <= 8) {
        return word.slice(0, 2) + '•'.repeat(len - 4) + word.slice(-2);
    }
    return word.slice(0, 3) + '•'.repeat(Math.min(len - 5, 4)) + word.slice(-2);
}

/**
 * Mask a title string according to the masking level.
 * Matched query tokens are preserved in all modes; other words are redacted.
 *
 * - none:    returns the original title unchanged
 * - partial: redacts non-matching words (keeps first/last chars), bold matched tokens
 * - full:    hashes the entire title, keeps matched tokens inline
 */
export function maskTitle(title: string, queryTokens: string[], level: MaskingLevel): string {
    if (level === 'none') {
        return title;
    }

    const lowerTokens = new Set(queryTokens.map(t => t.toLowerCase()));
    const words = title.split(/(\s+)/);

    if (level === 'partial') {
        return words.map(word => {
            if (/^\s+$/.test(word)) {
                return ' ';
            }
            const cleaned = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            if (cleaned.length === 0) {
                return word;
            }
            if (lowerTokens.has(cleaned)) {
                return `**${word}**`;
            }
            for (const token of lowerTokens) {
                if (cleaned.includes(token)) {
                    return `**${word}**`;
                }
            }
            return redactWord(word);
        }).join('');
    }

    // full masking
    const hash = simpleHash(title);
    const matchedInTitle = queryTokens.filter(t =>
        title.toLowerCase().includes(t.toLowerCase())
    );
    if (matchedInTitle.length > 0) {
        return `[${hash}] ${matchedInTitle.map(t => `**${t}**`).join(' ')}`;
    }
    return `[${hash}]`;
}

/**
 * Known internal / non-routable TLDs — always treat as private infrastructure.
 */
const INTERNAL_TLDS = new Set([
    'local', 'internal', 'corp', 'lan', 'intranet',
    'home', 'localdomain', 'test', 'invalid', 'localhost',
]);

/**
 * Second-level labels that form compound TLDs when followed by a
 * 2-letter country code (e.g. .co.uk, .com.au, .ac.jp).
 */
const COMPOUND_TLD_PREFIXES = new Set([
    'co', 'com', 'org', 'net', 'ac', 'edu', 'gov',
]);

/**
 * How many trailing dot-separated parts form the effective TLD.
 * Returns 2 for compound TLDs like .co.uk, 1 for simple TLDs like .com.
 */
function effectiveTldLength(parts: string[]): number {
    if (parts.length >= 3) {
        const cc = parts[parts.length - 1];
        const prefix = parts[parts.length - 2];
        if (cc.length === 2 && COMPOUND_TLD_PREFIXES.has(prefix.toLowerCase())) {
            return 2;
        }
    }
    return 1;
}

/**
 * Structurally mask a hostname without relying on a public-domain whitelist.
 *
 * Strategy — position-based, no whitelist needed:
 *   TLD (.com, .co.uk)            → always visible
 *   2-part domains (github.com)   → keep as-is (SLD is the site identity)
 *   3+ parts (jira.zebra.com)     → SLD is the org name → redact
 *   Internal TLDs (.local, .corp) → redact all non-TLD parts
 *   Query-matching parts          → always preserved
 *
 * Examples:
 *   jira.zebra.com   + ["jira"]       → jira.z••ra.com
 *   github.com       + ["test"]       → github.com         (2-part, kept)
 *   app.company.co.uk + ["app"]       → app.co••••y.co.uk  (compound TLD)
 *   wiki.acme.local  + []             → ••••.••••.local    (internal TLD)
 */
function maskHostname(hostname: string, queryTokens: string[]): string {
    const parts = hostname.split('.');
    if (parts.length <= 1) { return hostname; }

    const lowerTokens = new Set(queryTokens.map(t => t.toLowerCase()));
    const isInternal = INTERNAL_TLDS.has(parts[parts.length - 1].toLowerCase());
    const tldLen = effectiveTldLength(parts);
    const tldParts = parts.slice(-tldLen);
    const hostParts = parts.slice(0, -tldLen);

    if (!isInternal && hostParts.length <= 1) {
        return hostname;
    }

    const masked = hostParts.map(part => {
        if (lowerTokens.has(part.toLowerCase())) { return part; }
        for (const token of lowerTokens) {
            if (part.toLowerCase().includes(token)) { return part; }
        }
        return redactWord(part);
    });

    return [...masked, ...tldParts].join('.');
}

/**
 * Mask a URL or hostname.
 *
 * - none:    returns unchanged
 * - partial: redacts company-specific domain parts, replaces the path
 * - full:    hashes the full URL, shows only TLD structure
 */
export function maskUrl(urlOrHostname: string, queryTokens: string[], level: MaskingLevel): string {
    if (level === 'none') {
        return urlOrHostname;
    }

    if (!urlOrHostname.includes('://')) {
        if (level === 'partial') {
            return maskHostname(urlOrHostname, queryTokens);
        }
        return `[${simpleHash(urlOrHostname)}].domain`;
    }

    try {
        const parsed = new URL(urlOrHostname);
        if (level === 'partial') {
            return `${maskHostname(parsed.hostname, queryTokens)}/•••`;
        }
        const parts = parsed.hostname.split('.');
        const tld = parts.length > 1 ? parts.slice(-2).join('.') : parsed.hostname;
        return `[${simpleHash(parsed.hostname)}].${tld}/•••`;
    } catch {
        if (level === 'partial') {
            return urlOrHostname.split('/')[0] + '/•••';
        }
        return `[${simpleHash(urlOrHostname)}]`;
    }
}

/**
 * Mask a meta description.
 *
 * - none:    returns unchanged
 * - partial: returns first 10 chars + "..." (tightened from 20 so partial truly looks partial)
 * - full:    returns placeholder
 */
export function maskMetaDescription(meta: string, _queryTokens: string[], level: MaskingLevel): string {
    if (level === 'none') {
        return meta;
    }
    if (level === 'partial') {
        return meta.length > 10 ? meta.slice(0, 10) + '...' : meta;
    }
    return '•••';
}

/**
 * Mask the search query itself for the ranking-report header.
 *
 * - none:    returns unchanged
 * - partial: returns unchanged — the query is the repro hook; keep it readable
 * - full:    returns `[hash] (N tokens)` — the GitHub issue must not contain
 *            the literal query text when the user chose full masking
 */
export function maskQuery(query: string, queryTokens: string[], level: MaskingLevel): string {
    if (level === 'none' || level === 'partial') {
        return query;
    }
    return `[${simpleHash(query)}] (${queryTokens.length} tokens)`;
}

/**
 * Mask a single query token for the ranking-report header Tokens list.
 *
 * - none:    returns unchanged
 * - partial: returns unchanged (tokens are already in the Query cell)
 * - full:    first char + bullet dots + `(len)` e.g. "project" → "p•••(7)"
 */
export function maskToken(token: string, level: MaskingLevel): string {
    if (level === 'none' || level === 'partial') {
        return token;
    }
    if (token.length <= 1) {
        return `(${token.length})`;
    }
    const dotCount = Math.min(token.length - 1, 3);
    return `${token[0]}${'•'.repeat(dotCount)}(${token.length})`;
}
