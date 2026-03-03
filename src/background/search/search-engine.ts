// search-engine.ts — SmrutiCortex Deep Search™ Engine

import { getAllIndexedItems } from '../database';
import { getAllScorers } from './scorer-manager';
import { IndexedItem } from '../schema';
import {
    tokenize,
    classifyTokenMatches,
    graduatedMatchScore,
    countConsecutiveMatches,
    MatchType,
    MATCH_WEIGHTS,
} from './tokenizer';
import { browserAPI } from '../../core/helpers';
import { Logger } from '../../core/logger';
import { SettingsManager } from '../../core/settings';
import { ScorerContext } from '../../core/scorer-types';
import { expandQueryKeywords, getLastExpansionSource } from '../ai-keyword-expander';
import { applyDiversityFilter, ScoredItem } from './diversity-filter';
import { performanceTracker } from '../performance-monitor';
import { getExpandedTerms } from './query-expansion';
import { recordSearchDebug } from '../diagnostics';
import { getSearchCache } from './search-cache';

// === AI SEARCH STATUS ===
// Tracks what happened during the last search for user feedback
export interface AISearchStatus {
    aiKeywords: 'disabled' | 'cache-hit' | 'prefix-hit' | 'expanded' | 'error' | 'no-new-keywords';
    semantic: 'disabled' | 'active' | 'error' | 'circuit-breaker';
    expandedCount: number;
    embeddingsGenerated: number;
    searchTimeMs: number;
    aiExpandedKeywords: string[];  // AI-generated keywords only (excludes original query tokens)
}
let lastAIStatus: AISearchStatus | null = null;
export function getLastAIStatus(): AISearchStatus | null { return lastAIStatus; }

// === SEARCH CANCELLATION ===
// Allows cancelling a previous search when a new one starts
let activeSearchAbort: AbortController | null = null;

