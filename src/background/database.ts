// database.ts — Hybrid storage layer with auto-detection for IndexedDB

import { browserAPI } from '../core/helpers';
import { IndexedItem } from './schema';
import { DB_NAME } from '../core/constants';
import { Logger } from '../core/logger';

const DB_VERSION = 1;
const STORE_NAME = 'pages';

let dbInstance: IDBDatabase | null = null;

// ------------------------------
// IndexedDB Init
// ------------------------------
export function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        Logger.debug('Opening database...');
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            Logger.error('Open error:', request.error);
            reject(request.error);
        };
        request.onsuccess = () => {
            dbInstance = request.result;
            Logger.debug('Database opened successfully');
            resolve(dbInstance);
        };

        request.onupgradeneeded = () => {
            Logger.trace('Database upgrade needed, creating object store');
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('hostname', 'hostname', { unique: false });
                store.createIndex('lastVisit', 'lastVisit', { unique: false });
                store.createIndex('visitCount', 'visitCount', { unique: false });
                Logger.trace('Object store and indexes created');
            }
        };
    });
}

// ------------------------------
// Add or Update Page Entry
// ------------------------------
export async function saveIndexedItem(item: IndexedItem): Promise<void> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readwrite');
        const store = txn.objectStore(STORE_NAME);
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ------------------------------
// Query Pages
// ------------------------------
export async function getAllIndexedItems(): Promise<IndexedItem[]> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readonly');
        const store = txn.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => resolve(req.result as IndexedItem[]);
        req.onerror = () => reject(req.error);
    });
}

// ------------------------------
// Cursor-based pagination for large datasets
// ------------------------------
export async function getIndexedItemsBatches(batchSize = 1000): Promise<IndexedItem[][]> {
    const db = dbInstance || await openDatabase();
    const txn = db.transaction(STORE_NAME, 'readonly');
    const store = txn.objectStore(STORE_NAME);
    const request = store.openCursor();

    const batches: IndexedItem[][] = [];
    let batch: IndexedItem[] = [];

    await new Promise<void>((resolve, reject) => {
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

            if (cursor) {
                batch.push(cursor.value as IndexedItem);

                if (batch.length >= batchSize) {
                    batches.push(batch);
                    batch = [];
                }

                cursor.continue();
            } else {
                if (batch.length > 0) {
                    batches.push(batch);
                }
                resolve();
            }
        };

        request.onerror = () => reject(request.error);
    });

    return batches;
}

// Get paginated results (offset-based)
export async function getIndexedItemsPage(offset = 0, limit = 100): Promise<{ items: IndexedItem[]; total: number }> {
    const db = dbInstance || await openDatabase();
    
    // Get total count
    const total = await new Promise<number>((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readonly');
        const store = txn.objectStore(STORE_NAME);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    
    // Get paginated items
    const items = await new Promise<IndexedItem[]>((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readonly');
        const store = txn.objectStore(STORE_NAME);
        
        // Use cursor to skip offset items
        const cursorReq = store.openCursor();
        const results: IndexedItem[] = [];
        let skipped = 0;
        let collected = 0;
        
        cursorReq.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            
            if (cursor) {
                // Skip offset items
                if (skipped < offset) {
                    skipped++;
                    cursor.continue();
                    return;
                }
                
                // Collect items until limit
                if (collected < limit) {
                    results.push(cursor.value as IndexedItem);
                    collected++;
                    cursor.continue();
                } else {
                    resolve(results);
                }
            } else {
                // Reached end
                resolve(results);
            }
        };
        
        cursorReq.onerror = () => reject(cursorReq.error);
    });
    
    return { items, total };
}

// Get recent items sorted by lastVisit (descending)
export async function getRecentIndexedItems(limit = 50): Promise<IndexedItem[]> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readonly');
        const store = txn.objectStore(STORE_NAME);
        const index = store.index('lastVisit');
        
        // Open cursor in descending order (most recent first)
        const request = index.openCursor(null, 'prev');
        const results: IndexedItem[] = [];
        
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            
            if (cursor && results.length < limit) {
                results.push(cursor.value as IndexedItem);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

// database.ts — Hybrid storage layer with auto-detection for IndexedDB
// [existing imports and code above remain the same]

/* === ADD THESE FUNCTIONS INTO database.ts (below saveIndexedItem/getAllIndexedItems) === */

// Get single item by URL (key)
export async function getIndexedItem(url: string): Promise<IndexedItem | null> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readonly');
        const store = txn.objectStore(STORE_NAME);
        const req = store.get(url);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

// Delete item by URL
export async function deleteIndexedItem(url: string): Promise<void> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readwrite');
        const store = txn.objectStore(STORE_NAME);
        const req = store.delete(url);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Clear all data from IndexedDB
export async function clearIndexedDB(): Promise<void> {
    const db = dbInstance || await openDatabase();
    return new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readwrite');
        const store = txn.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// -------------------------------------------------------------------
// chrome.storage.local for settings (universal across all browsers)
// -------------------------------------------------------------------
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
    return new Promise((resolve) => {
        browserAPI.storage.local.get([key], (result) => {
            resolve(result[key] ?? defaultValue);
        });
    });
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve) => {
        browserAPI.storage.local.set({ [key]: value }, () => resolve());
    });
}

