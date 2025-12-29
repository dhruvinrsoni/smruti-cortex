/**
 * Embedding Scorer - AI-powered semantic search using local Ollama
 * 
 * Note: This scorer returns 0 for now as embeddings require async generation.
 * Full implementation requires pre-generating embeddings during indexing.
 * 
 * TODO: Implement async embedding generation in search-engine.ts
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
  weight: 0, // Disabled until async scoring implemented

  score: (_item, _query, _allItems) => {
    // Embeddings require async operations
    // Return 0 until we implement async scoring in search-engine.ts
    Logger.trace(COMPONENT, 'score', 'Embedding scorer not yet implemented (requires async)');
    return 0;
  }
};

export default embeddingScorer;
