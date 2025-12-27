import { Scorer } from '../../../core/scorer-types';

const recencyScorer: Scorer = {
    name: 'recency',
    weight: 0.20,
    score: (item, _query, _allItems) => {
        const diff = Date.now() - item.lastVisit;
        const days = diff / (1000 * 60 * 60 * 24);
        const score = Math.exp(-days / 30); 
        return Math.min(1, Math.max(0, score));
    },
};

export default recencyScorer;