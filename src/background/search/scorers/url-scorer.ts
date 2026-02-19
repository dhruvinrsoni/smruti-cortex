import { Scorer } from '../../../core/scorer-types';
import {
    tokenize,
    graduatedMatchScore,
    classifyMatch,
    MatchType,
    MATCH_WEIGHTS,
} from '../tokenizer';

/**
 * Deep Search URL Scorer
 *
 * Graduated URL relevance scoring across hostname, path, and full URL.
 * Uses match classification (exact > prefix > substring) instead of binary includes().
 */
const urlScorer: Scorer = {
    name: 'url',
    weight: 0.12,
    score: (item, query, _allItems, context) => {
        const url = item.url.toLowerCase();
        const hostname = item.hostname.toLowerCase();
        const originalTokens = tokenize(query);
        const searchTokens = context?.expandedTokens || originalTokens;

        if (searchTokens.length === 0) return 0;

        // ─── Graduated URL match (expanded tokens) ──────────────────
        const urlGraduated = graduatedMatchScore(searchTokens, url);

        // ─── Hostname match (strong signal for domain relevance) ────
        let hostnameScore = 0;
        for (const token of searchTokens) {
            const matchType = classifyMatch(token, hostname);
            if (matchType !== MatchType.NONE) {
                hostnameScore = Math.max(hostnameScore, MATCH_WEIGHTS[matchType] * 0.3);
            }
        }

        // ─── Path-based graduated matching ──────────────────────────
        const urlPath = url.replace(hostname, '');
        const pathGraduated = graduatedMatchScore(searchTokens, urlPath) * 0.2;

        // ─── Original token bonus (higher confidence than expanded) ─
        const originalGraduated = graduatedMatchScore(originalTokens, url);
        const originalBonus = originalGraduated > 0 ? originalGraduated * 0.15 : 0;

        return Math.min(1.0, urlGraduated + hostnameScore + pathGraduated + originalBonus);
    },
};

export default urlScorer;