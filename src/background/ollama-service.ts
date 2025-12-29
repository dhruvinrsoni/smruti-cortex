/**
 * Ollama Service - Local AI embedding generation
 * 
 * Connects to local Ollama instance for privacy-first AI-powered search.
 * All processing happens on-device, no external API calls.
 */

import { Logger } from '../core/logger';

const COMPONENT = 'OllamaService';

export interface OllamaConfig {
  endpoint: string;          // Default: 'http://localhost:11434'
  model: string;             // Default: 'embeddinggemma:300m'
  timeout: number;           // Max time for embedding generation (ms)
  maxRetries: number;        // Retry attempts on failure
}

export interface EmbeddingResponse {
  embedding: number[];       // Vector representation of text
  model: string;            // Model used
  success: boolean;
  duration: number;         // Time taken in ms
  error?: string;
}

export interface OllamaStatus {
  available: boolean;        // Is Ollama reachable?
  model: string | null;     // Currently loaded model
  version: string | null;   // Ollama version
  error?: string;
}

/**
 * Ollama Service for local AI embeddings
 */
export class OllamaService {
  private config: OllamaConfig;
  private isAvailable: boolean = false;
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 30000; // Re-check availability every 30s

  constructor(config?: Partial<OllamaConfig>) {
    this.config = {
      endpoint: config?.endpoint || 'http://localhost:11434',
      model: config?.model || 'embeddinggemma:300m',
      timeout: config?.timeout || 2000,     // 2s max
      maxRetries: config?.maxRetries || 1
    };

    Logger.info(COMPONENT, 'constructor', `Initialized with model: ${this.config.model}`);
  }

  /**
   * Check if Ollama is running and accessible
   */
  async checkAvailability(): Promise<OllamaStatus> {
    const now = Date.now();
    
    // Use cached result if recent
    if (now - this.lastCheckTime < this.CHECK_INTERVAL && this.isAvailable) {
      Logger.debug(COMPONENT, 'checkAvailability', 'Using cached availability (still valid)');
      return {
        available: true,
        model: this.config.model,
        version: null
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout for health check

      const response = await fetch(`${this.config.endpoint}/api/tags`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        const hasModel = models.some((m: any) => m.name === this.config.model);

        this.isAvailable = hasModel;
        this.lastCheckTime = now;

        if (hasModel) {
          Logger.info(COMPONENT, 'checkAvailability', `✅ Ollama available - model '${this.config.model}' loaded`);
        } else {
          Logger.info(COMPONENT, 'checkAvailability', `❌ Model '${this.config.model}' not found. Available: ${models.map((m: any) => m.name).join(', ')}`);
        }

        return {
          available: hasModel,
          model: hasModel ? this.config.model : null,
          version: data.version || null,
          error: hasModel ? undefined : `Model ${this.config.model} not found`
        };
      }

      this.isAvailable = false;
      return {
        available: false,
        model: null,
        version: null,
        error: `Ollama responded with status ${response.status}`
      };

    } catch (error) {
      this.isAvailable = false;
      this.lastCheckTime = now;
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.info(COMPONENT, 'checkAvailability', `❌ Ollama not available: ${errorMsg}`);

      return {
        available: false,
        model: null,
        version: null,
        error: errorMsg
      };
    }
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    // Quick availability check
    const status = await this.checkAvailability();
    if (!status.available) {
      Logger.info(COMPONENT, 'generateEmbedding', `❌ Cannot generate embedding: ${status.error || 'Ollama not available'}`);
      return {
        embedding: [],
        model: this.config.model,
        success: false,
        duration: Date.now() - startTime,
        error: status.error || 'Ollama not available'
      };
    }

    // Generate embedding
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(`${this.config.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: text
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      Logger.info(COMPONENT, 'generateEmbedding', `✅ Embedding generated in ${duration}ms (${data.embedding?.length || 0} dimensions)`);

      return {
        embedding: data.embedding || [],
        model: this.config.model,
        success: true,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      Logger.info(COMPONENT, 'generateEmbedding', `❌ Embedding failed after ${duration}ms: ${errorMsg}`);

      return {
        embedding: [],
        model: this.config.model,
        success: false,
        duration,
        error: errorMsg
      };
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
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

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get current configuration
   */
  getConfig(): OllamaConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...config };
    this.lastCheckTime = 0; // Force re-check
    Logger.info(COMPONENT, 'updateConfig', 'Config updated', { config });
  }
}

// Singleton instance
let ollamaService: OllamaService | null = null;

/**
 * Get or create Ollama service instance
 */
export function getOllamaService(config?: Partial<OllamaConfig>): OllamaService {
  if (!ollamaService || config) {
    Logger.info(COMPONENT, 'getOllamaService', 'Initializing Ollama service', {
      endpoint: config?.endpoint || 'http://localhost:11434',
      model: config?.model || 'embeddinggemma:300m',
      timeout: config?.timeout || 2000
    });
    ollamaService = new OllamaService(config);
  }
  return ollamaService;
}
