/**
 * Port for Ollama AI service interactions (embeddings + availability).
 * Production adapter: OllamaService from ollama-service.ts.
 * Test adapter: fake that returns deterministic embeddings.
 */
export interface IOllamaPort {
  checkAvailability(): Promise<OllamaStatusInfo>;
  generateEmbedding(text: string, abortSignal?: AbortSignal): Promise<OllamaEmbeddingResult>;
  warmup(): Promise<boolean>;
  getConfig(): OllamaPortConfig;
  updateConfig(partial: Partial<OllamaPortConfig>): void;
}

export interface OllamaPortConfig {
  endpoint: string;
  model: string;
  dimensions: number;
  maxRetries: number;
  timeoutMs: number;
}

export interface OllamaStatusInfo {
  available: boolean;
  models?: string[];
  error?: string;
}

export interface OllamaEmbeddingResult {
  embedding: number[] | null;
  cached?: boolean;
}
