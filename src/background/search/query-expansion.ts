// query-expansion.ts — Expand search queries with synonyms and related terms

import { Logger } from '../../core/logger';

const logger = Logger.forComponent('QueryExpansion');

/**
 * Common synonym mappings for query expansion
 * Format: { term: [synonyms/related words] }
 */
const SYNONYM_MAP: { [key: string]: string[] } = {
    // Tech terms
    'javascript': ['js', 'ecmascript', 'node', 'nodejs'],
    'typescript': ['ts'],
    'python': ['py', 'python3'],
    'react': ['reactjs', 'react.js'],
    'vue': ['vuejs', 'vue.js'],
    'angular': ['angularjs', 'ng'],
    'github': ['gh', 'git'],
    'stackoverflow': ['so', 'stack overflow'],
    'documentation': ['docs', 'doc', 'reference', 'manual'],
    'tutorial': ['guide', 'howto', 'how-to', 'learn'],
    'example': ['sample', 'demo', 'snippet'],
    'error': ['bug', 'issue', 'problem', 'exception', 'failure'],
    'fix': ['solve', 'solution', 'resolve', 'patch'],
    'install': ['setup', 'configure', 'installation'],
    'api': ['endpoint', 'interface', 'rest', 'graphql'],
    'database': ['db', 'sql', 'nosql', 'storage'],
    'config': ['configuration', 'settings', 'options'],
    'auth': ['authentication', 'login', 'signin', 'authorization'],
    'deploy': ['deployment', 'release', 'publish', 'ship'],
    
    // Common abbreviations
    'repo': ['repository'],
    'pr': ['pull request', 'pullrequest'],
    'mr': ['merge request'],
    'ci': ['continuous integration', 'pipeline'],
    'cd': ['continuous deployment', 'continuous delivery'],
    
    // Media
    'video': ['youtube', 'vimeo', 'watch'],
    'image': ['img', 'picture', 'photo', 'graphic'],
    'music': ['song', 'audio', 'spotify', 'soundcloud'],
    'movie': ['film', 'cinema', 'netflix', 'stream'],
    
    // Shopping/Commerce
    'buy': ['purchase', 'order', 'shop', 'cart'],
    'price': ['cost', 'pricing', 'rate', 'fee'],
    'discount': ['sale', 'deal', 'offer', 'coupon'],
    
    // Social
    'post': ['article', 'blog', 'tweet', 'message'],
    'share': ['send', 'forward', 'repost'],
    'comment': ['reply', 'response', 'feedback'],
    
    // Search/Navigation
    'find': ['search', 'locate', 'discover', 'lookup'],
    'home': ['main', 'index', 'landing'],
    'about': ['info', 'information', 'contact'],
    
    // Actions
    'download': ['save', 'get', 'fetch'],
    'upload': ['submit', 'send', 'post'],
    'delete': ['remove', 'clear', 'erase'],
    'edit': ['modify', 'change', 'update'],
    'create': ['new', 'add', 'make'],
};

// Reverse map for bidirectional lookup
const REVERSE_SYNONYM_MAP: { [key: string]: string[] } = {};

// Build reverse map
for (const [term, synonyms] of Object.entries(SYNONYM_MAP)) {
    for (const syn of synonyms) {
        const synLower = syn.toLowerCase();
        if (!REVERSE_SYNONYM_MAP[synLower]) {
            REVERSE_SYNONYM_MAP[synLower] = [];
        }
        if (!REVERSE_SYNONYM_MAP[synLower].includes(term)) {
            REVERSE_SYNONYM_MAP[synLower].push(term);
        }
    }
}

/**
 * Expand a single term with synonyms
 */
export function expandTerm(term: string): string[] {
    const termLower = term.toLowerCase();
    const expanded: Set<string> = new Set([termLower]);
    
    // Check forward map
    if (SYNONYM_MAP[termLower]) {
        for (const syn of SYNONYM_MAP[termLower]) {
            expanded.add(syn.toLowerCase());
        }
    }
    
    // Check reverse map
    if (REVERSE_SYNONYM_MAP[termLower]) {
        for (const primary of REVERSE_SYNONYM_MAP[termLower]) {
            expanded.add(primary);
            // Also add other synonyms of the primary term
            if (SYNONYM_MAP[primary]) {
                for (const syn of SYNONYM_MAP[primary]) {
                    expanded.add(syn.toLowerCase());
                }
            }
        }
    }
    
    return Array.from(expanded);
}

/**
 * Expand a query with synonyms and related terms
 * Returns array of expanded terms for each word in the query
 */
export function expandQuery(query: string): { original: string; expanded: string[] }[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const result: { original: string; expanded: string[] }[] = [];
    
    for (const word of words) {
        const expanded = expandTerm(word);
        result.push({ original: word, expanded });
        
        if (expanded.length > 1) {
            logger.trace('expandQuery', `Expanded "${word}" to [${expanded.join(', ')}]`);
        }
    }
    
    return result;
}

/**
 * Get all expanded terms as a flat array (for search matching)
 */
export function getExpandedTerms(query: string): string[] {
    const expansion = expandQuery(query);
    const allTerms: Set<string> = new Set();
    
    for (const { expanded } of expansion) {
        for (const term of expanded) {
            allTerms.add(term);
        }
    }
    
    return Array.from(allTerms);
}

/**
 * Check if text matches any expanded term from query
 */
export function matchesExpandedQuery(text: string, expandedTerms: string[]): boolean {
    const textLower = text.toLowerCase();
    return expandedTerms.some(term => textLower.includes(term));
}

/**
 * Add custom synonym mapping (for user-defined expansions)
 */
export function addCustomSynonym(term: string, synonyms: string[]): void {
    const termLower = term.toLowerCase();
    
    if (!SYNONYM_MAP[termLower]) {
        SYNONYM_MAP[termLower] = [];
    }
    
    for (const syn of synonyms) {
        const synLower = syn.toLowerCase();
        if (!SYNONYM_MAP[termLower].includes(synLower)) {
            SYNONYM_MAP[termLower].push(synLower);
        }
        
        // Update reverse map
        if (!REVERSE_SYNONYM_MAP[synLower]) {
            REVERSE_SYNONYM_MAP[synLower] = [];
        }
        if (!REVERSE_SYNONYM_MAP[synLower].includes(termLower)) {
            REVERSE_SYNONYM_MAP[synLower].push(termLower);
        }
    }
    
    logger.debug('addCustomSynonym', `Added synonyms for "${term}": [${synonyms.join(', ')}]`);
}
