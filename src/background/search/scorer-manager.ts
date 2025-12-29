// scorer-manager.ts — Collects all scorers into a single weighted scoring pipeline

import { Scorer } from '../../core/scorer-types';
import titleScorer from './scorers/title-scorer';
import urlScorer from './scorers/url-scorer';
import recencyScorer from './scorers/recency-scorer';
import visitCountScorer from './scorers/visitcount-scorer';
import metaScorer from './scorers/meta-scorer';
// NOTE: Embedding scorer REMOVED - prompting-based keyword expansion is now used instead
// The embedding approach was flawed: it generated 600+ embeddings per search
// New approach: ONE LLM call expands query → synonyms, then fast keyword matching

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
        recencyScorer,         // Time-based, no token matching
        visitCountScorer,      // Visit count-based, no token matching
        metaScorer,            // Uses expandedTokens from context
        domainFamiliarityScorer, // Organic biasing based on user behavior
    ];
}