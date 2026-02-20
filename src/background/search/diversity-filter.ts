// diversity-filter.ts — Removes duplicate URLs from search results for better variety
// SmrutiCortex v4.0 - UX Enhancement

import { IndexedItem } from '../schema';
import { Logger } from '../../core/logger';

const logger = Logger.forComponent('DiversityFilter');

/**
 * Normalizes a URL by removing query parameters, fragments, and trailing slashes.
 * This allows us to detect duplicate pages that differ only in tracking params.
 * 
 * Examples:
 * - "https://notion.so/page?pvs=12" → "https://notion.so/page"
 * - "https://example.com/path/?utm_source=x#section" → "https://example.com/path"
 * - "https://site.com/page/" → "https://site.com/page"
 * 
 * @param url The URL to normalize
 * @returns Normalized URL string (lowercase, no params/fragments/trailing slash)
 */
export function normalizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        
        // Build normalized URL: protocol + host + pathname (no query, no hash)
        let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        
        // Remove trailing slash (except for root path)
        if (normalized.endsWith('/') && normalized.length > parsed.protocol.length + 2 + parsed.host.length + 1) {
            normalized = normalized.slice(0, -1);
        }
        
        return normalized.toLowerCase();
    } catch (e) {
        // If URL parsing fails, fall back to simple normalization
        logger.trace('normalizeUrl', `URL parse failed, using fallback: ${url}`);
        return url.toLowerCase().split('?')[0].split('#')[0].replace(/\/$/, '');
    }
}

/**
 * Result item with score for diversity filtering
 */
export interface ScoredItem {
    item: IndexedItem;
    finalScore: number;
    keywordMatch?: boolean;
    aiMatch?: boolean;
    intentPriority?: number;
    titleUrlCoverage?: number;
    titleUrlQuality?: number;
    splitFieldCoverage?: number;
}

/**
 * Filters duplicate URLs from search results, keeping only the highest-scoring
 * result for each unique normalized URL.
 * 
 * Algorithm:
 * 1. Group results by normalized URL
 * 2. For each group, keep the item with highest score
 * 3. Return filtered results maintaining original sort order
 * 
 * @param results Array of scored items (must be sorted by score descending)
 * @param enableDiversity If true, filter duplicates. If false, return as-is.
 * @returns Filtered array with unique URLs (or original if diversity disabled)
 */
export function applyDiversityFilter<T extends ScoredItem>(
    results: T[],
    enableDiversity: boolean
): T[] {
    if (!enableDiversity) {
        logger.trace('applyDiversityFilter', 'Diversity filter disabled, returning all results');
        return results;
    }

    const seenUrls = new Map<string, T>();
    const duplicatesRemoved: string[] = [];

    for (const result of results) {
        const normalizedUrl = normalizeUrl(result.item.url);
        
        if (!seenUrls.has(normalizedUrl)) {
            // First occurrence - keep it
            seenUrls.set(normalizedUrl, result);
        } else {
            // Duplicate found - log it for debugging
            duplicatesRemoved.push(result.item.url);
            logger.trace('applyDiversityFilter', `Filtered duplicate: ${result.item.url}`, {
                normalizedUrl,
                originalScore: seenUrls.get(normalizedUrl)?.finalScore,
                duplicateScore: result.finalScore
            });
        }
    }

    const filtered = Array.from(seenUrls.values());
    
    if (duplicatesRemoved.length > 0) {
        logger.debug('applyDiversityFilter', `Diversity filter removed ${duplicatesRemoved.length} duplicates`, {
            originalCount: results.length,
            filteredCount: filtered.length,
            duplicatesRemoved: duplicatesRemoved.slice(0, 5) // Log first 5 for debugging
        });
    } else {
        logger.trace('applyDiversityFilter', 'No duplicates found', {
            resultCount: results.length
        });
    }

    return filtered;
}
