import { Scorer } from "../../../core/scorer-types";
import { tokenize } from "../tokenizer";

const metaScorer: Scorer = {
    name: "meta",
    weight: 0.10,
    score: (item, query, allItems) => {
        const desc = (item.metaDescription || "").toLowerCase();
        const keywords = (item.metaKeywords || []).join(" ").toLowerCase();
        const text = desc + " " + keywords;

        if (!text.trim()) return 0;

        const queryTokens = tokenize(query);
        if (queryTokens.length === 0) return 0;

        const matches = queryTokens.filter(token => text.includes(token)).length;
        return matches / queryTokens.length;
    },
};

export default metaScorer;