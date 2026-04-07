/**
 * Web search targets for ?? palette mode (quick-search + popup).
 * Prefix parsing, URL building (static + Jira / Confluence origins), and hint copy.
 */

import type { AppSettings } from '../core/settings';

/** URL templates for engines that do not need extra settings. */
export const SEARCH_ENGINES: Record<string, string> = {
    google: 'https://www.google.com/search?q=',
    youtube: 'https://www.youtube.com/results?search_query=',
    github: 'https://github.com/search?q=',
    gcp: 'https://console.cloud.google.com/search;q=',
};

export const SEARCH_ENGINE_PREFIXES: Record<string, string> = {
    g: 'google',
    y: 'youtube',
    gh: 'github',
    gc: 'gcp',
    j: 'jira',
    c: 'confluence',
};

/** Allowed default ?? engine in settings (no jira/confluence — use prefixes). */
export const WEB_SEARCH_DEFAULT_ENGINES = ['google', 'youtube', 'github', 'gcp'] as const;
export type WebSearchDefaultEngine = (typeof WEB_SEARCH_DEFAULT_ENGINES)[number];

const SEARCH_ENGINE_DISPLAY_NAMES: Record<string, string> = {
    google: 'Google',
    youtube: 'YouTube',
    github: 'GitHub',
    gcp: 'Google Cloud console',
    jira: 'Jira',
    confluence: 'Confluence',
};

/** Prefix hint order in empty ?? state (longest multi-char before single-char where relevant). */
const WEB_SEARCH_PREFIX_ORDER = ['gh', 'gc', 'g', 'y', 'j', 'c'] as const;

export interface WebSearchPrefixHintLine {
    prefix: string;
    engineKey: string;
    engineLabel: string;
}

export function getWebSearchEngineDisplayName(engineKey: string): string {
    return (
        SEARCH_ENGINE_DISPLAY_NAMES[engineKey]
        ?? engineKey.charAt(0).toUpperCase() + engineKey.slice(1)
    );
}

function isAtlassianOrStaticEngine(engineKey: string): boolean {
    return Boolean(SEARCH_ENGINES[engineKey]) || engineKey === 'jira' || engineKey === 'confluence';
}

/** Prefix examples for ?? empty-state education (non-selectable UI rows). */
export function getWebSearchPrefixHintLines(): WebSearchPrefixHintLine[] {
    const out: WebSearchPrefixHintLine[] = [];
    for (const prefix of WEB_SEARCH_PREFIX_ORDER) {
        const engineKey = SEARCH_ENGINE_PREFIXES[prefix];
        if (!engineKey || !isAtlassianOrStaticEngine(engineKey)) {
            continue;
        }
        out.push({
            prefix,
            engineKey,
            engineLabel: getWebSearchEngineDisplayName(engineKey),
        });
    }
    return out;
}

/** Longest prefix first so `gh` wins over `g`. */
export function sortedWebSearchPrefixKeys(): string[] {
    return Object.keys(SEARCH_ENGINE_PREFIXES).sort(
        (a, b) => b.length - a.length || a.localeCompare(b),
    );
}

export interface ParsedWebSearch {
    engineKey: string;
    searchTerms: string;
    usedPrefix: boolean;
    /** Set when usedPrefix — for UI examples (?? y cats). */
    matchedPrefix?: string;
}

/**
 * Resolve engine + terms from the text after ?? in the input.
 * @param defaultEngineKey — from settings (google, youtube, github, gcp).
 */
export function parseWebSearchQuery(query: string, defaultEngineKey: string): ParsedWebSearch {
    const q = query.trim();
    if (!q) {
        return { engineKey: defaultEngineKey, searchTerms: '', usedPrefix: false };
    }
    for (const prefix of sortedWebSearchPrefixKeys()) {
        const engineKey = SEARCH_ENGINE_PREFIXES[prefix];
        if (!engineKey) {
            continue;
        }
        if (q === prefix) {
            return { engineKey, searchTerms: '', usedPrefix: true, matchedPrefix: prefix };
        }
        if (q.startsWith(`${prefix} `)) {
            return {
                engineKey,
                searchTerms: q.slice(prefix.length + 1).trim(),
                usedPrefix: true,
                matchedPrefix: prefix,
            };
        }
    }
    return { engineKey: defaultEngineKey, searchTerms: q, usedPrefix: false };
}

export type WebSearchSiteError = 'no-jira-site' | 'no-confluence-site';

export type WebSearchUrlResult =
    | { url: string }
    | { error: 'no-terms' | WebSearchSiteError };

/** Toast copy when Enter / click with missing Jira or Confluence origin. */
export function webSearchSiteUrlToastMessage(error: WebSearchSiteError): string {
    return error === 'no-jira-site'
        ? 'Set your Jira site URL in settings (Command palette tab).'
        : 'Set your Confluence site URL in settings (Command palette tab).';
}

/** One-line preview when the row is blocked by a missing site URL. */
export function webSearchSiteUrlPreviewLabel(error: WebSearchSiteError, engineName: string): string {
    return error === 'no-jira-site'
        ? `${engineName} — set Jira site URL in settings`
        : `${engineName} — set Confluence site URL in settings`;
}

/** Escape user text for use inside JQL / Confluence CQL double-quoted strings. */
export function escapeAtlassianSearchQuotedFragment(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildWebSearchUrl(
    parsed: ParsedWebSearch,
    settings: Pick<AppSettings, 'jiraSiteUrl' | 'confluenceSiteUrl'>,
): WebSearchUrlResult {
    const { engineKey, searchTerms } = parsed;

    if (searchTerms === '') {
        return { error: 'no-terms' };
    }

    if (engineKey === 'jira') {
        const origin = (settings.jiraSiteUrl ?? '').trim();
        if (!origin) {
            return { error: 'no-jira-site' };
        }
        const q = escapeAtlassianSearchQuotedFragment(searchTerms);
        const jql = `text ~ "${q}"`;
        return {
            url: `${origin}/issues?jql=${encodeURIComponent(jql)}`,
        };
    }
    if (engineKey === 'confluence') {
        const origin = (settings.confluenceSiteUrl ?? '').trim();
        if (!origin) {
            return { error: 'no-confluence-site' };
        }
        const q = escapeAtlassianSearchQuotedFragment(searchTerms);
        const cql = `siteSearch ~ "${q}"`;
        return {
            url: `${origin}/dosearchsite.action?cql=${encodeURIComponent(cql)}`,
        };
    }

    const base = SEARCH_ENGINES[engineKey];
    if (!base) {
        return { error: 'no-terms' };
    }

    return { url: base + encodeURIComponent(searchTerms) };
}
