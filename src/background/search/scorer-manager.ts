// scorer-manager.ts — Deep Search scoring pipeline
// Collects all scorers into a single weighted scoring pipeline with graduated match classification

import { Scorer, ScorerContext } from '../../core/scorer-types';
import { IndexedItem } from '../schema';
import titleScorer from './scorers/title-scorer';
import urlScorer from './scorers/url-scorer';
import recencyScorer from './scorers/recency-scorer';
import visitCountScorer from './scorers/visitcount-scorer';
import metaScorer from './scorers/meta-scorer';
import embeddingScorer from './scorers/embedding-scorer';
import {
    tokenize,
    countExactKeywordMatches,
    classifyTokenMatches,
    graduatedMatchScore,
    countConsecutiveMatches,
    MatchType,
    MATCH_WEIGHTS,
} from './tokenizer';
import { SettingsManager } from '../../core/settings';

// ─── Cross-Dimensional Scorer ───────────────────────────────────────────────
// Rewards results matching different keywords across different fields
// Uses graduated match classification for each dimension
const crossDimensionalScorer: Scorer = {
    name: 'crossDimensional',
    weight: 0.15,
    score: (item: IndexedItem, query: string, _allItems: IndexedItem[], context?: ScorerContext) => {
        const title = ((item.bookmarkTitle || item.title) || '').toLowerCase();
        const url = item.url.toLowerCase();
        const hostname = item.hostname.toLowerCase();
        const metaDescription = (item.metaDescription || '').toLowerCase();
        const originalTokens = tokenize(query);
        const searchTokens = context?.expandedTokens || originalTokens;

        if (searchTokens.length < 2) return 0;

        // Define dimensions with graduated matching
        const dimensions: Record<string, { content: string; weight: number }> = {
            title: { content: title, weight: 1.0 },
            url: { content: url, weight: 0.8 },
            hostname: { content: hostname, weight: 0.6 },
            meta: { content: metaDescription, weight: 0.4 },
        };

        // Track best match type per token per dimension
        const tokenBestMatch: Record<string, { bestType: MatchType; dimensions: Set<string> }> = {};

        for (const token of searchTokens) {
            let bestType = MatchType.NONE;
            const matchedDims = new Set<string>();

            for (const [dimName, dimData] of Object.entries(dimensions)) {
                const matchTypes = classifyTokenMatches([token], dimData.content);
                if (matchTypes[0] !== MatchType.NONE) {
                    matchedDims.add(dimName);
                    bestType = Math.max(bestType, matchTypes[0]) as MatchType;
                }
            }

            tokenBestMatch[token] = { bestType, dimensions: matchedDims };
        }

        // Calculate cross-dimensional coverage
        let totalScore = 0;
        const matchedTokens = searchTokens.filter(t => tokenBestMatch[t].bestType !== MatchType.NONE);

        if (matchedTokens.length < 2) return 0;

        // Graduated bonus per token: weight by match quality × dimension count
        for (const token of matchedTokens) {
            const { bestType, dimensions: dims } = tokenBestMatch[token];
            const qualityWeight = MATCH_WEIGHTS[bestType];
            const dimensionBonus = dims.size * 0.1 * qualityWeight;
            totalScore += dimensionBonus;
        }

        // Major bonus: different tokens covering different dimensions
        const dimensionCoverage = new Set<string>();
        for (const token of matchedTokens) {
            for (const dim of tokenBestMatch[token].dimensions) {
                dimensionCoverage.add(dim);
            }
        }
        const uniqueDimensions = dimensionCoverage.size;
        const dimensionCoverageBonus = uniqueDimensions > 1 ? (uniqueDimensions - 1) * 0.2 : 0;

        // Original token cross-dimensional bonus
        const originalMatched = originalTokens.filter(
            t => tokenBestMatch[t] && tokenBestMatch[t].bestType !== MatchType.NONE
        );
        const originalCrossDimBonus = originalMatched.length > 1 ? 0.15 : 0;

        totalScore += dimensionCoverageBonus + originalCrossDimBonus;

        return Math.min(1.0, totalScore);
    },
};

