// scorer-manager.ts — Collects all scorers into a single weighted scoring pipeline

import { Scorer } from '../../core/scorer-types';
import { SettingsManager } from '../../core/settings';
import titleScorer from './scorers/title-scorer';
import urlScorer from './scorers/url-scorer';
import recencyScorer from './scorers/recency-scorer';
import visitCountScorer from './scorers/visitcount-scorer';
import metaScorer from './scorers/meta-scorer';
import embeddingScorer from './scorers/embedding-scorer';
import aiScorer from './scorers/ai-scorer-placeholder';

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
    // Dynamic embedding scorer weight based on AI settings
    const ollamaEnabled = SettingsManager.getSetting('ollamaEnabled') || false;
    const dynamicEmbeddingScorer: Scorer = {
        ...embeddingScorer,
        weight: ollamaEnabled ? 0.4 : 0,  // ✅ 0.4 when AI enabled, 0 when disabled
    };

    return [
        titleScorer,
        urlScorer,
        recencyScorer,
        visitCountScorer,
        metaScorer,
        dynamicEmbeddingScorer,  // AI-powered semantic search (dynamic weight)
        domainFamiliarityScorer, // Organic biasing based on user behavior
        aiScorer,                // placeholder (weight = 0)
    ];
}