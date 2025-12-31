// favicon-cache.ts — Local favicon caching to reduce Google API calls

import { Logger } from '../core/logger';

const logger = Logger.forComponent('FaviconCache');

const FAVICON_DB_NAME = 'SmrutiCortex_Favicons';
const FAVICON_DB_VERSION = 1;
const FAVICON_STORE_NAME = 'favicons';

// Cache expiry: 30 days
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedFavicon {
    hostname: string;
    dataUrl: string;  // Base64 encoded favicon
    cachedAt: number;
    size: number;     // Size in bytes for quota tracking
}

let faviconDb: IDBDatabase | null = null;

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
 * Get a cached favicon by hostname
 */
export async function getCachedFavicon(hostname: string): Promise<string | null> {
    try {
        const db = await openFaviconDatabase();
        
        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readonly');
            const store = txn.objectStore(FAVICON_STORE_NAME);
            const request = store.get(hostname);

            request.onsuccess = () => {
                const cached = request.result as CachedFavicon | undefined;
                
                if (!cached) {
                    resolve(null);
                    return;
                }

                // Check if cache has expired
                if (Date.now() - cached.cachedAt > CACHE_EXPIRY_MS) {
                    logger.trace('getCachedFavicon', `Cache expired for ${hostname}`);
                    resolve(null);
                    return;
                }

                logger.trace('getCachedFavicon', `Cache hit for ${hostname}`);
                resolve(cached.dataUrl);
            };

            request.onerror = () => {
                logger.warn('getCachedFavicon', `Failed to get cached favicon for ${hostname}:`, request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        logger.warn('getCachedFavicon', 'Error getting cached favicon:', error);
        return null;
    }
}

/**
 * Cache a favicon (fetch from Google API and store locally)
 */
export async function cacheFavicon(hostname: string): Promise<string | null> {
    try {
        // Fetch favicon from Google API
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
        
        logger.trace('cacheFavicon', `Fetching favicon for ${hostname}...`);
        
        const response = await fetch(faviconUrl);
        if (!response.ok) {
            logger.warn('cacheFavicon', `Failed to fetch favicon for ${hostname}: ${response.status}`);
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
        return null;
    }
}

/**
 * Get favicon with caching (check cache first, then fetch if needed)
 */
export async function getFaviconWithCache(hostname: string): Promise<string | null> {
    // First try cache
    const cached = await getCachedFavicon(hostname);
    if (cached) {
        return cached;
    }

    // Cache miss - fetch and store
    return await cacheFavicon(hostname);
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
 * Clear expired favicons only
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
                    if (now - favicon.cachedAt > CACHE_EXPIRY_MS) {
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
 * Get favicon cache statistics
 */
export async function getFaviconCacheStats(): Promise<{ count: number; totalSize: number; oldestCacheDate: number | null }> {
    try {
        const db = await openFaviconDatabase();

        return new Promise((resolve, reject) => {
            const txn = db.transaction(FAVICON_STORE_NAME, 'readonly');
            const store = txn.objectStore(FAVICON_STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const favicons = request.result as CachedFavicon[];
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
