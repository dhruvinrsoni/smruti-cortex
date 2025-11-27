import { Scorer } from "../../../core/scorer-types";
import { tokenize } from "../tokenizer";

const urlScorer: Scorer = {
    name: "url",
    weight: 0.15,
    score: (item, query) => {
        const url = item.url.toLowerCase();
        const hostname = item.hostname.toLowerCase();
        const queryTokens = tokenize(query);

        if (queryTokens.length === 0) return 0;

        // Direct URL matches (highest relevance)
        const urlMatches = queryTokens.filter(token => url.includes(token)).length;
        const urlScore = urlMatches / queryTokens.length;

        // Hostname/domain matches (important for finding related content)
        const hostnameMatches = queryTokens.filter(token => hostname.includes(token)).length;
        const hostnameScore = hostnameMatches > 0 ? 0.3 : 0; // Boost for domain matches

        // Path-based matching (URLs with query terms in path are relevant)
        const urlPath = url.replace(hostname, ''); // Remove domain from URL
        const pathMatches = queryTokens.filter(token => urlPath.includes(token)).length;
        const pathScore = (pathMatches / queryTokens.length) * 0.2; // Lower weight for path matches

        return Math.min(1.0, urlScore + hostnameScore + pathScore);
    },
};

export default urlScorer;