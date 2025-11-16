import { Scorer } from "../../../core/scorer-types";

const urlScorer: Scorer = {
    name: "url",
    weight: 0.20,
    score: (item, query) => {
        const url = item.url.toLowerCase();
        if (url.includes(query)) return 1;

        const qParts = query.split("/");
        const matches = qParts.filter(t => url.includes(t)).length;
        return matches / qParts.length;
    },
};

export default urlScorer;