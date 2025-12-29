import { Scorer } from '../../../core/scorer-types';
import { tokenize } from '../tokenizer';

const titleScorer: Scorer = {
    name: 'title',
    weight: 0.40,
    score: (item, query, _allItems, context) => {
        const title = item.title.toLowerCase();
        const originalTokens = tokenize(query);
        
        // Use AI-expanded tokens if available, otherwise use original
        const searchTokens = context?.expandedTokens || originalTokens;

        if (searchTokens.length === 0) {return 0;}

        // Exact title match with original query (highest relevance)
        if (title === query) {return 1;}

        // Count token matches in title (using expanded tokens for broader matching)
        const matches = searchTokens.filter(token => title.includes(token)).length;
        const matchRatio = matches / searchTokens.length;
        
        // Count original token matches (higher weight for direct matches)
        const originalMatches = originalTokens.filter(token => title.includes(token)).length;

        // Boost for titles that start with query tokens (more prominent content)
        const startsWithBonus = searchTokens.some(token => title.startsWith(token)) ? 0.1 : 0;

        // Boost for titles containing multiple query tokens (better relevance)
        const multiTokenBonus = matches > 1 ? 0.1 : 0;
        
        // Boost for matching original (non-expanded) tokens
        const originalMatchBonus = originalMatches > 0 ? 0.15 : 0;

        return Math.min(1.0, matchRatio + startsWithBonus + multiTokenBonus + originalMatchBonus);
    },
};

export default titleScorer;