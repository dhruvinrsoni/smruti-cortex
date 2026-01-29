// indexing.ts — URL ingestion, merging, enrichment, and storage

import { browserAPI } from '../core/helpers';
import { saveIndexedItem, getIndexedItem, getSetting, setSetting, clearIndexedDB } from './database';
import { tokenize } from './search/tokenizer';
import { IndexedItem } from './schema';
import { BRAND_NAME } from '../core/constants';
import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';

const logger = Logger.forComponent('Indexing');

/**
 * Generate embedding for an indexed item if semantic search is enabled
 */
async function generateItemEmbedding(item: { title: string; metaDescription?: string; url: string }): Promise<number[] | undefined> {
    try {
        // Check if embeddings are enabled
        const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') || false;
        if (!embeddingsEnabled) {
            return undefined; // Skip embedding generation
        }

        // Lazy import to avoid circular dependencies
        const { getOllamaService } = await import('./ollama-service');
        const ollamaService = getOllamaService();

        // Create text for embedding (title + description + url)
        const text = `${item.title} ${item.metaDescription || ''} ${item.url}`.trim();

        logger.debug('generateItemEmbedding', `🧠 Generating embedding for: "${item.title.substring(0, 50)}..."`);

        const result = await ollamaService.generateEmbedding(text);

        if (result.success && result.embedding.length > 0) {
            logger.trace('generateItemEmbedding', `✅ Embedding generated (${result.embedding.length} dimensions)`);
            return result.embedding;
        } else {
            logger.debug('generateItemEmbedding', '⚠️ Embedding generation failed or returned empty');
            return undefined;
        }
    } catch (error) {
        logger.debug('generateItemEmbedding', '⚠️ Embedding generation error (non-critical):', error);
        return undefined; // Don't fail indexing if embeddings fail
    }
}

/**
 * Force a full rebuild of the index (used after CLEAR_ALL_DATA or manual rebuild)
 */
export async function performFullRebuild(): Promise<void> {
    const startTime = Date.now();
    logger.info('performFullRebuild', '🔄 Starting FULL INDEX REBUILD (user requested)');
    
    try {
        // Clear existing data first
        logger.info('performFullRebuild', '🗑️ Clearing existing index data...');
        await clearIndexedDB();
        
        // Perform full history index
        await performFullHistoryIndex();
        
        // Index bookmarks if enabled
        await SettingsManager.init();
        const indexBookmarks = SettingsManager.getSetting('indexBookmarks');
        if (indexBookmarks) {
            await performBookmarksIndex(true);
        }
        
        // Update version marker
        const currentVersion = chrome.runtime.getManifest().version;
        await setSetting('lastIndexedVersion', currentVersion);
        await setSetting('lastIndexedTimestamp', Date.now());
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info('performFullRebuild', `✅ Full rebuild completed in ${duration}s`);
    } catch (error) {
        logger.error('performFullRebuild', '❌ Full rebuild failed:', error);
        throw error;
    }
}

export async function ingestHistory(): Promise<void> {
    const overallStartTime = Date.now();
    // Check extension version for re-indexing decision
    const currentVersion = chrome.runtime.getManifest().version;
    const lastIndexedVersion = await getSetting<string>('lastIndexedVersion', '0.0.0');

    logger.debug('ingestHistory', '[Indexing] Version check', { currentVersion, lastIndexedVersion });

    // If version changed, we need to re-index
    const needsFullReindex = compareVersions(currentVersion, lastIndexedVersion) > 0;

    // Only log detailed start for full re-indexes, keep incremental quiet
    if (needsFullReindex) {
        logger.info('ingestHistory', '🔄 FULL RE-INDEX: Extension updated, rebuilding history index', {
            fromVersion: lastIndexedVersion,
            toVersion: currentVersion
        });
    }

    if (needsFullReindex) {
        await performFullHistoryIndex();
        await setSetting('lastIndexedVersion', currentVersion);
        await setSetting('lastIndexedTimestamp', Date.now());
    } else {
        // Check if we need incremental indexing
        const lastIndexedTimestamp = await getSetting<number>('lastIndexedTimestamp', 0);
        const now = Date.now();
        const timeSinceLastIndex = now - lastIndexedTimestamp;

        // Only index if it's been more than 30 minutes since last index
        if (timeSinceLastIndex < 30 * 60 * 1000) {
            logger.debug('ingestHistory', '[Indexing] Skipping incremental index, too recent', {
                timeSinceLastIndex: Math.round(timeSinceLastIndex / 1000 / 60),
                minutes: 'minutes ago'
            });
            return;
        }

        logger.info('ingestHistory', '[Indexing] Performing incremental history index');
        await performIncrementalHistoryIndex(lastIndexedTimestamp);
        await setSetting('lastIndexedTimestamp', now);
    }

    const overallDuration = Date.now() - overallStartTime;
    // Only log completion summary for full re-indexes
    if (needsFullReindex) {
        logger.info('ingestHistory', `✅ Index rebuild completed in ${Math.round(overallDuration / 1000)}s`);
    }
}

