// favicon-cache.ts — Local favicon caching to reduce Google API calls

import { Logger } from '../core/logger';

const logger = Logger.forComponent('FaviconCache');

const FAVICON_DB_NAME = 'SmrutiCortex_Favicons';
const FAVICON_DB_VERSION = 1;
const FAVICON_STORE_NAME = 'favicons';

// Cache expiry: 30 days for successful favicons
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// Negative cache expiry: 7 days for failed fetches (avoids retrying broken hostnames)
const NEGATIVE_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Sentinel value stored for hostnames where favicon fetch failed
const NEGATIVE_SENTINEL = '__FAVICON_NOT_FOUND__';

// Fetch timeout: 5 seconds max per favicon request
const FETCH_TIMEOUT_MS = 5000;

interface CachedFavicon {
    hostname: string;
    dataUrl: string;  // Base64 encoded favicon, or NEGATIVE_SENTINEL for failed fetches
    cachedAt: number;
    size: number;     // Size in bytes for quota tracking
}

let faviconDb: IDBDatabase | null = null;

// In-flight deduplication: prevents concurrent fetches for the same hostname
const pendingFetches = new Map<string, Promise<string | null>>();

/**
 * Check if a hostname should be skipped entirely (will never have a valid favicon)
 */
function shouldSkipFavicon(hostname: string): boolean {
    if (!hostname) return true;
    // Localhost and loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    // IPv4 addresses
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return true;
    // IPv6 addresses (bracketed or raw)
    if (hostname.startsWith('[') || hostname.includes('::')) return true;
    // Local/internal network domains
    if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) return true;
    // Chrome internal pages
    if (hostname === 'newtab' || hostname === 'extensions' || hostname.endsWith('.chrome')) return true;
    return false;
}

/**
 * Open the favicon cache database
 */
