import { Scorer } from '../../../core/scorer-types';

const visitCountScorer: Scorer = {
    name: 'visitCount',
    weight: 0.15,
    score: (item, _query, _allItems) => {
        const count = item.visitCount || 1;
        return Math.min(1, Math.log(count + 1) / Math.log(20));
    },
};

export default visitCountScorer;