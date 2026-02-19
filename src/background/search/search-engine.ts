// search-engine.ts — SmrutiCortex Search Brain

import { getAllIndexedItems } from '../database';
import { getAllScorers } from './scorer-manager';
import { IndexedItem } from '../schema';
import { tokenize, countExactKeywordMatches } from './tokenizer';
import { browserAPI } from '../../core/helpers';
import { Logger } from '../../core/logger';
import { SettingsManager } from '../../core/settings';
import { ScorerContext } from '../../core/scorer-types';
import { expandQueryKeywords } from '../ai-keyword-expander';
import { applyDiversityFilter, ScoredItem } from './diversity-filter';
import { performanceTracker } from '../performance-monitor';
import { getExpandedTerms } from './query-expansion';
import { recordSearchDebug } from '../diagnostics';
import { getSearchCache } from './search-cache';

export async function runSearch(query: string): Promise<IndexedItem[]> {
    const searchStartTime = performance.now();
    const logger = Logger.forComponent('SearchEngine');
    logger.trace('runSearch', 'Search called with query:', query);

    const q = query.trim().toLowerCase();
    if (!q) {
        logger.trace('runSearch', 'Query is empty, returning empty array');
        return [];
    }

    // Check cache first for instant results
    const searchCache = getSearchCache();
    const cachedResults = searchCache.get(q);
    if (cachedResults) {
        const cacheTime = performance.now() - searchStartTime;
        logger.info('runSearch', `⚡ Cache hit! Returning ${cachedResults.length} results in ${cacheTime.toFixed(2)}ms`);
        return cachedResults;
    }

    // Original tokens from query
    const originalTokens = tokenize(q);
    logger.trace('runSearch', 'Original query tokens:', originalTokens);

    // Apply local synonym expansion (fast, no AI)
    const synonymExpandedTokens = getExpandedTerms(q);
    if (synonymExpandedTokens.length > originalTokens.length) {
        logger.debug('runSearch', `📚 Synonym expansion: ${originalTokens.join(', ')} → ${synonymExpandedTokens.join(', ')}`);
    }

    // Ensure SettingsManager is initialized before reading settings
    await SettingsManager.init();
    
    // Check if AI keyword expansion is enabled
    const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') || false;
    
    // AI-expanded tokens (includes synonyms, related terms)
    // This is ONE LLM call, not 600+ embeddings!
    let searchTokens: string[] = synonymExpandedTokens; // Start with synonym-expanded tokens
    let aiExpanded = false;
    
    if (ollamaEnabled) {
        logger.info('runSearch', '🤖 AI keyword expansion ACTIVE');
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
            logger.warn('runSearch', '⚠️ Keyword expansion failed, using original query', { error });
        }
    } else {
        logger.info('runSearch', '🔍 Keyword search (AI disabled)');
    }

    const scorers = getAllScorers();
    logger.trace('runSearch', 'Loaded scorers:', scorers.length);

    // Check if semantic search is enabled
    const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') || false;
    let queryEmbedding: number[] | undefined;

    // Generate query embedding for semantic search if enabled
    if (embeddingsEnabled) {
        logger.info('runSearch', '🧠 Semantic search ACTIVE - generating query embedding');
        try {
            const ollamaService = await import('../ollama-service');
            const embeddingResult = await ollamaService.getOllamaService().generateEmbedding(q);
            if (embeddingResult.success && embeddingResult.embedding.length > 0) {
                queryEmbedding = embeddingResult.embedding;
                logger.info('runSearch', `✅ Query embedding generated (${queryEmbedding.length} dimensions)`);
            } else {
                logger.warn('runSearch', '⚠️ Query embedding generation failed');
            }
        } catch (error) {
            logger.warn('runSearch', '⚠️ Semantic search failed, falling back to keyword search', { error });
        }
    }

    // Context for scorers - pass expanded tokens and query embedding
    const context: ScorerContext = {
        expandedTokens: searchTokens,
        aiExpanded: aiExpanded,
        queryEmbedding: queryEmbedding
    };

    // Get all indexed items
    const items = await getAllIndexedItems();

    if (items.length === 0) {
        logger.warn('runSearch', `🔍 "${q}" - No index available, using browser history`);
        // Fallback to browser history search with higher limit
        const historyItems = await new Promise<chrome.history.HistoryItem[]>((resolve) => {
            browserAPI.history.search({
                text: q,
                maxResults: 200, // Increased from 50
                startTime: 0 // Search all history
            }, resolve as unknown as (results: chrome.history.HistoryItem[]) => void);
        });
        logger.info('runSearch', `📚 History fallback: ${historyItems.length} results for "${q}"`);

        // Convert to IndexedItem format
        const fallbackItems: IndexedItem[] = historyItems.map(h => ({
            url: h.url,
            title: h.title || '',
            hostname: (() => { try { return new URL(h.url).hostname; } catch { return ''; } })(),
            metaDescription: '',
            metaKeywords: [],
            visitCount: h.visitCount || 1,
            lastVisit: ((h as unknown) as chrome.history.HistoryItem).lastVisitTime || Date.now(),
            tokens: tokenize((h.title || '') + ' ' + h.url)
        }));
        return fallbackItems;
    }

    logger.trace('runSearch', 'Processing items for scoring');
    const results: ScoredItem[] = [];

    // Check if strict matching is enabled (default: true = only show matching results)
    const showNonMatchingResults = SettingsManager.getSetting('showNonMatchingResults') || false;

    // Process items for scoring
    for (const item of items) {
        // On-demand embedding generation for semantic search
        if (embeddingsEnabled && !item.embedding) {
            try {
                const ollamaService = await import('../ollama-service');
                const text = `${item.title} ${item.metaDescription || ''} ${item.url}`.trim();
                const embeddingResult = await ollamaService.getOllamaService().generateEmbedding(text);
                if (embeddingResult.success && embeddingResult.embedding.length > 0) {
                    item.embedding = embeddingResult.embedding;
                    // Save back to DB for future searches
                    await import('../database').then(db => db.saveIndexedItem(item));
                }
            } catch (error) {
                // Ignore embedding errors - will use keyword matching
            }
        }

        // Match against expanded tokens (includes AI-generated synonyms)
        // Include bookmark folders in searchable content
        const bookmarkFolders = item.bookmarkFolders?.join(' ') || '';
        // Use bookmark title if available, otherwise use page title
        const searchTitle = item.bookmarkTitle || item.title;
        const haystack = (searchTitle + ' ' + item.url + ' ' + item.hostname + ' ' + (item.metaDescription || '') + ' ' + bookmarkFolders).toLowerCase();
        const matchedTokens = searchTokens.filter(token => haystack.includes(token));
        const hasTokenMatch = matchedTokens.length > 0;
        
        // Also check for literal substring match (the raw query in the content)
        const hasLiteralMatch = haystack.includes(q);
        
        // Combined match: either token match or literal substring match
        const hasAnyMatch = hasTokenMatch || hasLiteralMatch;
        
        // Track if match came from AI-expanded keywords
        const aiOnlyTokens = searchTokens.filter(t => !originalTokens.includes(t));
        const hasAiMatch = aiExpanded && aiOnlyTokens.some(t => haystack.includes(t));

        // BOOKMARK STRICT MATCHING: Only show bookmarks when there's a strong match
        // This prevents bookmark flooding when typing partial words like "github"
        const isBookmark = !!item.isBookmark;
        let bookmarkStrictMatch = true; // Default: non-bookmarks pass through
        
        if (isBookmark) {
            // For bookmarks, require at least one of:
            // 1. Full word match (word boundary) for original query terms
            // 2. Literal substring match for the full query (3+ chars)
            // 3. All original tokens must match (not just some)
            const allOriginalTokensMatch = originalTokens.every(token => haystack.includes(token));
            const hasWordBoundaryMatch = originalTokens.some(token => {
                // Check for word boundary match (token surrounded by non-alphanumeric or start/end)
                const wordBoundaryRegex = new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
                return wordBoundaryRegex.test(haystack);
            });
            const hasStrongLiteralMatch = q.length >= 3 && hasLiteralMatch;
            
            bookmarkStrictMatch = allOriginalTokensMatch || hasWordBoundaryMatch || hasStrongLiteralMatch;
        }

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

        // Boost score for all original tokens matching as exact keywords (word-boundary)
        // This is the strongest signal: every query word appears as a whole word
        // e.g., "rar my all" where each token is a distinct word in the title
        if (score > 0 && originalTokens.length > 0) {
            const titleText = ((item.bookmarkTitle || item.title) || '').toLowerCase();
            const titleExactMatches = countExactKeywordMatches(originalTokens, titleText);
            if (titleExactMatches === originalTokens.length) {
                // All query tokens are exact keyword matches in the title — strong boost
                score *= 1.4; // 40% boost for full exact-keyword title match
            } else if (titleExactMatches > 0) {
                // Partial exact keyword matches in title — moderate boost
                score *= 1.0 + (titleExactMatches / originalTokens.length) * 0.2;
            }
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
        // For bookmarks: apply stricter matching to prevent flooding
        const meetsScoreThreshold = score > 0.01;
        const shouldInclude = showNonMatchingResults 
            ? (meetsScoreThreshold && bookmarkStrictMatch)
            : (meetsScoreThreshold && hasAnyMatch && bookmarkStrictMatch);

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
    
    // Record search performance
    const searchDuration = performance.now() - searchStartTime;
    performanceTracker.recordSearch(searchDuration);
    
    // Record search debug (always - lightweight)
    recordSearchDebug(q, finalResults.length, searchDuration);
    
    // Enhanced logging with AI breakdown
    if (aiOnlyMatches > 0 || hybridMatches > 0) {
        logger.info('runSearch', 
            `🔍 "${q}" → ${finalResults.length} results ` +
            `(${keywordMatches - hybridMatches} keyword + ${aiOnlyMatches} AI-only + ${hybridMatches} hybrid | ${items.length} indexed)`
        );
    } else {
        logger.info('runSearch', `🔍 "${q}" → ${finalResults.length} results (${results.length} matches, ${items.length} indexed)`);
    }

    // Store results in cache for future queries
    searchCache.set(q, finalResults);

    return finalResults;
}