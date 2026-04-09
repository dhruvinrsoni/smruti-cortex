// data-masker.ts — Privacy-first data anonymization for ranking reports
// Keeps matched query tokens visible while redacting everything else

export type MaskingLevel = 'none' | 'partial' | 'full';

/**
 * Simple deterministic hash for anonymization (not cryptographic).
 */
function simpleHash(input: string): string {
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
function redactWord(word: string): string {
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
 * Well-known public domains that don't need masking.
 */
const PUBLIC_DOMAINS = new Set([
    'google', 'github', 'stackoverflow', 'wikipedia', 'youtube',
    'microsoft', 'apple', 'amazon', 'reddit', 'twitter', 'linkedin',
    'facebook', 'mozilla', 'npm', 'gitlab', 'bitbucket', 'docker',
    'cloudflare', 'netlify', 'vercel', 'heroku', 'azure', 'aws',
]);

/**
 * Mask hostname parts: keep TLD, keep query-matching parts, keep well-known
 * public domains, redact the rest (e.g. company-specific subdomains).
 *
 * jira.zebra.com + tokens=["jira"] → jira.z••ra.com
 * confluence.zebra.com + tokens=["confluence"] → confluence.z••ra.com
 * github.com → github.com (public, not redacted)
 */
function maskHostname(hostname: string, queryTokens: string[]): string {
    const parts = hostname.split('.');
    if (parts.length <= 1) { return hostname; }
    const lowerTokens = new Set(queryTokens.map(t => t.toLowerCase()));
    const tld = parts[parts.length - 1]; // com, org, etc.

    return parts.map((part, i) => {
        if (i === parts.length - 1) { return tld; }
        if (lowerTokens.has(part.toLowerCase())) { return part; }
        if (PUBLIC_DOMAINS.has(part.toLowerCase())) { return part; }
        for (const token of lowerTokens) {
            if (part.toLowerCase().includes(token)) { return part; }
        }
        return redactWord(part);
    }).join('.');
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
 * - partial: returns first 20 chars + "..."
 * - full:    returns placeholder
 */
export function maskMetaDescription(meta: string, _queryTokens: string[], level: MaskingLevel): string {
    if (level === 'none') {
        return meta;
    }
    if (level === 'partial') {
        return meta.length > 20 ? meta.slice(0, 20) + '...' : meta;
    }
    return '•••';
}
