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
    const qLower = q.toLowerCase();
    for (const prefix of sortedWebSearchPrefixKeys()) {
        const engineKey = SEARCH_ENGINE_PREFIXES[prefix];
        if (!engineKey) {
            continue;
        }
        if (qLower === prefix) {
            return { engineKey, searchTerms: '', usedPrefix: true, matchedPrefix: prefix };
        }
        if (qLower.startsWith(`${prefix} `)) {
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

export type WebSearchMode = 'static-engine' | 'jira-ticket' | 'jira-jql' | 'confluence';

export type WebSearchUrlResult =
    | { url: string; mode: WebSearchMode }
    | { error: 'no-terms' | WebSearchSiteError };

const JIRA_TICKET_RE = /^[A-Za-z]+-\d+$/;

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
        const trimmed = searchTerms.trim();
        if (JIRA_TICKET_RE.test(trimmed)) {
            return {
                url: `${origin}/browse/${trimmed.toUpperCase()}`,
                mode: 'jira-ticket',
            };
        }
        const q = escapeAtlassianSearchQuotedFragment(trimmed);
        const jql = `text~"${q}"`;
        return {
            url: `${origin}/issues/?jql=${encodeURIComponent(jql)}`,
            mode: 'jira-jql',
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
            mode: 'confluence',
        };
    }

    const base = SEARCH_ENGINES[engineKey];
    if (!base) {
        return { error: 'no-terms' };
    }

    return { url: base + encodeURIComponent(searchTerms), mode: 'static-engine' };
}

/** A single ?? engine rendered as a navigable chip row in the inline answer pane. */
export interface WebSearchEngineChip {
    key: string;
    displayName: string;
    /** Built target for the current terms; empty string when {@link disabled}. */
    url: string;
    mode: WebSearchMode;
    /** True for jira/confluence with no site URL configured. */
    disabled?: boolean;
    disabledReason?: WebSearchSiteError;
}

/**
 * Ordered, de-duplicated list of every ?? engine key, derived from the single
 * registry (prefix map + static engines). Adding an engine/prefix above makes
 * it appear here automatically — no separate list to maintain.
 */
export function allWebSearchEngineKeys(): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const push = (key: string | undefined): void => {
        if (key && !seen.has(key)) {
            seen.add(key);
            ordered.push(key);
        }
    };
    for (const prefix of WEB_SEARCH_PREFIX_ORDER) {
        push(SEARCH_ENGINE_PREFIXES[prefix]);
    }
    for (const key of Object.values(SEARCH_ENGINE_PREFIXES)) {
        push(key);
    }
    for (const key of Object.keys(SEARCH_ENGINES)) {
        push(key);
    }
    return ordered;
}

/**
 * Engine chips for the inline ?? answer pane — one per available engine, built
 * for the given terms. Jira/Confluence appear as `disabled` chips when their
 * site URL is unset (activating one shows the same settings toast as today).
 * Registry-derived, so adding an engine/prefix auto-adds a chip.
 * @returns [] when terms are empty.
 */
export function getAvailableWebSearchEngines(
    terms: string,
    settings: Pick<AppSettings, 'jiraSiteUrl' | 'confluenceSiteUrl'>,
): WebSearchEngineChip[] {
    const trimmed = terms.trim();
    if (!trimmed) {
        return [];
    }
    const chips: WebSearchEngineChip[] = [];
    for (const key of allWebSearchEngineKeys()) {
        const built = buildWebSearchUrl(
            { engineKey: key, searchTerms: trimmed, usedPrefix: false },
            settings,
        );
        const displayName = getWebSearchEngineDisplayName(key);
        if ('error' in built) {
            if (built.error === 'no-jira-site' || built.error === 'no-confluence-site') {
                chips.push({
                    key,
                    displayName,
                    url: '',
                    mode: key === 'confluence' ? 'confluence' : 'jira-jql',
                    disabled: true,
                    disabledReason: built.error,
                });
            }
            // 'no-terms' is unreachable here (trimmed is non-empty); unknown keys are skipped.
            continue;
        }
        chips.push({ key, displayName, url: built.url, mode: built.mode });
    }
    return chips;
}
