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
  model: string;             // Default: 'nomic-embed-text:latest'
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
      model: config?.model || 'nomic-embed-text:latest',
      timeout: config?.timeout || 10000,    // 10s max (first request needs time for model loading)
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
      const models = Array.isArray(data.models) ? data.models as Array<{ name?: string }> : [];
      const modelNames = models.map(m => m.name || 'unknown');
      const hasModel = models.some(m => m.name === this.config.model);

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
      logger.debug('checkAvailability', '❌ Ollama connection failed', { error: errorMsg });
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
  async generateEmbedding(text: string, abortSignal?: AbortSignal): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    // === GUARD 0: Input length validation ===
    const MAX_EMBEDDING_TEXT_LENGTH = 8192;
    if (text.length > MAX_EMBEDDING_TEXT_LENGTH) {
      text = text.substring(0, MAX_EMBEDDING_TEXT_LENGTH);
      logger.debug('generateEmbedding', `Truncated input to ${MAX_EMBEDDING_TEXT_LENGTH} chars`);
    }

    const textPreview = text.length > 100 ? text.substring(0, 100) + '...' : text;

    // === GUARD 1: Circuit breaker ===
    if (circuitBreaker.isOpen()) {
      return {
        embedding: [], model: this.config.model, success: false,
        duration: 0, error: 'Circuit breaker open — too many recent failures'
      };
    }

    // === GUARD 2: Memory pressure ===
    const mem = checkMemoryPressure();
    if (!mem.ok) {
      return {
        embedding: [], model: this.config.model, success: false,
        duration: 0, error: `Memory pressure: ${mem.usedMB}MB used (limit: ${mem.limitMB}MB)`
      };
    }

    // === GUARD 3: Concurrent request limiter ===
    if (!requestSemaphore.acquire()) {
      return {
        embedding: [], model: this.config.model, success: false,
        duration: 0, error: 'Another Ollama request in progress — try again shortly'
      };
    }

    // === GUARD 4: Already aborted ===
    if (abortSignal?.aborted) {
      requestSemaphore.release();
      return {
        embedding: [], model: this.config.model, success: false,
        duration: 0, error: 'Aborted before start'
      };
    }

    logger.debug('generateEmbedding', '🤖 Starting embedding generation', {
      textLength: text.length,
      textPreview: textPreview,
      model: this.config.model
    });

    // Quick availability check
    const status = await this.checkAvailability();
    if (!status.available) {
      requestSemaphore.release();
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

      // Support infinite timeout: -1 or 0 = no timeout, positive = timeout value
      // GUARDRAIL: Even "infinite" is capped at 120s to prevent permanent hangs
      const effectiveTimeout = this.config.timeout <= 0 ? 120_000 : this.config.timeout;
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      // If caller provided an abort signal, forward it to our controller
      if (abortSignal) {
        if (abortSignal.aborted) {
          clearTimeout(timeoutId);
          controller.abort();
        } else {
          abortSignal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            controller.abort();
          }, { once: true });
        }
      }

      const timeoutDisplay = this.config.timeout <= 0 ? `capped at ${effectiveTimeout}ms` : `${effectiveTimeout}ms`;
      logger.debug('generateEmbedding', `⏱️ Sending POST request (timeout: ${timeoutDisplay})...`);
      const fetchStartTime = Date.now();

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const fetchDuration = Date.now() - fetchStartTime;

      logger.debug('generateEmbedding', `📨 Response received in ${fetchDuration}ms: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        
        // Provide helpful error message for common issues
        const errorMsg = `Ollama API error: ${response.status} ${response.statusText}`;
        let helpText = '';
        
        if (response.status === 403) {
          // CORS issue - Ollama is blocking the extension origin
          helpText = 'CORS blocked. Set OLLAMA_ORIGINS=* environment variable and restart Ollama.';
          logger.warn('generateEmbedding', '🔒 CORS BLOCKED: Ollama is rejecting requests from Chrome extensions');
          logger.info('generateEmbedding', '💡 FIX: Set environment variable OLLAMA_ORIGINS=* and restart Ollama');
          logger.debug('generateEmbedding', '📖 Instructions:', {
            windows: 'setx OLLAMA_ORIGINS "*" then restart Ollama',
            linux: 'export OLLAMA_ORIGINS="*" or add to ~/.bashrc',
            mac: 'launchctl setenv OLLAMA_ORIGINS "*" or add to ~/.zshrc',
            docker: 'docker run -e OLLAMA_ORIGINS="*" ...'
          });
        }
        
        logger.debug('generateEmbedding', '❌ Ollama API returned error', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          helpText
        });
        
        throw new Error(helpText ? `${errorMsg} - ${helpText}` : `${errorMsg} - ${errorText}`);
      }

      logger.debug('generateEmbedding', '📄 Parsing JSON response...');
      const parseStartTime = Date.now();
      const data = await response.json();
      const parseDuration = Date.now() - parseStartTime;
      const duration = Date.now() - startTime;

      logger.debug('generateEmbedding', `✅ JSON parsed in ${parseDuration}ms`);

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

      circuitBreaker.recordSuccess();

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

      circuitBreaker.recordFailure();
      
      if (isTimeout) {
        logger.warn('generateEmbedding', `⏱️ REQUEST TIMEOUT after ${duration}ms (limit: ${this.config.timeout}ms)`);
        logger.info('generateEmbedding', '💡 First embedding may take 5-10s for model loading. Try increasing timeout in settings.');
        logger.debug('generateEmbedding', 'Timeout details', {
          durationMs: duration,
          configuredTimeout: this.config.timeout,
          suggestion: 'Increase ollamaTimeout in settings to 10000ms or higher'
        });
      } else {
        logger.debug('generateEmbedding', '❌ Embedding generation failed', {
          error: errorMsg,
          isTimeout,
          durationMs: duration,
          configuredTimeout: this.config.timeout
        });
      }
      logger.info('generateEmbedding', `❌ Embedding failed after ${duration}ms: ${errorMsg}`);

      return {
        embedding: [],
        model: this.config.model,
        success: false,
        duration,
        error: errorMsg
      };
    } finally {
      requestSemaphore.release();
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

  /**
   * Warm up the model by generating a dummy embedding
   * This preloads the model into memory to reduce first-request latency
   */
  async warmup(): Promise<boolean> {
    logger.info('warmup', '🔥 Warming up Ollama model...');
    
    try {
      const startTime = performance.now();
      
      // Generate a test embedding for a simple phrase
      const result = await this.generateEmbedding('test');
      
      if (result.success) {
        const warmupTime = performance.now() - startTime;
        logger.info('warmup', `✅ Model warmed up successfully in ${warmupTime.toFixed(0)}ms`);
        this.isAvailable = true;
        return true;
      } else {
        logger.warn('warmup', '⚠️ Warmup failed - model may not be available');
        return false;
      }
    } catch (error) {
      logger.warn('warmup', '⚠️ Warmup error (non-critical):', error);
      return false;
    }
  }
}

// === CIRCUIT BREAKER ===
// Prevents hammering Ollama when it's down or misconfigured
const circuitBreaker = {
  failures: 0,
  maxFailures: 3,           // Trip after 3 consecutive failures
  cooldownMs: 60_000,       // 1 minute cooldown before retrying
  lastFailureTime: 0,
  tripped: false,

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.maxFailures) {
      this.tripped = true;
      logger.warn('circuitBreaker', `🔴 Circuit breaker TRIPPED after ${this.failures} consecutive failures. Cooldown: ${this.cooldownMs / 1000}s`);
    }
  },

  recordSuccess(): void {
    if (this.failures > 0) {
      logger.info('circuitBreaker', `🟢 Circuit breaker reset (was at ${this.failures} failures)`);
    }
    this.failures = 0;
    this.tripped = false;
  },

  isOpen(): boolean {
    if (!this.tripped) { return false; }
    // Check if cooldown has elapsed
    if (Date.now() - this.lastFailureTime > this.cooldownMs) {
      logger.info('circuitBreaker', '🟡 Circuit breaker cooldown elapsed, allowing retry');
      this.tripped = false;
      this.failures = 0;
      return false;
    }
    return true;
  }
};

export function isCircuitBreakerOpen(): boolean {
  return circuitBreaker.isOpen();
}

// === CONCURRENT REQUEST LIMITER ===
// Ollama processes requests sequentially; concurrent calls just queue and waste memory.
// This semaphore prevents multiple in-flight Ollama calls from stacking up.
const requestSemaphore = {
  active: 0,
  maxConcurrent: 1,

  acquire(): boolean {
    if (this.active >= this.maxConcurrent) {
      logger.debug('requestSemaphore', `🔒 Request rejected: ${this.active}/${this.maxConcurrent} slots in use`);
      return false;
    }
    this.active++;
    return true;
  },

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
};

export function acquireOllamaSlot(): boolean { return requestSemaphore.acquire(); }
export function releaseOllamaSlot(): void { requestSemaphore.release(); }

// === MEMORY PRESSURE GUARD ===
// Chrome extensions have limited memory; prevent embedding generation from consuming it all
const MEMORY_LIMIT_MB = 512;  // Hard cap: stop AI features if extension exceeds 512MB

export function checkMemoryPressure(): { ok: boolean; usedMB: number; limitMB: number } {
  try {
    // performance.memory is available in Chrome/Edge (non-standard but works in extensions)
    const perfMemory = (performance as any).memory;  // eslint-disable-line @typescript-eslint/no-explicit-any
    if (perfMemory) {
      const usedMB = Math.round(perfMemory.usedJSHeapSize / (1024 * 1024));
      const ok = usedMB < MEMORY_LIMIT_MB;
      if (!ok) {
        logger.warn('memoryGuard', `🔴 MEMORY PRESSURE: ${usedMB}MB used (limit: ${MEMORY_LIMIT_MB}MB) — blocking AI operations`);
      }
      return { ok, usedMB, limitMB: MEMORY_LIMIT_MB };
    }
  } catch { /* ignore */ }
  return { ok: true, usedMB: 0, limitMB: MEMORY_LIMIT_MB };
}

// Singleton instance
let ollamaService: OllamaService | null = null;

/**
 * Build OllamaConfig from SettingsManager (reads user's actual settings)
 * This ensures the service always uses the user's configured model, endpoint, and timeout.
 */
export async function getOllamaConfigFromSettings(forEmbeddings = false): Promise<Partial<OllamaConfig>> {
  try {
    // Lazy dynamic import to avoid circular dependency at module load time
    const { SettingsManager } = await import('../core/settings');

    const endpoint = SettingsManager.getSetting('ollamaEndpoint') || 'http://localhost:11434';
    const timeout = SettingsManager.getSetting('ollamaTimeout') ?? 30000;

    // Use the correct model based on purpose:
    // - forEmbeddings=true → use embeddingModel (nomic-embed-text, all-minilm, etc.)
    // - forEmbeddings=false → use ollamaModel (llama3.2:1b, etc. for text generation)
    const model = forEmbeddings
      ? (SettingsManager.getSetting('embeddingModel') || 'nomic-embed-text:latest')
      : (SettingsManager.getSetting('ollamaModel') || 'llama3.2:1b');

    return { endpoint, model, timeout, maxRetries: 1 };
  } catch {
    logger.debug('getOllamaConfigFromSettings', 'SettingsManager not available, using defaults');
    return {};
  }
}

/**
 * Get or create Ollama service instance
 * Always updates config if provided (no recreation needed - fixes settings not updating bug)
 */
export function getOllamaService(config?: Partial<OllamaConfig>): OllamaService {
  // Create if doesn't exist
  if (!ollamaService) {
    logger.info('getOllamaService', '🚀 Creating NEW Ollama service instance');
    logger.debug('getOllamaService', '📋 Initial config', config || {});
    ollamaService = new OllamaService(config);
    return ollamaService;
  }

  // Update existing instance only when config actually changed (CRITICAL: allows settings changes to take effect)
  if (config) {
    const current = ollamaService.getConfig();
    const hasChange = (Object.keys(config) as Array<keyof OllamaConfig>).some(
      key => config[key] !== current[key]
    );
    if (hasChange) {
      logger.debug('getOllamaService', '🔄 Config changed — updating service', {
        oldTimeout: current.timeout,
        newTimeout: config.timeout
      });
      ollamaService.updateConfig(config);
    } else {
      logger.trace('getOllamaService', 'Config unchanged, skipping update');
    }
  } else {
    logger.trace('getOllamaService', 'Returning existing service instance (no config update)');
  }

  return ollamaService;
}
