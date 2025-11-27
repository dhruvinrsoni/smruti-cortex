import { Scorer } from "../../../core/scorer-types";
import { tokenize } from "../tokenizer";

const titleScorer: Scorer = {
    name: "title",
    weight: 0.40,
    score: (item, query) => {
        const title = item.title.toLowerCase();
        const queryTokens = tokenize(query);

        if (queryTokens.length === 0) return 0;

        // Pure relevance scoring: count matching tokens in title
        const matches = queryTokens.filter(token => title.includes(token)).length;
        return matches / queryTokens.length;
    },
};

export default titleScorer;