export async function openFaviconDatabase(): Promise<IDBDatabase> {
    if (faviconDb) {
        return faviconDb;
    }

    return new Promise((resolve, reject) => {
        logger.debug('openFaviconDatabase', 'Opening favicon cache database...');
        const request = indexedDB.open(FAVICON_DB_NAME, FAVICON_DB_VERSION);

        request.onerror = () => {
            logger.error('openFaviconDatabase', 'Failed to open favicon database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            faviconDb = request.result;
            logger.debug('openFaviconDatabase', 'Favicon database opened successfully');
            resolve(faviconDb);
        };

        request.onupgradeneeded = () => {
            logger.info('openFaviconDatabase', 'Creating favicon cache store...');
            const db = request.result;
            if (!db.objectStoreNames.contains(FAVICON_STORE_NAME)) {
                const store = db.createObjectStore(FAVICON_STORE_NAME, { keyPath: 'hostname' });
                store.createIndex('cachedAt', 'cachedAt', { unique: false });
                logger.info('openFaviconDatabase', 'Favicon cache store created');
            }
        };
    });
}

/**
 * Get a cached favicon by hostname.
 * Returns: { dataUrl, isNegative } where isNegative=true means "we know this has no favicon"
 */
async function getCachedEntry(hostname: string): Promise<{ dataUrl: string | null; isNegative: boolean }> {
    try {
        const db = await openFaviconDatabase();

        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readonly');
            const store = txn.objectStore(FAVICON_STORE_NAME);
            const request = store.get(hostname);

            request.onsuccess = () => {
                const cached = request.result as CachedFavicon | undefined;

                if (!cached) {
                    resolve({ dataUrl: null, isNegative: false });
                    return;
                }

                const age = Date.now() - cached.cachedAt;
                const isNegative = cached.dataUrl === NEGATIVE_SENTINEL;

                // Check expiry: negative entries expire sooner than positive ones
                const expiryMs = isNegative ? NEGATIVE_CACHE_EXPIRY_MS : CACHE_EXPIRY_MS;
                if (age > expiryMs) {
                    logger.trace('getCachedEntry', `Cache expired for ${hostname} (${isNegative ? 'negative' : 'positive'})`);
                    resolve({ dataUrl: null, isNegative: false });
                    return;
                }

                if (isNegative) {
                    logger.trace('getCachedEntry', `Negative cache hit for ${hostname} — skipping fetch`);
                    resolve({ dataUrl: null, isNegative: true });
                    return;
                }

                logger.trace('getCachedEntry', `Cache hit for ${hostname}`);
                resolve({ dataUrl: cached.dataUrl, isNegative: false });
            };

            request.onerror = () => {
                logger.warn('getCachedEntry', `Failed to get cached favicon for ${hostname}:`, request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        logger.warn('getCachedEntry', 'Error getting cached favicon:', error);
        return { dataUrl: null, isNegative: false };
    }
}

/**
 * Public wrapper — returns cached dataUrl or null (unchanged API for callers)
 */
export async function getCachedFavicon(hostname: string): Promise<string | null> {
    const entry = await getCachedEntry(hostname);
    return entry.dataUrl;
}

/**
 * Store a negative cache entry for a hostname that failed to fetch
 */
async function storeNegativeEntry(hostname: string): Promise<void> {
    try {
        const db = await openFaviconDatabase();

        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readwrite');
            const store = txn.objectStore(FAVICON_STORE_NAME);

            const entry: CachedFavicon = {
                hostname,
                dataUrl: NEGATIVE_SENTINEL,
                cachedAt: Date.now(),
                size: 0,
            };

            const request = store.put(entry);
            request.onsuccess = () => {
                logger.trace('storeNegativeEntry', `Stored negative cache for ${hostname} (won't retry for 7 days)`);
                resolve();
            };
            request.onerror = () => {
                logger.warn('storeNegativeEntry', `Failed to store negative entry for ${hostname}:`, request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        logger.warn('storeNegativeEntry', 'Error storing negative entry:', error);
    }
}

/**
 * Cache a favicon (fetch from Google API and store locally)
 */
export async function cacheFavicon(hostname: string): Promise<string | null> {
    try {
        // Fetch favicon from Google API with timeout
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

        logger.trace('cacheFavicon', `Fetching favicon for ${hostname}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(faviconUrl, { signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            logger.warn('cacheFavicon', `Failed to fetch favicon for ${hostname}: ${response.status}`);
            await storeNegativeEntry(hostname);
            return null;
        }

        const blob = await response.blob();

        // Convert to base64 data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        // Store in cache
        const db = await openFaviconDatabase();

        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readwrite');
            const store = txn.objectStore(FAVICON_STORE_NAME);

            const cachedFavicon: CachedFavicon = {
                hostname,
                dataUrl,
                cachedAt: Date.now(),
                size: dataUrl.length,
            };

            const request = store.put(cachedFavicon);

            request.onsuccess = () => {
                logger.trace('cacheFavicon', `Cached favicon for ${hostname} (${Math.round(dataUrl.length / 1024)}KB)`);
                resolve(dataUrl);
            };

            request.onerror = () => {
                logger.warn('cacheFavicon', `Failed to cache favicon for ${hostname}:`, request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        logger.warn('cacheFavicon', `Error caching favicon for ${hostname}:`, error);
        // Store negative entry so we don't retry on network/timeout errors
        await storeNegativeEntry(hostname);
        return null;
    }
}

/**
 * Get favicon with caching (check cache first, then fetch if needed).
 * Includes: hostname skip list, negative caching, and in-flight deduplication.
 */
export async function getFaviconWithCache(hostname: string): Promise<string | null> {
    // Skip hostnames that will never have a valid favicon
    if (shouldSkipFavicon(hostname)) {
        return null;
    }

    // Check cache (handles both positive and negative entries)
    const cached = await getCachedEntry(hostname);
    if (cached.dataUrl) {
        return cached.dataUrl;  // Positive cache hit
    }
    if (cached.isNegative) {
        return null;  // Known-bad hostname, don't re-fetch
    }

    // In-flight deduplication: if another request for this hostname is already pending, reuse it
    const pending = pendingFetches.get(hostname);
    if (pending) {
        logger.trace('getFaviconWithCache', `Reusing in-flight fetch for ${hostname}`);
        return pending;
    }

    // Cache miss — fetch, store, and deduplicate
    const fetchPromise = cacheFavicon(hostname).finally(() => {
        pendingFetches.delete(hostname);
    });

    pendingFetches.set(hostname, fetchPromise);
    return fetchPromise;
}

/**
 * Clear all cached favicons
 */
export async function clearFaviconCache(): Promise<{ cleared: number; freedBytes: number }> {
    logger.info('clearFaviconCache', 'Clearing all cached favicons...');

    try {
        const db = await openFaviconDatabase();

        // First count what we're clearing
        const stats = await getFaviconCacheStats();

        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readwrite');
            const store = txn.objectStore(FAVICON_STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => {
                logger.info('clearFaviconCache', `Cleared ${stats.count} favicons, freed ${Math.round(stats.totalSize / 1024)}KB`);
                resolve({ cleared: stats.count, freedBytes: stats.totalSize });
            };

            request.onerror = () => {
                logger.error('clearFaviconCache', 'Failed to clear favicon cache:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        logger.error('clearFaviconCache', 'Error clearing favicon cache:', error);
        return { cleared: 0, freedBytes: 0 };
    }
}

/**
 * Clear expired favicons only (positive: >30d, negative: >7d)
 */
export async function clearExpiredFavicons(): Promise<number> {
    logger.info('clearExpiredFavicons', 'Clearing expired favicons...');

    try {
        const db = await openFaviconDatabase();
        const now = Date.now();
        let cleared = 0;

        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readwrite');
            const store = txn.objectStore(FAVICON_STORE_NAME);
            const cursorRequest = store.openCursor();

            cursorRequest.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const favicon = cursor.value as CachedFavicon;
                    const isNegative = favicon.dataUrl === NEGATIVE_SENTINEL;
                    const expiryMs = isNegative ? NEGATIVE_CACHE_EXPIRY_MS : CACHE_EXPIRY_MS;

                    if (now - favicon.cachedAt > expiryMs) {
                        cursor.delete();
                        cleared++;
                    }
                    cursor.continue();
                } else {
                    logger.info('clearExpiredFavicons', `Cleared ${cleared} expired favicons`);
                    resolve(cleared);
                }
            };

            cursorRequest.onerror = () => {
                logger.error('clearExpiredFavicons', 'Failed to clear expired favicons:', cursorRequest.error);
                reject(cursorRequest.error);
            };
        });
    } catch (error) {
        logger.error('clearExpiredFavicons', 'Error clearing expired favicons:', error);
        return 0;
    }
}

/**
 * Get favicon cache statistics (excludes negative entries from counts)
 */
export async function getFaviconCacheStats(): Promise<{ count: number; totalSize: number; oldestCacheDate: number | null }> {
    try {
        const db = await openFaviconDatabase();

        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readonly');
            const store = txn.objectStore(FAVICON_STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const all = request.result as CachedFavicon[];
                // Only count real favicons (not negative entries) in user-facing stats
                const favicons = all.filter(f => f.dataUrl !== NEGATIVE_SENTINEL);
                const count = favicons.length;
                const totalSize = favicons.reduce((sum, f) => sum + f.size, 0);
                const oldestCacheDate = favicons.length > 0
                    ? Math.min(...favicons.map(f => f.cachedAt))
                    : null;

                resolve({ count, totalSize, oldestCacheDate });
            };

            request.onerror = () => {
                logger.error('getFaviconCacheStats', 'Failed to get favicon cache stats:', request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        logger.error('getFaviconCacheStats', 'Error getting favicon cache stats:', error);
        return { count: 0, totalSize: 0, oldestCacheDate: null };
    }
}
