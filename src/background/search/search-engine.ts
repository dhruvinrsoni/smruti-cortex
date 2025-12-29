// search-engine.ts — SmrutiCortex Search Brain

import { getAllIndexedItems } from '../database';
import { getAllScorers } from './scorer-manager';
import { IndexedItem } from '../schema';
import { tokenize } from './tokenizer';
import { browserAPI } from '../../core/helpers';
import { Logger } from '../../core/logger';
import { SettingsManager } from '../../core/settings';
import { ScorerContext } from '../../core/scorer-types';
import { getOllamaService } from '../ollama-service';
import { generateItemEmbedding } from './scorers/embedding-scorer';

export async function runSearch(query: string): Promise<IndexedItem[]> {
    const logger = Logger.forComponent('SearchEngine');
    logger.trace('runSearch', 'Search called with query:', query);

    const q = query.trim().toLowerCase();
    if (!q) {
        logger.trace('runSearch', 'Query is empty, returning empty array');
        return [];
    }

    const tokens = tokenize(q);
    logger.trace('runSearch', 'Query tokens:', tokens);

    // Ensure SettingsManager is initialized before reading settings
    await SettingsManager.init();
    
    // Check if AI embeddings are enabled
    const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') || false;
    const ollamaEndpoint = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
    const ollamaModel = SettingsManager.getSetting('ollamaModel') || 'embeddinggemma:300m';
    
    if (ollamaEnabled) {
        // AI search is now ACTIVE
        logger.info('runSearch', `🤖 AI search ACTIVE: model=${ollamaModel} | endpoint=${ollamaEndpoint}`);
    } else {
        logger.info('runSearch', `🔍 Keyword search (AI disabled in settings, embedding scorer weight=0)`);
    }

    const scorers = getAllScorers();
    logger.trace('runSearch', 'Loaded scorers:', scorers.length);

    // Generate query embedding if AI is enabled
    const context: ScorerContext = {};
    if (ollamaEnabled) {
        try {
            logger.info('runSearch', '🤖 Generating query embedding...');
            const ollamaService = getOllamaService({
                endpoint: ollamaEndpoint,
                model: ollamaModel,
                timeout: SettingsManager.getSetting('ollamaTimeout') || 2000
            });
            const result = await ollamaService.generateEmbedding(q);
            
            if (result.success && result.embedding.length > 0) {
                context.queryEmbedding = result.embedding;
                logger.info('runSearch', `✅ Query embedding ready (${result.duration}ms, ${result.embedding.length} dimensions)`);
            } else {
                logger.warn('runSearch', `⚠️ Query embedding failed: ${result.error || 'unknown error'} - using keyword search only`);
            }
        } catch (error) {
            logger.error('runSearch', '❌ Query embedding error:', error);
        }
    }

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
    const results: Array<{ item: IndexedItem; finalScore: number; keywordMatch: boolean; aiMatch: boolean }> = [];

    // Generate embeddings for items that don't have them (if AI enabled and query embedding available)
    const shouldGenerateItemEmbeddings = ollamaEnabled && context.queryEmbedding && context.queryEmbedding.length > 0;
    if (shouldGenerateItemEmbeddings) {
        logger.info('runSearch', '🤖 Generating embeddings for items without them...');
        const embeddingPromises: Promise<void>[] = [];
        let generatedCount = 0;
        
        for (const item of items) {
            if (!item.embedding || item.embedding.length === 0) {
                embeddingPromises.push(
                    generateItemEmbedding(item).then(embedding => {
                        if (embedding.length > 0) {
                            item.embedding = embedding;
                            generatedCount++;
                        }
                    })
                );
                
                // Batch generation to avoid overwhelming Ollama
                if (embeddingPromises.length >= 10) {
                    await Promise.all(embeddingPromises);
                    embeddingPromises.length = 0;
                    logger.trace('runSearch', `Generated ${generatedCount} item embeddings so far...`);
                }
            }
        }
        
        // Wait for remaining embeddings
        if (embeddingPromises.length > 0) {
            await Promise.all(embeddingPromises);
        }
        
        if (generatedCount > 0) {
            logger.info('runSearch', `✅ Generated ${generatedCount} item embeddings`);
        }
    }

    for (const item of items) {
        // More flexible matching: ANY token match (not ALL tokens required)
        const haystack = (item.title + ' ' + item.url + ' ' + item.hostname).toLowerCase();
        const hasAnyMatch = tokens.some(token => haystack.includes(token));

        // Calculate score using all scorers
        let score = 0;
        let aiScore = 0;
        let keywordScore = 0;
        const scorerDetails: Array<{ name: string; score: number; weight: number }> = [];
        
        for (const scorer of scorers) {
            const scorerScore = scorer.weight * scorer.score(item, q, items, context);
            score += scorerScore;
            scorerDetails.push({ name: scorer.name, score: scorerScore, weight: scorer.weight });
            
            // Track AI vs keyword contributions
            if (scorer.name === 'embedding' && scorerScore > 0) {
                aiScore += scorerScore;
            } else if (scorerScore > 0) {
                keywordScore += scorerScore;
            }
        }

        logger.trace('runSearch', `Item scored: ${item.title.substring(0, 50)}...`, {
            url: item.url,
            totalScore: score,
            scorerBreakdown: scorerDetails
        });

        // Include items with meaningful scores OR AI matches (even without keyword match)
        if (score > 0.01) {
            results.push({ 
                item, 
                finalScore: score,
                keywordMatch: hasAnyMatch,
                aiMatch: aiScore > 0
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

    logger.trace('runSearch', 'Diversification completed', {
        originalResults: results.length,
        diversifiedResults: diversified.length,
        domainDistribution: Object.fromEntries(domainCount.entries())
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