export async function runSearch(query: string, options?: { skipAI?: boolean }): Promise<IndexedItem[]> {
    // Cancel any in-flight search (prevents concurrent embedding generation storms)
    if (activeSearchAbort) {
        activeSearchAbort.abort();
    }
    activeSearchAbort = new AbortController();
    const searchAbort = activeSearchAbort;
    const searchStartTime = performance.now();
    const logger = Logger.forComponent('SearchEngine');
    logger.trace('runSearch', 'Search called with query:', query);

    const q = query.trim().toLowerCase();
    if (!q) {
        logger.trace('runSearch', 'Query is empty, returning empty array');
        return [];
    }

    // Check cache first for instant results
    // IMPORTANT: Skip cache when AI expansion is requested (!skipAI) — Phase 1 may have
    // cached non-AI results under the same key, and Phase 2 needs a fresh search with AI.
    const searchCache = getSearchCache();
    const useCache = options?.skipAI !== false; // cache OK for Phase 1 (skipAI=true) or default
    if (useCache) {
        const cachedResults = searchCache.get(q);
        if (cachedResults) {
            const cacheTime = performance.now() - searchStartTime;
            logger.info('runSearch', `⚡ Cache hit! Returning ${cachedResults.length} results in ${cacheTime.toFixed(2)}ms`);
            return cachedResults;
        }
    } else {
        logger.debug('runSearch', 'Skipping cache — AI expansion requested (Phase 2)');
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
    const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') ?? false;

    // Initialize AI status tracking for user feedback
    const aiStatus: AISearchStatus = {
        aiKeywords: ollamaEnabled ? 'no-new-keywords' : 'disabled',
        semantic: 'disabled',
        expandedCount: 0,
        embeddingsGenerated: 0,
        searchTimeMs: 0,
        aiExpandedKeywords: [],
    };

    // AI-expanded tokens (includes synonyms, related terms)
    // This is ONE LLM call, not 600+ embeddings!
    let searchTokens: string[] = synonymExpandedTokens; // Start with synonym-expanded tokens
    let aiExpanded = false;

    if (ollamaEnabled && !options?.skipAI) {
        logger.info('runSearch', '🤖 AI keyword expansion ACTIVE');
        try {
            const expandedTokens = await expandQueryKeywords(q);
            const expansionSource = getLastExpansionSource();
            if (expandedTokens.length > originalTokens.length) {
                searchTokens = expandedTokens;
                aiExpanded = true;
                aiStatus.expandedCount = expandedTokens.length - originalTokens.length;
                const originalSet = new Set(originalTokens.map(t => t.toLowerCase()));
                aiStatus.aiExpandedKeywords = expandedTokens.filter(t => !originalSet.has(t.toLowerCase()));
                // Map expansion source to status
                if (expansionSource === 'cache-hit') {
                    aiStatus.aiKeywords = 'cache-hit';
                } else if (expansionSource === 'prefix-hit') {
                    aiStatus.aiKeywords = 'prefix-hit';
                } else {
                    aiStatus.aiKeywords = 'expanded';
                }
                logger.info('runSearch', `✅ Expanded "${q}" → ${searchTokens.length} keywords (source: ${expansionSource})`, {
                    original: originalTokens,
                    expanded: searchTokens.filter(t => !originalTokens.includes(t))
                });
            }
        } catch (error) {
            aiStatus.aiKeywords = 'error';
            logger.warn('runSearch', '⚠️ Keyword expansion failed, using original query', { error });
        }
    } else if (ollamaEnabled && options?.skipAI) {
        logger.info('runSearch', '🔍 Keyword search (AI deferred — Phase 1)');
    } else {
        logger.info('runSearch', '🔍 Keyword search (AI disabled)');
    }

    const scorers = getAllScorers();
    logger.trace('runSearch', 'Loaded scorers:', scorers.length);

    // Check if semantic search is enabled
    const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
    let queryEmbedding: number[] | undefined;

    // Generate query embedding for semantic search if enabled.
    // Skip in Phase 1 (skipAI: true) when keyword AI is also enabled — Phase 2 will run the
    // embedding properly after keyword expansion completes. Avoids Ollama slot contention.
    // Exception: if only semantic is enabled (no keyword AI), Phase 2 never fires, so
    // embedding must run in Phase 1.
    const keywordAIEnabled = SettingsManager.getSetting('ollamaEnabled') ?? false;
    const skipEmbeddingThisPhase = (options?.skipAI === true) && keywordAIEnabled;
    if (embeddingsEnabled && !skipEmbeddingThisPhase) {
        aiStatus.semantic = 'active';
        // Check abort and circuit breaker BEFORE expensive Ollama calls
        if (searchAbort.signal.aborted) { return []; }

        const ollamaModule = await import('../ollama-service');
        if (ollamaModule.isCircuitBreakerOpen()) {
            aiStatus.semantic = 'circuit-breaker';
            logger.warn('runSearch', '🔴 Circuit breaker open — skipping semantic search');
        } else {
            logger.info('runSearch', '🧠 Semantic search ACTIVE - generating query embedding');
            try {
                // Use EMBEDDING model (not generation model) with user's settings
                const embConfig = await ollamaModule.getOllamaConfigFromSettings(true);
                const ollamaService = ollamaModule.getOllamaService(embConfig);
                const embeddingResult = await ollamaService.generateEmbedding(q, searchAbort.signal);
                if (embeddingResult.success && embeddingResult.embedding.length > 0) {
                    queryEmbedding = embeddingResult.embedding;
                    logger.info('runSearch', `✅ Query embedding generated (${queryEmbedding.length} dimensions)`);
                } else {
                    aiStatus.semantic = 'error';
                    logger.warn('runSearch', `⚠️ Query embedding generation failed: ${embeddingResult.error || 'empty'}`);
                }
            } catch (error) {
                aiStatus.semantic = 'error';
                logger.warn('runSearch', '⚠️ Semantic search failed, falling back to keyword search', { error });
            }
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
    const showNonMatchingResults = SettingsManager.getSetting('showNonMatchingResults') ?? false;

    // === EMBEDDING GENERATION GUARDRAILS ===
    // These caps prevent the catastrophic memory leak that caused 14GB RAM usage.
    // Without caps, every search generates embeddings for ALL ~10k+ items.
    const MAX_EMBEDDINGS_PER_SEARCH = 10;  // Only generate for top 10 unembedded items per search
    const EMBEDDING_TIME_BUDGET_MS = 5000; // Max 5 seconds total for embedding generation
    let embeddingsGenerated = 0;
    let embeddingTimeSpent = 0;

    // Process items for scoring
    for (const item of items) {
        // Check abort before each item (search may have been cancelled)
        if (searchAbort.signal.aborted) { return []; }

        // On-demand embedding generation for semantic search — HEAVILY GUARDED
        if (embeddingsEnabled && !item.embedding
            && embeddingsGenerated < MAX_EMBEDDINGS_PER_SEARCH
            && embeddingTimeSpent < EMBEDDING_TIME_BUDGET_MS) {
            try {
                const ollamaModule = await import('../ollama-service');
                if (!ollamaModule.isCircuitBreakerOpen() && ollamaModule.checkMemoryPressure().ok) {
                    const embStart = performance.now();
                    const embConfig = await ollamaModule.getOllamaConfigFromSettings(true);
                    const text = `${item.title} ${item.metaDescription || ''} ${item.url}`.trim();
                    const embeddingResult = await ollamaModule.getOllamaService(embConfig)
                        .generateEmbedding(text, searchAbort.signal);
                    embeddingTimeSpent += performance.now() - embStart;

                    if (embeddingResult.success && embeddingResult.embedding.length > 0) {
                        item.embedding = embeddingResult.embedding;
                        embeddingsGenerated++;
                        // Save back to DB for future searches
                        await import('../database').then(db => db.saveIndexedItem(item));
                    }
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

        const titleText = ((item.bookmarkTitle || item.title) || '').toLowerCase();
        const urlText = (item.url || '').toLowerCase();
        const titleUrlText = `${titleText} ${urlText}`;

        const titleUrlMatchTypes = originalTokens.length > 0
            ? classifyTokenMatches(originalTokens, titleUrlText)
            : [];
        const titleUrlMatchedCount = titleUrlMatchTypes.filter(t => t !== MatchType.NONE).length;
        const titleUrlCoverage = originalTokens.length > 0 ? titleUrlMatchedCount / originalTokens.length : 0;
        const titleUrlQuality = originalTokens.length > 0
            ? titleUrlMatchTypes.reduce((s, t) => s + MATCH_WEIGHTS[t], 0) / originalTokens.length
            : 0;

        // Split-field signal: one token in title and another token in URL (user intent across fields)
        let hasTitleToken = false;
        let hasUrlToken = false;
        for (const token of originalTokens) {
            if (classifyTokenMatches([token], titleText)[0] !== MatchType.NONE) {
                hasTitleToken = true;
            }
            if (classifyTokenMatches([token], urlText)[0] !== MatchType.NONE) {
                hasUrlToken = true;
            }
        }
        const splitFieldCoverage = hasTitleToken && hasUrlToken ? 1 : 0;

        // Intent bucket for deterministic ranking precedence
        // Multi-token queries should prioritize explicit coverage in title+url.
        let intentPriority = 0;
        if (originalTokens.length >= 2) {
            if (titleUrlCoverage === 1) {
                intentPriority = splitFieldCoverage ? 3 : 2;
            } else if (titleUrlCoverage >= 0.75) {
                intentPriority = 1;
            }
        }
        
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

        // ─── Deep Search Post-Score Boosters ────────────────────────────
        // Boost score for literal substring matches (exact query found)
        if (hasLiteralMatch && score > 0) {
            score *= 1.5; // 50% boost for exact literal matches
        }

        // Graduated match quality boost for original tokens against title
        // Replaces the old binary exact-keyword multiplier with Deep Search classification
        if (score > 0 && originalTokens.length > 0) {
            const titleMatchTypes = classifyTokenMatches(originalTokens, titleText);

            const exactCount = titleMatchTypes.filter(t => t === MatchType.EXACT).length;
            const prefixCount = titleMatchTypes.filter(t => t === MatchType.PREFIX).length;
            const substringCount = titleMatchTypes.filter(t => t === MatchType.SUBSTRING).length;
            const matchedCount = exactCount + prefixCount + substringCount;

            if (matchedCount === originalTokens.length) {
                // All tokens matched in title — graduated boost based on quality
                if (exactCount === originalTokens.length) {
                    score *= 1.45; // All exact keywords — strongest boost
                } else if (exactCount > 0) {
                    // Mixed quality: proportional boost
                    // e.g., 2 exact + 1 prefix out of 3 → (2×1.0 + 1×0.75) / 3 = 0.917
                    const qualityRatio = titleMatchTypes.reduce((s, t) => s + MATCH_WEIGHTS[t], 0) / originalTokens.length;
                    score *= 1.0 + qualityRatio * 0.40; // Up to 1.40× for near-perfect
                } else if (prefixCount > 0) {
                    // All prefix or prefix+substring mix
                    const qualityRatio = titleMatchTypes.reduce((s, t) => s + MATCH_WEIGHTS[t], 0) / originalTokens.length;
                    score *= 1.0 + qualityRatio * 0.25; // Moderate boost
                } else {
                    // All substring matches — small boost (still all matched)
                    score *= 1.10;
                }
            } else if (matchedCount > 0) {
                // Partial coverage with graduated scoring
                const graduatedScore = graduatedMatchScore(originalTokens, titleText);
                score *= 1.0 + graduatedScore * 0.15;
            }

            // Consecutive token bonus on the title
            const consecutivePairs = countConsecutiveMatches(originalTokens, titleText);
            if (consecutivePairs > 0) {
                const maxPairs = Math.max(1, originalTokens.length - 1);
                score *= 1.0 + (consecutivePairs / maxPairs) * 0.10;
            }

            // Combined title+URL boost:
            // Ensures queries with token split across title and URL (e.g., "zaar-api" in URL, "console" in title)
            // receive strong ranking preference.
            if (titleUrlMatchedCount === originalTokens.length) {
                const combinedQualityRatio = titleUrlMatchTypes.reduce((s, t) => s + MATCH_WEIGHTS[t], 0) / originalTokens.length;
                score *= 1.0 + combinedQualityRatio * 0.20;

                // Extra bonus when coverage is genuinely split across fields (not only title or only URL)
                let hasTitleOnlyToken = false;
                let hasUrlOnlyToken = false;

                for (const token of originalTokens) {
                    const inTitle = classifyTokenMatches([token], titleText)[0] !== MatchType.NONE;
                    const inUrl = classifyTokenMatches([token], urlText)[0] !== MatchType.NONE;

                    if (inTitle && !inUrl) {
                        hasTitleOnlyToken = true;
                    }
                    if (inUrl && !inTitle) {
                        hasUrlOnlyToken = true;
                    }
                }

                if (hasTitleOnlyToken && hasUrlOnlyToken) {
                    score *= 1.20;
                }
            }

            // Strong intent multiplier for explicit multi-token title+url coverage.
            // Ensures user-specified keywords dominate over recency/frequency noise.
            if (originalTokens.length >= 2) {
                if (titleUrlCoverage === 1) {
                    score *= splitFieldCoverage ? 1.60 : 1.40;
                } else if (titleUrlCoverage >= 0.75) {
                    score *= 1.15;
                }
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
                aiMatch: hasAiMatch,
                intentPriority,
                titleUrlCoverage,
                titleUrlQuality,
                splitFieldCoverage,
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

    // Sort by user intent first, then by score.
    // This ensures deliberate multi-token title+url matches rank above incidental high-recency matches.
    results.sort((a, b) => {
        const intentDelta = (b.intentPriority || 0) - (a.intentPriority || 0);
        if (intentDelta !== 0) { return intentDelta; }

        const coverageDelta = (b.titleUrlCoverage || 0) - (a.titleUrlCoverage || 0);
        if (coverageDelta !== 0) { return coverageDelta; }

        const splitDelta = (b.splitFieldCoverage || 0) - (a.splitFieldCoverage || 0);
        if (splitDelta !== 0) { return splitDelta; }

        const qualityDelta = (b.titleUrlQuality || 0) - (a.titleUrlQuality || 0);
        if (qualityDelta !== 0) { return qualityDelta; }

        return b.finalScore - a.finalScore;
    });

    // Apply diversity filter to remove duplicate URLs (same page, different query params)
    const showDuplicateUrls = SettingsManager.getSetting('showDuplicateUrls') ?? false;
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

    // === MEMORY CLEANUP: Release embedding arrays from items ===
    // Embeddings are persisted to IndexedDB during generation. We don't need them in memory
    // after scoring is complete. This prevents the items array from hogging memory.
    if (embeddingsEnabled) {
        for (const item of items) {
            item.embedding = undefined;
        }
        if (embeddingsGenerated > 0) {
            aiStatus.embeddingsGenerated = embeddingsGenerated;
            logger.info('runSearch', `🧠 Embedding generation stats: ${embeddingsGenerated}/${MAX_EMBEDDINGS_PER_SEARCH} cap, ${embeddingTimeSpent.toFixed(0)}ms/${EMBEDDING_TIME_BUDGET_MS}ms budget`);
        }
    }

    // Clear abort reference since this search is done
    if (activeSearchAbort === searchAbort) {
        activeSearchAbort = null;
    }

    // Record search performance
    const searchDuration = performance.now() - searchStartTime;
    performanceTracker.recordSearch(searchDuration);

    // Store AI status for the UI
    aiStatus.searchTimeMs = Math.round(searchDuration);
    lastAIStatus = aiStatus;

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