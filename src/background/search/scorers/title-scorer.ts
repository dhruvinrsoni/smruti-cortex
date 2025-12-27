import { Scorer } from '../../../core/scorer-types';
import { tokenize } from '../tokenizer';

const titleScorer: Scorer = {
    name: 'title',
    weight: 0.40,
    score: (item, query, _allItems) => {
        const title = item.title.toLowerCase();
        const queryTokens = tokenize(query);

        if (queryTokens.length === 0) {return 0;}

        // Exact title match (highest relevance)
        if (title === query) {return 1;}

        // Count token matches in title
        const matches = queryTokens.filter(token => title.includes(token)).length;
        const matchRatio = matches / queryTokens.length;

        // Boost for titles that start with query tokens (more prominent content)
        const startsWithBonus = queryTokens.some(token => title.startsWith(token)) ? 0.1 : 0;

        // Boost for titles containing multiple query tokens (better relevance)
        const multiTokenBonus = matches > 1 ? 0.1 : 0;

        return Math.min(1.0, matchRatio + startsWithBonus + multiTokenBonus);
    },
};

export default titleScorer;