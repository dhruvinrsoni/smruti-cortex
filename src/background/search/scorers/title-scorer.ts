import { Scorer } from "../../../core/scorer-types";

const titleScorer: Scorer = {
    name: "title",
    weight: 0.30,
    score: (item, query) => {
        const title = item.title.toLowerCase();
        if (title === query) return 1;
        if (title.includes(query)) return 0.8;

        let score = 0;
        const qTokens = query.split(" ");
        const matches = qTokens.filter(t => title.includes(t)).length;
        score = matches / qTokens.length;

        return score;
    },
};

export default titleScorer;