// ─── Multi-Token Match Scorer ───────────────────────────────────────────────
// CRITICAL: heavily rewards results matching multiple query tokens
// Now uses graduated match classification + consecutive token bonus
const multiTokenMatchScorer: Scorer = {
    name: 'multiTokenMatch',
    weight: 0.35,
    score: (item: IndexedItem, query: string, _allItems: IndexedItem[], _context?: ScorerContext) => {
        const title = (item.bookmarkTitle || item.title).toLowerCase();
        const url = item.url.toLowerCase();
        const metaDescription = (item.metaDescription || '').toLowerCase();
        const bookmarkFolders = (item.bookmarkFolders?.join(' ') || '').toLowerCase();
        const haystack = `${title} ${url} ${metaDescription} ${bookmarkFolders}`;

        const originalTokens = tokenize(query);
        if (originalTokens.length < 2) return 0;

        // ─── Graduated match score across all content ───────────────
        const graduated = graduatedMatchScore(originalTokens, haystack);

        // Exponential reward for coverage — matching more tokens = disproportionately better
        // graduated is already 0..1 based on match quality
        let score = graduated > 0 ? Math.pow(graduated, 1.3) : 0;

        // ─── Match quality breakdown ────────────────────────────────
        const matchTypes = classifyTokenMatches(originalTokens, haystack);
        const exactCount = matchTypes.filter(t => t === MatchType.EXACT).length;
        const prefixCount = matchTypes.filter(t => t === MatchType.PREFIX).length;
        const substringCount = matchTypes.filter(t => t === MatchType.SUBSTRING).length;
        const matchedCount = exactCount + prefixCount + substringCount;

        // ─── Composition bonus: reward high-quality match distributions ─
        if (matchedCount === originalTokens.length) {
            // All tokens matched — bonus based on quality distribution
            const exactRatio = exactCount / originalTokens.length;
            const prefixRatio = prefixCount / originalTokens.length;

            if (exactRatio === 1) {
                score = Math.min(1.0, score + 0.30); // All exact = strongest
            } else if (exactCount > 0) {
                // Mixed exact + prefix/substring — proportional bonus
                score = Math.min(1.0, score + exactRatio * 0.20 + prefixRatio * 0.08);
            } else if (prefixCount > 0) {
                score = Math.min(1.0, score + prefixRatio * 0.10);
            }
        }

        // ─── Consecutive token bonus (phrase matching) ──────────────
        const consecutivePairs = countConsecutiveMatches(originalTokens, haystack);
        if (consecutivePairs > 0) {
            const maxPairs = originalTokens.length - 1;
            score = Math.min(1.0, score + (consecutivePairs / maxPairs) * 0.12);
        }

        return score;
    },
};

// Domain familiarity scorer - learns from user behavior patterns
const domainFamiliarityScorer: Scorer = {
    name: 'domainFamiliarity',
    weight: 0.05, // Small weight for subtle organic biasing
    score: (item: IndexedItem, _query: string, allItems?: IndexedItem[]) => {
        if (!allItems || allItems.length === 0) { return 0; }

        const hostname = item.hostname;
        if (!hostname) { return 0; }

        // Count how many items from this domain are in the user's history
        const domainItems = allItems.filter(otherItem => otherItem.hostname === hostname);
        const domainVisitCount = domainItems.reduce((sum, it) => sum + (it.visitCount || 1), 0);

        // Small boost based on domain familiarity (logarithmic scaling)
        // This creates organic biasing - domains user visits more get slight preference
        const familiarityScore = Math.min(0.2, Math.log(domainVisitCount + 1) / Math.log(50));

        return familiarityScore;
    },
};

export function getAllScorers(): Scorer[] {
    // Check if embeddings are enabled for semantic search
    const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') || false;

    // Create dynamic embedding scorer with appropriate weight
    const dynamicEmbeddingScorer = {
        ...embeddingScorer,
        weight: embeddingsEnabled ? 0.4 : 0.0
    };

    // All scorers now use expanded tokens from AI keyword expansion
    // Embedding scorer provides semantic search when enabled
    return [
        multiTokenMatchScorer,  // CRITICAL: Heavily rewards multi-token matches (weight 0.35)
        titleScorer,           // Uses expandedTokens from context
        urlScorer,             // Uses expandedTokens from context
        crossDimensionalScorer, // NEW: Rewards cross-dimensional keyword matching
        dynamicEmbeddingScorer, // AI semantic search (weight 0.4 when enabled, 0 when disabled)
        recencyScorer,         // Time-based, no token matching
        visitCountScorer,      // Visit count-based, no token matching
        metaScorer,            // Uses expandedTokens from context
        domainFamiliarityScorer, // Organic biasing based on user behavior
    ];
}