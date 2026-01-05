import { Scorer } from '../../../core/scorer-types';
import { tokenize } from '../tokenizer';

const urlScorer: Scorer = {
    name: 'url',
    weight: 0.12, // Reduced from 0.15 to balance with cross-dimensional scorer
    score: (item, query, _allItems, context) => {
        const url = item.url.toLowerCase();
        const hostname = item.hostname.toLowerCase();
        const originalTokens = tokenize(query);
        
        // Use AI-expanded tokens if available
        const searchTokens = context?.expandedTokens || originalTokens;

        if (searchTokens.length === 0) {return 0;}

        // Direct URL matches using expanded tokens
        const urlMatches = searchTokens.filter(token => url.includes(token)).length;
        const urlScore = urlMatches / searchTokens.length;

        // Hostname/domain matches (important for finding related content)
        const hostnameMatches = searchTokens.filter(token => hostname.includes(token)).length;
        const hostnameScore = hostnameMatches > 0 ? 0.3 : 0; // Boost for domain matches

        // Path-based matching (URLs with query terms in path are relevant)
        const urlPath = url.replace(hostname, ''); // Remove domain from URL
        const pathMatches = searchTokens.filter(token => urlPath.includes(token)).length;
        const pathScore = (pathMatches / searchTokens.length) * 0.2; // Lower weight for path matches
        
        // Bonus for matching original (non-expanded) tokens
        const originalMatches = originalTokens.filter(token => url.includes(token)).length;
        const originalMatchBonus = originalMatches > 0 ? 0.1 : 0;

        return Math.min(1.0, urlScore + hostnameScore + pathScore + originalMatchBonus);
    },
};

export default urlScorer;