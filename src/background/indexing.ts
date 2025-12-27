// indexing.ts — URL ingestion, merging, enrichment, and storage

import { browserAPI } from '../core/helpers';
import { saveIndexedItem, getIndexedItem, getSetting, setSetting } from './database';
import { tokenize } from './search/tokenizer';
import { IndexedItem } from './schema';
import { BRAND_NAME } from '../core/constants';
import { Logger } from '../core/logger';

const logger = Logger.forComponent('Indexing');

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