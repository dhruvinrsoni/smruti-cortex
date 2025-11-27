import { Scorer } from "../../../core/scorer-types";
import { tokenize } from "../tokenizer";

const urlScorer: Scorer = {
    name: "url",
    weight: 0.15,
    score: (item, query) => {
        const url = item.url.toLowerCase();
        const queryTokens = tokenize(query);

        if (queryTokens.length === 0) return 0;

        // Pure relevance scoring: count matching tokens in URL
        const matches = queryTokens.filter(token => url.includes(token)).length;
        return matches / queryTokens.length;
    },
};

export default urlScorer;