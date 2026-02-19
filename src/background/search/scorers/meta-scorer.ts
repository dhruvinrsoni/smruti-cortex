import { Scorer } from '../../../core/scorer-types';
import { tokenize, graduatedMatchScore } from '../tokenizer';

/**
 * Deep Search Meta Scorer
 *
 * Graduated scoring against page meta description and keywords.
 * Uses match classification (exact > prefix > substring).
 */
const metaScorer: Scorer = {
    name: 'meta',
    weight: 0.10,
    score: (item, query, _allItems, context) => {
        const desc = (item.metaDescription || '').toLowerCase();
        const keywords = (item.metaKeywords || []).join(' ').toLowerCase();
        const text = desc + ' ' + keywords;

        if (!text.trim()) return 0;

        const originalTokens = tokenize(query);
        const searchTokens = context?.expandedTokens || originalTokens;

        if (searchTokens.length === 0) return 0;

        // Graduated match for expanded tokens
        const expandedGraduated = graduatedMatchScore(searchTokens, text);

        // Graduated match for original tokens (bonus for direct matches)
        const originalGraduated = graduatedMatchScore(originalTokens, text);
        const originalBonus = originalGraduated > 0 ? originalGraduated * 0.15 : 0;

        return Math.min(1.0, expandedGraduated + originalBonus);
    },
};

export default metaScorer;