async function performFullHistoryIndex(): Promise<void> {
    const startTime = Date.now();
    logger.info('performFullHistoryIndex', '[Indexing] Starting full history index...');

    // Clear any existing data first
    await clearIndexedData();

    // Get history in chunks to access older items
    const allHistoryItems = await getFullHistory();
    const indexingDuration = Date.now() - startTime;
    logger.info('performFullHistoryIndex', `[Indexing] History retrieval completed in ${indexingDuration}ms`, {
        totalItems: allHistoryItems.length,
        retrievalTimeMs: indexingDuration
    });

    // Warn if history is very large (potential performance impact)
    if (allHistoryItems.length > 50000) {
        const estimatedBatches = Math.ceil(allHistoryItems.length / 2000);
        const estimatedTimeMinutes = Math.ceil(estimatedBatches * 0.1); // Rough estimate: 100ms per batch
        logger.warn('performFullHistoryIndex', '[Indexing] Large history detected, indexing may take time', {
            itemCount: allHistoryItems.length,
            estimatedBatches,
            estimatedTimeMinutes: `${estimatedTimeMinutes} minutes`
        });
    }

    // Process in batches to avoid blocking
    const batchSize = 2000;
    let processedItems = 0;
    const batchStartTime = Date.now();

    for (let i = 0; i < allHistoryItems.length; i += batchSize) {
        const batch = allHistoryItems.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(allHistoryItems.length / batchSize);

        logger.debug('performFullHistoryIndex', '[Indexing] Processing batch', {
            batch: `${batchNumber}/${totalBatches}`,
            items: `${i + 1}-${Math.min(i + batchSize, allHistoryItems.length)}`,
            total: allHistoryItems.length,
            progressPercent: Math.round(((i + batch.length) / allHistoryItems.length) * 100)
        });

        for (const item of batch) {
            try {
                const indexed: IndexedItem = {
                    url: item.url,
                    title: item.title || '',
                    hostname: new URL(item.url).hostname,
                    metaDescription: '',
                    metaKeywords: [],
                    visitCount: item.visitCount || 1,
                    lastVisit: item.lastVisitTime || Date.now(),
                    tokens: tokenize(item.title + ' ' + item.url),
                };

                // NOTE: We DON'T generate embeddings during initial indexing to avoid hour-long waits
                // Embeddings will be generated on-demand during search if semantic search is enabled
                // indexed.embedding = await generateItemEmbedding(indexed);

                await saveIndexedItem(indexed);
                processedItems++;
            } catch (error) {
                logger.warn('performFullHistoryIndex', '[Indexing] Failed to index item', { url: item.url, error: error.message });
            }
        }

        // Small delay between batches to prevent blocking
        if (i + batchSize < allHistoryItems.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    const totalDuration = Date.now() - startTime;
    const processingDuration = Date.now() - batchStartTime;
    logger.info('performFullHistoryIndex', '[Indexing] Full history indexing completed', {
        totalItems: allHistoryItems.length,
        processedItems,
        failedItems: allHistoryItems.length - processedItems,
        totalDurationMs: totalDuration,
        processingDurationMs: processingDuration,
        itemsPerSecond: Math.round((processedItems / processingDuration) * 1000)
    });
}

/**
 * Perform incremental history indexing (for regular updates)
 */
async function performIncrementalHistoryIndex(sinceTimestamp: number): Promise<void> {
    const startTime = Date.now();

    // Get only items visited since the last index
    const newHistoryItems = await getHistorySince(sinceTimestamp);
    if (newHistoryItems.length === 0) {
        return; // Nothing to index
    }

    let updated = 0;
    let added = 0;

    // Process in batches to avoid blocking for large incremental updates
    const batchSize = 1000;

    for (let i = 0; i < newHistoryItems.length; i += batchSize) {
        const batch = newHistoryItems.slice(i, i + batchSize);

        for (const item of batch) {
            try {
                // Check if we already have this URL
                const existing = await getIndexedItem(item.url);

                if (existing) {
                    // Only update if this visit is more recent
                    if (item.lastVisitTime > existing.lastVisit) {
                        const updatedItem: IndexedItem = {
                            ...existing,
                            visitCount: Math.max(existing.visitCount, item.visitCount || 1),
                            lastVisit: item.lastVisitTime,
                            title: item.title || existing.title, // Prefer newer title if available
                        };
                        await saveIndexedItem(updatedItem);
                        updated++;
                    }
                } else {
                    // Create new indexed item
                    const indexed: IndexedItem = {
                        url: item.url,
                        title: item.title || '',
                        hostname: new URL(item.url).hostname,
                        metaDescription: '',
                        metaKeywords: [],
                        visitCount: item.visitCount || 1,
                        lastVisit: item.lastVisitTime,
                        tokens: tokenize(item.title + ' ' + item.url),
                    };

                    // NOTE: Embeddings generated on-demand during search, not during indexing
                    // indexed.embedding = await generateItemEmbedding(indexed);

                    await saveIndexedItem(indexed);
                    added++;
                }
                // processedItems tracked but not used for logging
            } catch (error) {
                logger.warn('performIncrementalHistoryIndex', '[Indexing] Failed to index item', { url: item.url, error: error.message });
                // failed tracked but not used for logging
            }
        }

        // Small delay between batches to prevent blocking
        if (i + batchSize < newHistoryItems.length) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }

    const totalDuration = Date.now() - startTime;

    // Only log if there were actual changes
    if (added > 0 || updated > 0) {
        const hoursIndexed = Math.round((Date.now() - sinceTimestamp) / (1000 * 60 * 60));
        logger.info('performIncrementalHistoryIndex', `📈 Indexed ${added} new, ${updated} updated URLs (${hoursIndexed}h) in ${Math.round(totalDuration / 1000)}s`);
    }
}

/**
 * Perform incremental history indexing for manual user trigger (returns detailed results)
 */
export async function performIncrementalHistoryIndexManual(sinceTimestamp: number): Promise<{
    added: number;
    updated: number;
    total: number;
    duration: number;
}> {
    const startTime = Date.now();

    // Get only items visited since the last index
    const newHistoryItems = await getHistorySince(sinceTimestamp);
    
    if (newHistoryItems.length === 0) {
        return { added: 0, updated: 0, total: 0, duration: 0 };
    }

    let updated = 0;
    let added = 0;

    // Process in batches to avoid blocking for large incremental updates
    const batchSize = 1000;

    for (let i = 0; i < newHistoryItems.length; i += batchSize) {
        const batch = newHistoryItems.slice(i, i + batchSize);

        for (const item of batch) {
            try {
                // Check if we already have this URL
                const existing = await getIndexedItem(item.url);

                if (existing) {
                    // Only update if this visit is more recent
                    if (item.lastVisitTime > existing.lastVisit) {
                        const updatedItem: IndexedItem = {
                            ...existing,
                            visitCount: Math.max(existing.visitCount, item.visitCount || 1),
                            lastVisit: item.lastVisitTime,
                            title: item.title || existing.title, // Prefer newer title if available
                        };
                        await saveIndexedItem(updatedItem);
                        updated++;
                    }
                } else {
                    // Create new indexed item
                    const indexed: IndexedItem = {
                        url: item.url,
                        title: item.title || '',
                        hostname: new URL(item.url).hostname,
                        metaDescription: '',
                        metaKeywords: [],
                        visitCount: item.visitCount || 1,
                        lastVisit: item.lastVisitTime,
                        tokens: tokenize(item.title + ' ' + item.url),
                    };

                    await saveIndexedItem(indexed);
                    added++;
                }
            } catch (error) {
                logger.warn('performIncrementalHistoryIndexManual', '[Manual Index] Failed to index item', { url: item.url, error: error.message });
            }
        }

        // Small delay between batches to prevent blocking
        if (i + batchSize < newHistoryItems.length) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }

    const totalDuration = Date.now() - startTime;
    const total = added + updated;

    logger.info('performIncrementalHistoryIndexManual', '[Manual Index] Completed', {
        added,
        updated,
        total,
        durationMs: totalDuration
    });

    return { added, updated, total, duration: totalDuration };
}


/**
 * Get full history by querying comprehensively to access all available items
 */
async function getFullHistory(): Promise<any[]> {
    const allItems: any[] = [];
    const now = Date.now();
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const twoYearsAgo = now - (2 * 365 * 24 * 60 * 60 * 1000); // Go back 2 years
    const startTime = Date.now();

    logger.info('getFullHistory', '[Indexing] Starting comprehensive history retrieval', {
        timeRange: `${new Date(twoYearsAgo).toISOString()} to ${new Date(now).toISOString()}`,
        coverage: `${Math.round((now - twoYearsAgo) / (1000 * 60 * 60 * 24))} days`,
        estimatedChunks: Math.ceil((now - twoYearsAgo) / oneMonthMs)
    });

    // Query history in monthly chunks going backwards to get maximum coverage
    let chunkCount = 0;
    for (let startTimeQuery = now; startTimeQuery > twoYearsAgo; startTimeQuery -= oneMonthMs) {
        const endTime = startTimeQuery;
        const chunkStartTime = Math.max(startTimeQuery - oneMonthMs, twoYearsAgo);
        chunkCount++;

        logger.debug('getFullHistory', '[Indexing] Querying history chunk', {
            chunk: chunkCount,
            from: new Date(chunkStartTime).toISOString(),
            to: new Date(endTime).toISOString(),
            monthsBack: Math.round((now - chunkStartTime) / (1000 * 60 * 60 * 24 * 30))
        });

        const chunk = await new Promise<any[]>((resolve) => {
            browserAPI.history.search({
                text: '',
                startTime: chunkStartTime,
                endTime: endTime,
                maxResults: 10000 // Maximum allowed by Chrome per query
            }, resolve);
        });

        allItems.push(...chunk);
        logger.trace('getFullHistory', '[Indexing] Chunk retrieved', {
            chunk: chunkCount,
            itemsInChunk: chunk.length,
            totalSoFar: allItems.length
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        // If we got fewer than 10000 results, we've likely reached the end of available history
        if (chunk.length < 10000) {
            logger.info('getFullHistory', '[Indexing] Reached end of available history', {
                atDate: new Date(chunkStartTime).toISOString(),
                totalChunks: chunkCount,
                totalItems: allItems.length,
                monthsBack: Math.round((now - chunkStartTime) / (1000 * 60 * 60 * 24 * 30))
            });
            break;
        }
    }

    // Remove duplicates based on URL (keep the most recent visit)
    const uniqueItems = allItems.reduce((acc, item) => {
        const existing = acc.find(i => i.url === item.url);
        if (!existing || item.lastVisitTime > existing.lastVisitTime) {
            if (existing) {
                // Replace with more recent visit
                const index = acc.indexOf(existing);
                acc[index] = item;
            } else {
                acc.push(item);
            }
        }
        return acc;
    }, []);

    const retrievalDuration = Date.now() - startTime;
    logger.info('getFullHistory', '[Indexing] History retrieval completed', {
        totalRawItems: allItems.length,
        uniqueItems: uniqueItems.length,
        duplicatesRemoved: allItems.length - uniqueItems.length,
        retrievalTimeMs: retrievalDuration,
        itemsPerSecond: Math.round((allItems.length / retrievalDuration) * 1000),
        timeRangeCovered: `${Math.round((now - twoYearsAgo) / (1000 * 60 * 60 * 24))} days`,
        chunksProcessed: chunkCount
    });

    return uniqueItems;
}

/**
 * Get history items since a specific timestamp
 */
async function getHistorySince(sinceTimestamp: number): Promise<any[]> {
    return new Promise<any[]>((resolve) => {
        browserAPI.history.search({
            text: '',
            startTime: sinceTimestamp,
            maxResults: 10000
        }, resolve);
    });
}

/**
 * Clear all indexed data (for full re-indexing)
 */
async function clearIndexedData(): Promise<void> {
    logger.info('clearIndexedData', '[Indexing] Clearing existing indexed data');
    // Note: In a real implementation, you'd need to clear the IndexedDB store
    // For now, we'll rely on the put operation to overwrite existing data
    logger.debug('clearIndexedData', '[Indexing] Indexed data clearing completed (using overwrite strategy)');
}

/**
 * Compare version strings (semantic versioning)
 */
function compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;

        if (v1Part > v2Part) {return 1;}
        if (v1Part < v2Part) {return -1;}
    }

    return 0;
}

// Called by content script metadata updates
// indexing.ts — URL ingestion, merging, enrichment, and storage

/**
 * Get bookmark folder path as an array of folder names
 */
function getBookmarkFolderPath(node: chrome.bookmarks.BookmarkTreeNode, path: string[] = []): string[] {
    return path;
}

/**
 * Recursively collect all bookmarks from a bookmark tree
 */
function collectBookmarks(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    folderPath: string[] = []
): { url: string; title: string; folders: string[] }[] {
    const bookmarks: { url: string; title: string; folders: string[] }[] = [];
    
    for (const node of nodes) {
        if (node.url) {
            // It's a bookmark
            bookmarks.push({
                url: node.url,
                title: node.title || '',
                folders: folderPath,
            });
        } else if (node.children) {
            // It's a folder - recurse
            const newPath = node.title ? [...folderPath, node.title] : folderPath;
            bookmarks.push(...collectBookmarks(node.children, newPath));
        }
    }
    
    return bookmarks;
}

/**
 * Index all bookmarks - marks existing items as bookmarks or creates new items
 * @param indexBookmarks - whether to index bookmarks (from settings)
 */
export async function performBookmarksIndex(indexBookmarks: boolean = true): Promise<{ indexed: number; updated: number }> {
    if (!indexBookmarks) {
        logger.info('performBookmarksIndex', '📚 Bookmarks indexing disabled, skipping');
        return { indexed: 0, updated: 0 };
    }

    const startTime = Date.now();
    logger.info('performBookmarksIndex', '📚 Starting bookmarks indexing...');

    let indexed = 0;
    let updated = 0;

    try {
        // Get all bookmarks
        const tree = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
            browserAPI.bookmarks.getTree((nodes: chrome.bookmarks.BookmarkTreeNode[]) => resolve(nodes));
        });

        // Collect all bookmarks with their folder paths
        const allBookmarks = collectBookmarks(tree);
        logger.info('performBookmarksIndex', `📚 Found ${allBookmarks.length} bookmarks`);

        // Process bookmarks
        for (const bookmark of allBookmarks) {
            try {
                // Skip invalid URLs
                if (!bookmark.url || !bookmark.url.startsWith('http')) {
                    continue;
                }

                // Check if we already have this URL indexed
                const existing = await getIndexedItem(bookmark.url);

                if (existing) {
                    // Update existing item to mark as bookmark
                    existing.isBookmark = true;
                    existing.bookmarkFolders = bookmark.folders;
                    // Store bookmark title separately if it's different from page title
                    if (bookmark.title && bookmark.title.trim() && bookmark.title !== existing.title) {
                        existing.bookmarkTitle = bookmark.title;
                    }
                    // Update tokens to include bookmark title (if available), page title, folders, and URL
                    const searchTitle = existing.bookmarkTitle || existing.title;
                    existing.tokens = tokenize(
                        searchTitle + ' ' + 
                        (existing.metaDescription || '') + ' ' + 
                        bookmark.folders.join(' ') + ' ' + 
                        existing.url
                    );
                    await saveIndexedItem(existing);
                    updated++;
                } else {
                    // Create new indexed item for bookmark
                    const newItem: IndexedItem = {
                        url: bookmark.url,
                        title: bookmark.title,
                        hostname: new URL(bookmark.url).hostname,
                        metaDescription: '',
                        metaKeywords: [],
                        visitCount: 1, // Bookmarks get base visit count
                        lastVisit: Date.now(),
                        tokens: tokenize(bookmark.title + ' ' + bookmark.folders.join(' ') + ' ' + bookmark.url),
                        isBookmark: true,
                        bookmarkFolders: bookmark.folders,
                        bookmarkTitle: bookmark.title, // Store bookmark title
                    };
                    await saveIndexedItem(newItem);
                    indexed++;
                }
            } catch (error) {
                logger.warn('performBookmarksIndex', 'Failed to index bookmark', { 
                    url: bookmark.url, 
                    error: (error as Error).message 
                });
            }
        }

        const duration = Date.now() - startTime;
        logger.info('performBookmarksIndex', `📚 Bookmarks indexing completed in ${duration}ms`, {
            indexed,
            updated,
            total: allBookmarks.length
        });

    } catch (error) {
        logger.error('performBookmarksIndex', '❌ Bookmarks indexing failed:', error);
    }

    return { indexed, updated };
}

