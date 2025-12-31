/**
 * SmrutiCortex Scorer Plugin System
 * 
 * This module exports all built-in scorers and provides the interface
 * for creating custom scorers (plugin architecture).
 * 
 * === CREATING A CUSTOM SCORER ===
 * 
 * A scorer is an object that implements the Scorer interface:
 * 
 * ```typescript
 * import { Scorer, IndexedItem, ScorerContext } from '../../core/scorer-types';
 * 
 * const myCustomScorer: Scorer = {
 *     name: 'my-custom-scorer',
 *     weight: 1.0, // Contribution to overall score (0.0 - 5.0 recommended)
 *     score: (item: IndexedItem, query: string, allItems: IndexedItem[], context: ScorerContext) => {
 *         // Your scoring logic here
 *         // Return a value between 0 and 1
 *         return 0.5;
 *     }
 * };
 * 
 * export default myCustomScorer;
 * ```
 * 
 * === REGISTERING A CUSTOM SCORER ===
 * 
 * 1. Create your scorer file in this directory (e.g., `my-scorer.ts`)
 * 2. Export it from this index file
 * 3. Register it in `scorer-manager.ts` via `registerScorer(myScorer)`
 * 
 * === SCORER CONTEXT ===
 * 
 * The `context` parameter provides:
 * - `expandedTokens`: Query tokens after synonym expansion
 * - `aiExpanded`: Whether AI keyword expansion was used
 * 
 * === SCORING GUIDELINES ===
 * 
 * - Return values should be normalized (0-1 range works best)
 * - Weight determines how much this scorer contributes to final score
 * - Higher weights = more influence on ranking
 * - Consider performance: scorers run on every item in the index
 */

// Built-in scorers
export { default as titleScorer } from './title-scorer';
export { default as urlScorer } from './url-scorer';
export { default as recencyScorer } from './recency-scorer';
export { default as visitCountScorer } from './visitcount-scorer';
export { default as metaScorer } from './meta-scorer';
export { default as embeddingScorer } from './embedding-scorer';
export { default as aiScorer } from './ai-scorer-placeholder';

// Re-export types for plugin developers
export type { Scorer } from '../../../core/scorer-types';