// constants.ts — Centralized constants for SmrutiCortex

export const BRAND_NAME = 'SmrutiCortex';
export const DB_NAME = 'smruti_cortex_db';
export const INJECTED_FLAG = '__smruti_cortex_injected';

/**
 * Sort options for search results
 */
export enum SortBy {
  BEST_MATCH = 'best-match',      // Default: Use scorer algorithm
  MOST_RECENT = 'most-recent',    // Sort by lastVisit descending
  MOST_VISITED = 'most-visited',  // Sort by visitCount descending
  ALPHABETICAL = 'alphabetical'   // Sort by title ascending
}

/**
 * URL patterns for sensitive sites where metadata extraction should be skipped
 * Covers banking, password managers, auth pages, and payment processors
 */
export const SENSITIVE_SITE_PATTERNS = [
    // Banking keywords
    'bank',
    'banking',
    'onlinebanking',
    
    // Authentication/login pages
    'login',
    'signin',
    'signup',
    'auth',
    'authenticate',
    'sso',
    'oauth',
    
    // Password managers
    '1password',
    'lastpass',
    'bitwarden',
    'dashlane',
    'keepass',
    
    // Payment processors
    'paypal',
    'stripe',
    'square',
    'payment',
    
    // Financial
    'creditcard',
    'debitcard',
    'account/security',
    'account/password',
];

/**
 * Known domains for sensitive sites (banks, password managers, etc.)
 * These domains will always skip metadata extraction
 */
export const SENSITIVE_DOMAINS = [
    // Major banks
    'chase.com',
    'bankofamerica.com',
    'wellsfargo.com',
    'citi.com',
    'usbank.com',
    'capitalone.com',
    'pnc.com',
    'tdbank.com',
    'ally.com',
    
    // Password managers
    '1password.com',
    'lastpass.com',
    'bitwarden.com',
    'dashlane.com',
    'keeper.com',
    
    // Payment processors
    'paypal.com',
    'stripe.com',
    'square.com',
    
    // Crypto exchanges
    'coinbase.com',
    'binance.com',
    'kraken.com',
];