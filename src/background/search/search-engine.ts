// search-engine.ts — SmrutiCortex Search Brain

import { getAllIndexedItems } from '../database';
import { getAllScorers } from './scorer-manager';
import { IndexedItem } from '../schema';
import { tokenize } from './tokenizer';
import { browserAPI } from '../../core/helpers';
import { Logger } from '../../core/logger';
import { SettingsManager } from '../../core/settings';

export async function runSearch(query: string): Promise<IndexedItem[]> {
    const logger = Logger.forComponent('SearchEngine');
    logger.debug('runSearch', 'Search called with query:', query);

    const q = query.trim().toLowerCase();
    if (!q) {
        logger.trace('runSearch', 'Query is empty, returning empty array');
        return [];
    }

    const tokens = tokenize(q);
    logger.debug('runSearch', 'Query tokens:', tokens);

    // Ensure SettingsManager is initialized before reading settings
    await SettingsManager.init();
    
    // Check if AI embeddings are enabled
    const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') || false;
    const ollamaEndpoint = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
    const ollamaModel = SettingsManager.getSetting('ollamaModel') || 'embeddinggemma:300m';
    
    if (ollamaEnabled) {
        // HONEST LOGGING: AI is configured but NOT implemented yet
        logger.info('runSearch', `⚙️ AI configured (NOT ACTIVE): model=${ollamaModel} | endpoint=${ollamaEndpoint}`);
        logger.info('runSearch', `⚠️ Embedding scorer weight=0.4 (dynamic) but returns 0 until implemented`);
    } else {
        logger.info('runSearch', `🔍 Keyword search (AI disabled in settings, embedding scorer weight=0)`);
    }

    const scorers = getAllScorers();
    logger.trace('runSearch', 'Loaded scorers:', scorers.length);

    // Get all indexed items
    const items = await getAllIndexedItems();

    if (items.length === 0) {
        logger.warn('runSearch', `🔍 "${q}" - No index available, using browser history`);
        // Fallback to browser history search with higher limit
        const historyItems = await new Promise<any[]>((resolve) => {
            browserAPI.history.search({
                text: q,
                maxResults: 200, // Increased from 50
                startTime: 0 // Search all history
            }, resolve);
        });
        logger.info('runSearch', `📚 History fallback: ${historyItems.length} results for "${q}"`);

        // Convert to IndexedItem format
        const fallbackItems: IndexedItem[] = historyItems.map(item => ({
            url: item.url,
            title: item.title || '',
            hostname: (() => { try { return new URL(item.url).hostname; } catch { return ''; } })(),
            metaDescription: '',
            metaKeywords: [],
            visitCount: item.visitCount || 1,
            lastVisit: item.lastVisitTime || Date.now(),
            tokens: tokenize((item.title || '') + ' ' + item.url)
        }));
        return fallbackItems;
    }

    logger.debug('runSearch', 'Processing items for scoring');
    const results: Array<{ item: IndexedItem; finalScore: number }> = [];

    for (const item of items) {
        // More flexible matching: ANY token match (not ALL tokens required)
        const haystack = (item.title + ' ' + item.url + ' ' + item.hostname).toLowerCase();
        const hasAnyMatch = tokens.some(token => haystack.includes(token));

        if (!hasAnyMatch) {
            continue; // Skip items that don't match any token
        }

        // Calculate score using all scorers
        let score = 0;
        const scorerDetails: Array<{ name: string; score: number; weight: number }> = [];
        for (const scorer of scorers) {
            const scorerScore = scorer.weight * scorer.score(item, q, items);
            score += scorerScore;
            scorerDetails.push({ name: scorer.name, score: scorerScore, weight: scorer.weight });
        }

        logger.debug('runSearch', `Item scored: ${item.title.substring(0, 50)}...`, {
            url: item.url,
            totalScore: score,
            scorerBreakdown: scorerDetails
        });

        // Only include items with meaningful scores
        if (score > 0.01) { // Very low threshold to include more results
            results.push({ item, finalScore: score });
        }
    }

    logger.debug('runSearch', `Found ${results.length} matching items before sorting`);

    // Sort by score (highest first)
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Less restrictive diversification for power users - allow more results per domain
    const diversified: Array<{ item: IndexedItem; finalScore: number }> = [];
    const domainCount = new Map<string, number>();
    const maxPerDomain = 10; // Increased from 3 to 10 for power users

    for (const res of results) {
        const domain = res.item.hostname || 'unknown';
        const count = domainCount.get(domain) || 0;
        if (count < maxPerDomain) {
            diversified.push(res);
            domainCount.set(domain, count + 1);
        }
    }

    logger.debug('runSearch', 'Diversification completed', {
        originalResults: results.length,
        diversifiedResults: diversified.length,
        domainDistribution: Object.fromEntries(domainCount.entries())
    });

    const finalResults = diversified.slice(0, 100).map(r => r.item); // Return top 100 instead of 50
    logger.info('runSearch', `🔍 "${q}" → ${finalResults.length} results (${results.length} matches, ${items.length} indexed)`);

    return finalResults;
}