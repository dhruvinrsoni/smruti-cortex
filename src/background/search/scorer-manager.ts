// scorer-manager.ts — Collects all scorers into a single weighted scoring pipeline

import { Scorer } from "../../core/scorer-types";
import titleScorer from "./scorers/title-scorer";
import urlScorer from "./scorers/url-scorer";
import recencyScorer from "./scorers/recency-scorer";
import visitCountScorer from "./scorers/visitcount-scorer";
import metaScorer from "./scorers/meta-scorer";
import aiScorer from "./scorers/ai-scorer-placeholder";

export function getAllScorers(): Scorer[] {
    return [
        titleScorer,
        urlScorer,
        recencyScorer,
        visitCountScorer,
        metaScorer,
        aiScorer,   // placeholder (weight = 0)
    ];
}