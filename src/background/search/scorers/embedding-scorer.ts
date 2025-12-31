/**
 * Embedding Scorer - AI-powered semantic search using local Ollama
 * 
 * ✅ STATUS: BASIC IMPLEMENTATION (On-demand embeddings)
 * 
 * Weight is DYNAMIC (controlled by scorer-manager.ts):
 * - ollamaEnabled=true → weight=0.4 (high priority for AI matches)
 * - ollamaEnabled=false → weight=0.0 (disabled)
 * 
 * Current approach:
 * - Query embeddings generated on-the-fly (cached for subsequent scorers)
 * - Item embeddings generated on-demand (not pre-indexed yet)
 * - Cosine similarity calculated when both embeddings available
 * - Falls back to 0 if embeddings unavailable
 * 
 * Performance notes:
 * - First search with AI: ~200-300ms (query + item embedding generation)
 * - Subsequent searches: faster (items cached with embeddings)
 * - Future optimization: pre-generate all item embeddings during indexing
 */

import { Scorer, ScorerContext } from '../../../core/scorer-types';
import { Logger } from '../../../core/logger';
import { getOllamaService } from '../../ollama-service';

const COMPONENT = 'EmbeddingScorer';

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Embedding-based scorer using local Ollama
 * 
 * Now ACTIVE when ollamaEnabled=true (weight set by scorer-manager)
 */
const embeddingScorer: Scorer = {
  name: 'embedding',
  weight: 0.4, // Base weight (dynamically set to 0 by scorer-manager if AI disabled)

  score: (item, _query, _allItems, context) => {
    // Need query embedding from context
    if (!context?.queryEmbedding || context.queryEmbedding.length === 0) {
      return 0; // No query embedding available
    }
    
    // Need item embedding
    if (!item.embedding || item.embedding.length === 0) {
      return 0; // No item embedding available
    }
    
    // Calculate cosine similarity
    const similarity = cosineSimilarity(context.queryEmbedding, item.embedding);
    
    // Log high-confidence matches only (reduce log spam)
    if (similarity > 0.6) {
      Logger.info(COMPONENT, 'score', `🤖 AI match: similarity=${similarity.toFixed(2)} | item="${item.title.substring(0, 50)}..."`);
    }
    
    return similarity;
  }
};

export default embeddingScorer;

/**
 * Generate embedding for an item on-demand
 * This will be called from search-engine.ts for items without embeddings
 */
export async function generateItemEmbedding(item: { title: string; metaDescription?: string; url: string }): Promise<number[]> {
  try {
    const ollamaService = getOllamaService();
    const text = `${item.title} ${item.metaDescription || ''} ${item.url}`.trim();
    const result = await ollamaService.generateEmbedding(text);
    
    if (result.success && result.embedding.length > 0) {
      return result.embedding;
    }
    return [];
  } catch (error) {
    Logger.debug(COMPONENT, 'generateItemEmbedding', 'Failed to generate embedding:', error);
    return [];
  }
}
