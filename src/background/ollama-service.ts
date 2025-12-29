/**
 * Ollama Service - Local AI embedding generation
 * 
 * Connects to local Ollama instance for privacy-first AI-powered search.
 * All processing happens on-device, no external API calls.
 * 
 * === PRIVACY & TRANSPARENCY ===
 * This module is extensively logged at DEBUG/TRACE levels to ensure
 * full transparency about what data is sent to Ollama (local only).
 * - DEBUG: High-level operations (API calls, timings)
 * - TRACE: Detailed data flow (exact payloads, response parsing)
 */

import { Logger } from '../core/logger';

const COMPONENT = 'OllamaService';
const logger = Logger.forComponent(COMPONENT);

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

    logger.info('constructor', `Initialized with model: ${this.config.model}`);
    logger.debug('constructor', '🔧 Full config', {
      endpoint: this.config.endpoint,
      model: this.config.model,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries
    });
  }

  /**
   * Check if Ollama is running and accessible
   */
  async checkAvailability(): Promise<OllamaStatus> {
    const now = Date.now();
    
    // Use cached result if recent
    if (now - this.lastCheckTime < this.CHECK_INTERVAL && this.isAvailable) {
      logger.trace('checkAvailability', 'Using cached availability (still valid)', {
        cacheAge: now - this.lastCheckTime,
        cacheInterval: this.CHECK_INTERVAL
      });
      return {
        available: true,
        model: this.config.model,
        version: null
      };
    }

    logger.debug('checkAvailability', '🔍 Checking Ollama availability...', {
      endpoint: this.config.endpoint,
      targetUrl: `${this.config.endpoint}/api/tags`
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout for health check

      logger.trace('checkAvailability', '📡 Sending request to /api/tags');
      const response = await fetch(`${this.config.endpoint}/api/tags`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      logger.trace('checkAvailability', `Response received: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        const modelNames = models.map((m: any) => m.name);
        const hasModel = models.some((m: any) => m.name === this.config.model);

        this.isAvailable = hasModel;
        this.lastCheckTime = now;

        logger.trace('checkAvailability', '📋 Available models from Ollama', { 
          models: modelNames,
          targetModel: this.config.model,
          found: hasModel
        });

        if (hasModel) {
          logger.info('checkAvailability', `✅ Ollama available - model '${this.config.model}' loaded`);
        } else {
          logger.info('checkAvailability', `❌ Model '${this.config.model}' not found. Available: ${modelNames.join(', ')}`);
        }

        return {
          available: hasModel,
          model: hasModel ? this.config.model : null,
          version: data.version || null,
          error: hasModel ? undefined : `Model ${this.config.model} not found`
        };
      }

      this.isAvailable = false;
      logger.debug('checkAvailability', `❌ Ollama returned non-OK status: ${response.status}`);
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
      logger.debug('checkAvailability', `❌ Ollama connection failed`, { error: errorMsg });
      logger.info('checkAvailability', `❌ Ollama not available: ${errorMsg}`);

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
   * 
   * PRIVACY NOTE: Text is sent ONLY to local Ollama (localhost).
   * No external network calls. All processing is on-device.
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    const textPreview = text.length > 100 ? text.substring(0, 100) + '...' : text;

    logger.debug('generateEmbedding', '🤖 Starting embedding generation', {
      textLength: text.length,
      textPreview: textPreview,
      model: this.config.model
    });

    // Quick availability check
    const status = await this.checkAvailability();
    if (!status.available) {
      logger.info('generateEmbedding', `❌ Cannot generate embedding: ${status.error || 'Ollama not available'}`);
      return {
        embedding: [],
        model: this.config.model,
        success: false,
        duration: Date.now() - startTime,
        error: status.error || 'Ollama not available'
      };
    }

    // Generate embedding using Ollama's /api/embed endpoint
    // API: POST /api/embed { model: string, input: string } -> { embeddings: number[][] }
    const requestUrl = `${this.config.endpoint}/api/embed`;
    const requestBody = {
      model: this.config.model,
      input: text  // Use 'input' not 'prompt' for /api/embed
    };

    logger.trace('generateEmbedding', '📡 Sending embedding request to Ollama', {
      url: requestUrl,
      method: 'POST',
      timeout: this.config.timeout,
      bodySize: JSON.stringify(requestBody).length,
      // PRIVACY: Log that we're sending text to LOCAL Ollama only
      destination: 'localhost (on-device processing)'
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      logger.trace('generateEmbedding', `Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        logger.debug('generateEmbedding', '❌ Ollama API returned error', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const duration = Date.now() - startTime;

      // /api/embed returns { embeddings: number[][] } - take first embedding
      const embedding = data.embeddings?.[0] || [];
      
      logger.trace('generateEmbedding', '📊 Raw response parsed', {
        hasEmbeddings: !!data.embeddings,
        embeddingsCount: data.embeddings?.length || 0,
        firstEmbeddingLength: embedding.length,
        // Show first 5 values as sample for debugging
        embeddingSample: embedding.slice(0, 5)
      });

      logger.info('generateEmbedding', `✅ Embedding generated in ${duration}ms (${embedding.length} dimensions)`);
      logger.debug('generateEmbedding', '📈 Embedding stats', {
        dimensions: embedding.length,
        durationMs: duration,
        bytesProcessed: text.length,
        throughput: `${(text.length / duration * 1000).toFixed(0)} chars/sec`
      });

      return {
        embedding,  // Use the extracted embedding, not data.embedding
        model: this.config.model,
        success: true,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMsg.includes('abort');
      
      logger.debug('generateEmbedding', '❌ Embedding generation failed', {
        error: errorMsg,
        isTimeout,
        durationMs: duration,
        configuredTimeout: this.config.timeout
      });
      logger.info('generateEmbedding', `❌ Embedding failed after ${duration}ms: ${errorMsg}`);

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
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };
    this.lastCheckTime = 0; // Force re-check
    logger.info('updateConfig', '🔧 Config updated');
    logger.debug('updateConfig', 'Config change details', {
      before: oldConfig,
      after: this.config,
      changed: config
    });
  }
}

// Singleton instance
let ollamaService: OllamaService | null = null;

/**
 * Get or create Ollama service instance
 */
export function getOllamaService(config?: Partial<OllamaConfig>): OllamaService {
  if (!ollamaService || config) {
    logger.info('getOllamaService', '🚀 Initializing Ollama service', {
      endpoint: config?.endpoint || 'http://localhost:11434',
      model: config?.model || 'embeddinggemma:300m',
      timeout: config?.timeout || 2000
    });
    logger.debug('getOllamaService', '📋 Full initialization config', {
      providedConfig: config,
      defaults: {
        endpoint: 'http://localhost:11434',
        model: 'embeddinggemma:300m',
        timeout: 2000,
        maxRetries: 1
      },
      // PRIVACY: Emphasize local-only processing
      privacyNote: 'All AI processing is LOCAL via Ollama - no cloud calls'
    });
    ollamaService = new OllamaService(config);
  } else {
    logger.trace('getOllamaService', 'Returning existing service instance');
  }
  return ollamaService;
}
