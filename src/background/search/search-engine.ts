// search-engine.ts — SmrutiCortex Search Brain

import { getAllIndexedItems } from '../database';
import { getAllScorers } from './scorer-manager';
import { IndexedItem } from '../schema';
import { tokenize } from './tokenizer';
import { browserAPI } from '../../core/helpers';
import { Logger } from '../../core/logger';
import { SettingsManager } from '../../core/settings';
import { ScorerContext } from '../../core/scorer-types';
import { expandQueryKeywords } from '../ai-keyword-expander';
import { applyDiversityFilter, ScoredItem } from './diversity-filter';

export async function runSearch(query: string): Promise<IndexedItem[]> {
    const logger = Logger.forComponent('SearchEngine');
    logger.trace('runSearch', 'Search called with query:', query);

    const q = query.trim().toLowerCase();
    if (!q) {
        logger.trace('runSearch', 'Query is empty, returning empty array');
        return [];
    }

    // Original tokens from query
    const originalTokens = tokenize(q);
    logger.trace('runSearch', 'Original query tokens:', originalTokens);

    // Ensure SettingsManager is initialized before reading settings
    await SettingsManager.init();
    
    // Check if AI keyword expansion is enabled
    const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') || false;
    
    // AI-expanded tokens (includes synonyms, related terms)
    // This is ONE LLM call, not 600+ embeddings!
    let searchTokens: string[] = originalTokens;
    let aiExpanded = false;
    
    if (ollamaEnabled) {
        logger.info('runSearch', `🤖 AI keyword expansion ACTIVE`);
        try {
            const expandedTokens = await expandQueryKeywords(q);
            if (expandedTokens.length > originalTokens.length) {
                searchTokens = expandedTokens;
                aiExpanded = true;
                logger.info('runSearch', `✅ Expanded "${q}" → ${searchTokens.length} keywords`, {
                    original: originalTokens,
                    expanded: searchTokens.filter(t => !originalTokens.includes(t))
                });
            }
        } catch (error) {
            logger.warn('runSearch', `⚠️ Keyword expansion failed, using original query`, { error });
        }
    } else {
        logger.info('runSearch', `🔍 Keyword search (AI disabled)`);
    }

    const scorers = getAllScorers();
    logger.trace('runSearch', 'Loaded scorers:', scorers.length);

    // Context for scorers - pass expanded tokens
    const context: ScorerContext = {
        expandedTokens: searchTokens,
        aiExpanded: aiExpanded
    };

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

    logger.trace('runSearch', 'Processing items for scoring');
    const results: ScoredItem[] = [];

    // Check if strict matching is enabled (default: true = only show matching results)
    const showNonMatchingResults = SettingsManager.getSetting('showNonMatchingResults') || false;

    // NO MORE 600+ EMBEDDINGS! Use keyword matching with expanded tokens instead
    for (const item of items) {
        // Match against expanded tokens (includes AI-generated synonyms)
        const haystack = (item.title + ' ' + item.url + ' ' + item.hostname + ' ' + (item.metaDescription || '')).toLowerCase();
        const matchedTokens = searchTokens.filter(token => haystack.includes(token));
        const hasTokenMatch = matchedTokens.length > 0;
        
        // Also check for literal substring match (the raw query in the content)
        const hasLiteralMatch = haystack.includes(q);
        
        // Combined match: either token match or literal substring match
        const hasAnyMatch = hasTokenMatch || hasLiteralMatch;
        
        // Track if match came from AI-expanded keywords
        const aiOnlyTokens = searchTokens.filter(t => !originalTokens.includes(t));
        const hasAiMatch = aiExpanded && aiOnlyTokens.some(t => haystack.includes(t));

        // Calculate score using all scorers
        let score = 0;
        const scorerDetails: Array<{ name: string; score: number; weight: number }> = [];
        
        for (const scorer of scorers) {
            const scorerScore = scorer.weight * scorer.score(item, q, items, context);
            score += scorerScore;
            scorerDetails.push({ name: scorer.name, score: scorerScore, weight: scorer.weight });
        }

        // Boost score for literal substring matches (exact query found)
        if (hasLiteralMatch && score > 0) {
            score *= 1.5; // 50% boost for exact literal matches
        }

        // Boost score for AI-expanded keyword matches
        if (hasAiMatch && score > 0) {
            score *= 1.2; // 20% boost for AI-discovered matches
        }

        logger.trace('runSearch', `Item scored: ${item.title.substring(0, 50)}...`, {
            url: item.url,
            totalScore: score,
            matchedTokens,
            hasLiteralMatch,
            aiMatch: hasAiMatch,
            scorerBreakdown: scorerDetails
        });

        // Include items based on matching criteria
        // Default: only include items that actually match the query
        // If showNonMatchingResults is enabled, include all items with score > 0.01
        const meetsScoreThreshold = score > 0.01;
        const shouldInclude = showNonMatchingResults 
            ? meetsScoreThreshold 
            : (meetsScoreThreshold && hasAnyMatch);

        if (shouldInclude) {
            results.push({ 
                item, 
                finalScore: score,
                keywordMatch: hasAnyMatch,
                aiMatch: hasAiMatch
            });
        }
    }

    // Count keyword vs AI matches
    const keywordMatches = results.filter(r => r.keywordMatch).length;
    const aiOnlyMatches = results.filter(r => r.aiMatch && !r.keywordMatch).length;
    const hybridMatches = results.filter(r => r.aiMatch && r.keywordMatch).length;

    logger.debug('runSearch', `Match summary: ${results.length} items passed threshold`, {
        keywordOnly: keywordMatches - hybridMatches,
        aiOnly: aiOnlyMatches,
        hybrid: hybridMatches,
        total: results.length
    });

    // Sort by score (highest first)
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Apply diversity filter to remove duplicate URLs (same page, different query params)
    const showDuplicateUrls = SettingsManager.getSetting('showDuplicateUrls') || false;
    const enableDiversity = !showDuplicateUrls; // Diversity ON = filter duplicates
    const diverseResults = applyDiversityFilter(results, enableDiversity);

    // Less restrictive domain diversification for power users - allow more results per domain
    const diversified: ScoredItem[] = [];
    const domainCount = new Map<string, number>();
    const maxPerDomain = 10; // Allow up to 10 results per domain

    for (const res of diverseResults) {
        const domain = res.item.hostname || 'unknown';
        const count = domainCount.get(domain) || 0;
        if (count < maxPerDomain) {
            diversified.push(res);
            domainCount.set(domain, count + 1);
        }
    }

    logger.trace('runSearch', 'Diversification completed', {
        originalResults: results.length,
        afterUrlDiversity: diverseResults.length,
        afterDomainLimit: diversified.length,
        domainDistribution: Object.fromEntries(domainCount.entries()),
        diversityEnabled: enableDiversity
    });

    const finalResults = diversified.slice(0, 100).map(r => r.item); // Return top 100 instead of 50
    
    // Enhanced logging with AI breakdown
    if (aiOnlyMatches > 0 || hybridMatches > 0) {
        logger.info('runSearch', 
            `🔍 "${q}" → ${finalResults.length} results ` +
            `(${keywordMatches - hybridMatches} keyword + ${aiOnlyMatches} AI-only + ${hybridMatches} hybrid | ${items.length} indexed)`
        );
    } else {
        logger.info('runSearch', `🔍 "${q}" → ${finalResults.length} results (${results.length} matches, ${items.length} indexed)`);
    }

    return finalResults;
}