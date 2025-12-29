/**
 * Embedding Scorer - AI-powered semantic search using local Ollama
 * 
 * ⚠️ STATUS: NOT IMPLEMENTED (Placeholder only)
 * 
 * Weight is DYNAMIC (controlled by scorer-manager.ts):
 * - ollamaEnabled=true → weight=0.4 (high priority for AI matches)
 * - ollamaEnabled=false → weight=0 (disabled)
 * 
 * Current state:
 * - Always returns 0 (no Ollama calls yet)
 * - No embeddings generated or compared
 * - Acts as placeholder for future implementation
 * 
 * What needs to be done:
 * 1. Generate embeddings during indexing (store in IndexedDB)
 * 2. Generate query embedding at search time (async Ollama call)
 * 3. Calculate cosine similarity between query and stored embeddings
 * 4. Return similarity score (0-1)
 * 5. Add logging: "🤖 AI scoring: similarity=0.85 for 'page title'"
 * 
 * Why your "war" search didn't find "fight":
 * - Keyword search only matches exact text
 * - Semantic AI (war≈fight≈conflict) is NOT running yet
 * - This scorer is a placeholder returning 0
 */

import { Scorer } from '../../../core/scorer-types';
import { Logger } from '../../../core/logger';

const COMPONENT = 'EmbeddingScorer';

/**
 * Embedding-based scorer using local Ollama
 * 
 * Currently disabled as scorer interface is synchronous.
 * Will be enabled when async scoring is implemented in search engine.
 */
const embeddingScorer: Scorer = {
  name: 'embedding',
  weight: 0.4, // Base weight (dynamically set to 0 by scorer-manager if AI disabled)

  score: (_item, _query, _allItems) => {
    // When AI is implemented, this will log:
    // Logger.info(COMPONENT, `🤖 AI match: similarity=${similarity.toFixed(2)} | item="${item.title}"`);
    // 
    // For now: returns 0, no Ollama calls, pure keyword search
    return 0;
  }
};

export default embeddingScorer;
