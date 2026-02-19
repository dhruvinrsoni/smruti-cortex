import { Scorer, ScorerContext } from '../../../core/scorer-types';
import { IndexedItem } from '../../schema';
import {
    tokenize,
    classifyTokenMatches,
    graduatedMatchScore,
    matchPosition,
    countConsecutiveMatches,
    MatchType,
    MATCH_WEIGHTS,
} from '../tokenizer';

/**
 * Deep Search Title Scorer
 *
 * Graduated multi-signal title relevance scoring:
 *  1. Per-token graduated match quality (exact > prefix > substring)
 *  2. Position bonus (matches earlier in title = more relevant)
 *  3. Consecutive token bonus (phrase-like matches)
 *  4. Coverage bonus (original tokens matching directly)
 *  5. Match quality composition (all-exact vs mixed vs substring-only)
 */
const titleScorer: Scorer = {
    name: 'title',
    weight: 0.35,
    score: (item: IndexedItem, query: string, _allItems: IndexedItem[], context?: ScorerContext) => {
        const title = ((item.bookmarkTitle || item.title) || '').toLowerCase();
        const originalTokens = tokenize(query);
        const searchTokens = context?.expandedTokens || originalTokens;

        if (searchTokens.length === 0) return 0;

        // Exact title match with original query (highest relevance)
        if (title === query) return 1;

        // ─── 1. Graduated match quality for expanded tokens ─────────────
        const expandedGraduated = graduatedMatchScore(searchTokens, title);

        // ─── 2. Graduated match quality for original tokens (heavier) ───
        const originalMatchTypes = classifyTokenMatches(originalTokens, title);
        const originalGraduated = originalTokens.length > 0
            ? originalMatchTypes.reduce((s, t) => s + MATCH_WEIGHTS[t], 0) / originalTokens.length
            : 0;

        // Count original tokens by match type
        const exactCount = originalMatchTypes.filter(t => t === MatchType.EXACT).length;
        const prefixCount = originalMatchTypes.filter(t => t === MatchType.PREFIX).length;
        const substringCount = originalMatchTypes.filter(t => t === MatchType.SUBSTRING).length;
        const matchedCount = exactCount + prefixCount + substringCount;

        // ─── 3. Position bonus — earlier matches in title are better ────
        let positionBonus = 0;
        if (matchedCount > 0) {
            const avgPosition = originalTokens.reduce((sum, t) => sum + matchPosition(t, title), 0) / originalTokens.length;
            // Invert: 0 position → 0.15 bonus, 1.0 position → 0 bonus
            positionBonus = (1 - avgPosition) * 0.15;
        }

        // ─── 4. Consecutive token bonus (phrase matching) ───────────────
        const consecutivePairs = countConsecutiveMatches(originalTokens, title);
        const maxPairs = Math.max(1, originalTokens.length - 1);
        // Scale: all consecutive → 0.2 bonus
        const consecutiveBonus = (consecutivePairs / maxPairs) * 0.2;

        // ─── 5. Match composition bonus ─────────────────────────────────
        let compositionBonus = 0;
        if (originalTokens.length > 0 && matchedCount === originalTokens.length) {
            // All tokens matched — bonus depends on quality distribution
            if (exactCount === originalTokens.length) {
                compositionBonus = 0.25; // All exact keywords — strongest signal
            } else if (exactCount > 0 && (prefixCount > 0 || substringCount > 0)) {
                // Mixed: e.g., 2 exact + 1 prefix → proportional bonus
                compositionBonus = 0.10 + (exactCount / originalTokens.length) * 0.12;
            } else if (prefixCount > 0) {
                compositionBonus = 0.08; // All prefix matches
            }
        } else if (matchedCount > 0) {
            // Partial coverage — small bonus for what matched
            compositionBonus = (matchedCount / originalTokens.length) * 0.05;
        }

        // ─── 6. Starts-with bonus ───────────────────────────────────────
        const startsWithBonus = searchTokens.some(t => title.startsWith(t)) ? 0.08 : 0;

        // ─── Combine all signals ────────────────────────────────────────
        // Base: blend of expanded (30%) and original (70%) graduated scores
        const baseScore = expandedGraduated * 0.3 + originalGraduated * 0.7;

        const totalScore = baseScore + positionBonus + consecutiveBonus + compositionBonus + startsWithBonus;

        return Math.min(1.0, totalScore);
    },
};

export default titleScorer;