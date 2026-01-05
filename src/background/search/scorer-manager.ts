// scorer-manager.ts — Collects all scorers into a single weighted scoring pipeline

import { Scorer } from '../../core/scorer-types';
import titleScorer from './scorers/title-scorer';
import urlScorer from './scorers/url-scorer';
import recencyScorer from './scorers/recency-scorer';
import visitCountScorer from './scorers/visitcount-scorer';
import metaScorer from './scorers/meta-scorer';
import { tokenize } from './tokenizer';

// Cross-dimensional scorer - rewards results matching different keywords in different dimensions
const crossDimensionalScorer: Scorer = {
    name: 'crossDimensional',
    weight: 0.15, // Significant weight to promote diverse keyword matching
    score: (item, query, _allItems, context) => {
        const title = item.title.toLowerCase();
        const url = item.url.toLowerCase();
        const hostname = item.hostname.toLowerCase();
        const metaDescription = (item.metaDescription || '').toLowerCase();
        const originalTokens = tokenize(query);

        // Use AI-expanded tokens if available
        const searchTokens = context?.expandedTokens || originalTokens;

        if (searchTokens.length < 2) { return 0; } // Need at least 2 tokens for cross-dimensional matching

        // Define dimensions
        const dimensions = {
            title: { content: title, weight: 1.0 },
            url: { content: url, weight: 0.8 },
            hostname: { content: hostname, weight: 0.6 },
            meta: { content: metaDescription, weight: 0.4 }
        };

        // Track which tokens matched in which dimensions
        const tokenDimensionMatches: Record<string, Set<string>> = {};

        // For each token, find which dimensions it matches in
        for (const token of searchTokens) {
            tokenDimensionMatches[token] = new Set();

            for (const [dimName, dimData] of Object.entries(dimensions)) {
                if (dimData.content.includes(token)) {
                    tokenDimensionMatches[token].add(dimName);
                }
            }
        }

        // Calculate cross-dimensional coverage
        let totalScore = 0;
        const matchedTokens = searchTokens.filter(token => tokenDimensionMatches[token].size > 0);

        if (matchedTokens.length < 2) { return 0; } // Need at least 2 tokens to match

        // Bonus for each token matching in different dimensions
        for (const token of matchedTokens) {
            const dimensionCount = tokenDimensionMatches[token].size;
            const dimensionBonus = dimensionCount * 0.1; // 0.1 per dimension matched
            totalScore += dimensionBonus;
        }

        // Major bonus: different tokens in different dimensions
        // This is the key insight - reward when "github" matches URL and "issues" matches title
        const dimensionCoverage = new Set<string>();
        for (const token of matchedTokens) {
            for (const dim of tokenDimensionMatches[token]) {
                dimensionCoverage.add(dim);
            }
        }

        // Bonus for covering multiple dimensions with different tokens
        const uniqueDimensionsCovered = dimensionCoverage.size;
        const dimensionCoverageBonus = uniqueDimensionsCovered > 1 ? (uniqueDimensionsCovered - 1) * 0.2 : 0;

        // Bonus for original tokens (not AI-expanded) being cross-dimensional
        const originalTokenMatches = originalTokens.filter(token =>
            tokenDimensionMatches[token] && tokenDimensionMatches[token].size > 0
        );
        const originalCrossDimBonus = originalTokenMatches.length > 1 ? 0.15 : 0;

        totalScore += dimensionCoverageBonus + originalCrossDimBonus;

        // Normalize to [0, 1] range
        return Math.min(1.0, totalScore);
    },
};

// Domain familiarity scorer - learns from user behavior patterns
const domainFamiliarityScorer: Scorer = {
    name: 'domainFamiliarity',
    weight: 0.05, // Small weight for subtle organic biasing
    score: (item, query, allItems) => {
        if (!allItems || allItems.length === 0) {return 0;}

        const hostname = item.hostname;
        if (!hostname) {return 0;}

        // Count how many items from this domain are in the user's history
        const domainItems = allItems.filter(otherItem => otherItem.hostname === hostname);
        const domainVisitCount = domainItems.reduce((sum, item) => sum + (item.visitCount || 1), 0);

        // Small boost based on domain familiarity (logarithmic scaling)
        // This creates organic biasing - domains user visits more get slight preference
        const familiarityScore = Math.min(0.2, Math.log(domainVisitCount + 1) / Math.log(50));

        return familiarityScore;
    },
};

export function getAllScorers(): Scorer[] {
    // All scorers now use expanded tokens from AI keyword expansion
    // No more embedding scorer - prompting approach is simpler and faster
    return [
        titleScorer,           // Uses expandedTokens from context
        urlScorer,             // Uses expandedTokens from context
        crossDimensionalScorer, // NEW: Rewards cross-dimensional keyword matching
        recencyScorer,         // Time-based, no token matching
        visitCountScorer,      // Visit count-based, no token matching
        metaScorer,            // Uses expandedTokens from context
        domainFamiliarityScorer, // Organic biasing based on user behavior
    ];
}