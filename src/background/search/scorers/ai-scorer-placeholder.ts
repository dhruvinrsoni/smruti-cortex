import { Scorer } from "../../../core/scorer-types";

const aiScorer: Scorer = {
    name: "ai_scorer",
    weight: 0.00,  // Disabled until AI integration added
    score: () => 0,
};

export default aiScorer;