/**
 * Remove bookmark flags from all items (when bookmarks indexing is disabled)
 */
export async function clearBookmarkFlags(): Promise<void> {
    logger.info('clearBookmarkFlags', '📚 Clearing bookmark flags from all items...');
    
    try {
        const { getAllIndexedItems } = await import('./database');
        const allItems = await getAllIndexedItems();
        
        let cleared = 0;
        for (const item of allItems) {
            if (item.isBookmark) {
                item.isBookmark = false;
                item.bookmarkFolders = undefined;
                await saveIndexedItem(item);
                cleared++;
            }
        }
        
        logger.info('clearBookmarkFlags', `📚 Cleared bookmark flags from ${cleared} items`);
    } catch (error) {
        logger.error('clearBookmarkFlags', '❌ Failed to clear bookmark flags:', error);
    }
}

/**
 * mergeMetadata: update existing item with metadata captured by content script.
 */
export async function mergeMetadata(
    url: string,
    meta: { description?: string; keywords?: string[]; title?: string }
): Promise<void> {
    try {
        logger.debug('mergeMetadata', 'Merging metadata for URL:', url);
        // Try canonical normalization (if needed)
        const normalizedUrl = url;

        // Fetch existing item
        let item = await getIndexedItem(normalizedUrl);

        if (!item) {
            logger.debug('mergeMetadata', 'No existing item found, creating new item with metadata');
            // If no existing item, create a minimal item so metadata isn't lost
            item = {
                url: normalizedUrl,
                title: meta.title || '',
                hostname: (new URL(normalizedUrl)).hostname,
                metaDescription: meta.description || '',
                metaKeywords: meta.keywords || [],
                visitCount: 1,
                lastVisit: Date.now(),
                tokens: tokenize((meta.title || '') + ' ' + (meta.description || '') + ' ' + normalizedUrl),
            };
        } else {
            logger.trace('mergeMetadata', 'Updating existing item with new metadata');
            // merge fields (prefer existing title unless meta.title is present)
            item.title = meta.title && meta.title.length ? meta.title : item.title;
            item.metaDescription = meta.description && meta.description.length ? meta.description : item.metaDescription;
            item.metaKeywords = (meta.keywords && meta.keywords.length) ? meta.keywords : item.metaKeywords;
            // update tokens to include new metadata text
            item.tokens = tokenize(item.title + ' ' + (item.metaDescription || '') + ' ' + (item.metaKeywords || []).join(' ') + ' ' + item.url);
            // do not change visitCount/lastVisit here
        }

        // Save updated item
        logger.trace('mergeMetadata', 'Saving updated item to database');
        await saveIndexedItem(item);
        logger.debug('mergeMetadata', 'Metadata merge completed for:', url);
    } catch (err) {
        logger.error('mergeMetadata', `[${BRAND_NAME}] mergeMetadata error:`, err);
    }
}