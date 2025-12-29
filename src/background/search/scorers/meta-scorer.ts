import { Scorer } from '../../../core/scorer-types';
import { tokenize } from '../tokenizer';

const metaScorer: Scorer = {
    name: 'meta',
    weight: 0.10,
    score: (item, query, _allItems, context) => {
        const desc = (item.metaDescription || '').toLowerCase();
        const keywords = (item.metaKeywords || []).join(' ').toLowerCase();
        const text = desc + ' ' + keywords;

        if (!text.trim()) {return 0;}

        const originalTokens = tokenize(query);
        // Use AI-expanded tokens if available
        const searchTokens = context?.expandedTokens || originalTokens;
        
        if (searchTokens.length === 0) {return 0;}

        const matches = searchTokens.filter(token => text.includes(token)).length;
        const matchRatio = matches / searchTokens.length;
        
        // Bonus for matching original tokens
        const originalMatches = originalTokens.filter(token => text.includes(token)).length;
        const originalBonus = originalMatches > 0 ? 0.1 : 0;
        
        return Math.min(1.0, matchRatio + originalBonus);
    },
};

export default metaScorer;