// -------------------------------------------------------------------
// Storage Quota Management
// -------------------------------------------------------------------
export interface StorageQuotaInfo {
    used: number;           // Bytes used
    total: number;          // Total bytes available (0 if unlimited/unknown)
    usedFormatted: string;  // Human-readable used (e.g., "12.5 MB")
    totalFormatted: string; // Human-readable total (e.g., "5 GB")
    percentage: number;     // Percentage used (0-100)
    itemCount: number;      // Number of indexed items
}

function formatBytes(bytes: number): string {
    if (bytes === 0) {return '0 B';}
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function getStorageQuotaInfo(): Promise<StorageQuotaInfo> {
    const logger = Logger.forComponent('Database');
    logger.debug('getStorageQuotaInfo', 'Retrieving storage quota information');
    
    try {
        // Get IndexedDB item count
        const items = await getAllIndexedItems();
        const itemCount = items.length;
        
        // Try to get storage estimate (modern browsers)
        let used = 0;
        let total = 0;
        
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                used = estimate.usage || 0;
                total = estimate.quota || 0;
                logger.trace('getStorageQuotaInfo', 'Storage estimate retrieved', { used, total });
            } catch (e) {
                logger.debug('getStorageQuotaInfo', 'Storage estimate not available, using fallback');
            }
        }
        
        // Fallback: estimate based on item count (rough estimate: ~1KB per item average)
        if (used === 0 && itemCount > 0) {
            used = itemCount * 1024; // Rough estimate
            logger.trace('getStorageQuotaInfo', 'Using item-based estimate', { itemCount, estimatedBytes: used });
        }
        
        const percentage = total > 0 ? Math.round((used / total) * 100) : 0;
        
        const info: StorageQuotaInfo = {
            used,
            total,
            usedFormatted: formatBytes(used),
            totalFormatted: total > 0 ? formatBytes(total) : 'Unlimited',
            percentage,
            itemCount,
        };
        
        logger.info('getStorageQuotaInfo', 'Storage quota info', info);
        return info;
    } catch (error) {
        logger.error('getStorageQuotaInfo', 'Failed to get storage quota', error);
        return {
            used: 0,
            total: 0,
            usedFormatted: 'Unknown',
            totalFormatted: 'Unknown',
            percentage: 0,
            itemCount: 0,
        };
    }
}

// Force rebuild index flag
export async function setForceRebuildFlag(value: boolean): Promise<void> {
    await setSetting('forceRebuildIndex', value);
    Logger.info('setForceRebuildFlag', value ? '🔄 Force rebuild flag set' : '✅ Force rebuild flag cleared');
}

export async function getForceRebuildFlag(): Promise<boolean> {
    return getSetting<boolean>('forceRebuildIndex', false);
}