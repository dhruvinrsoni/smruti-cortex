import { Scorer } from "../../../core/scorer-types";

const metaScorer: Scorer = {
    name: "meta",
    weight: 0.10,
    score: (item, query) => {
        const desc = (item.metaDescription || "").toLowerCase();
        const keywords = (item.metaKeywords || []).join(" ").toLowerCase();
        const text = desc + " " + keywords;

        if (!text) return 0;
        if (text.includes(query)) return 1;

        const tokens = query.split(" ");
        const matches = tokens.filter(t => text.includes(t)).length;
        return matches / tokens.length;
    },
};

export default metaScorer;