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

import { Logger, errorMeta } from '../core/logger';
import { DEFAULT_GENERATION_MODEL, DEFAULT_EMBEDDING_MODEL } from '../shared/ollama-models';

const COMPONENT = 'OllamaService';
const logger = Logger.forComponent(COMPONENT);

// Hard cap on Ollama response body size to prevent a misconfigured
// or malicious endpoint from allocating multi-GB strings in memory.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

async function readResponseWithLimit(response: Response, limitBytes: number = MAX_RESPONSE_BYTES): Promise<string> {
  // Prefer streaming reader when available; falls back to .text() for
  // environments without ReadableStream (e.g. test mocks).
  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== 'function') {
    return (response as { text?: () => Promise<string> }).text
      ? response.text()
      : JSON.stringify(await (response as { json: () => Promise<unknown> }).json());
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {break;}
    total += value.byteLength;
    if (total > limitBytes) {
      reader.cancel();
      throw new Error(`Response body exceeded ${limitBytes} bytes — aborting to prevent memory exhaustion`);
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

async function readJsonWithLimit<T = unknown>(response: Response, limitBytes: number = MAX_RESPONSE_BYTES): Promise<T> {
  const text = await readResponseWithLimit(response, limitBytes);
  return JSON.parse(text) as T;
}

export interface OllamaConfig {
  endpoint: string;          // Default: 'http://localhost:11434'
  model: string;             // Default: DEFAULT_EMBEDDING_MODEL (see src/shared/ollama-models.ts)
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
  // Cache of the last fully-formed OllamaStatus (positive AND negative) so
  // back-to-back calls within CHECK_INTERVAL reuse it without re-hitting the
  // network. Previously we only cached positive results, which caused
  // `generateEmbedding` to spam the `/api/tags` endpoint — and the attendant
  // "Model '...' not found" INFO log — on every single call when Ollama was
  // down or the configured model was missing.
  private lastStatus: OllamaStatus | null = null;
  // Last availability status we logged at INFO level. Used to emit a single
  // INFO line per *transition* instead of one per check, keeping the console
  // readable when Ollama or the model stays in the same state for a while.
  private lastLoggedStatusKey: string | null = null;
  private readonly CHECK_INTERVAL = 30000; // Re-check availability every 30s

  constructor(config?: Partial<OllamaConfig>) {
    this.config = {
      endpoint: config?.endpoint || 'http://localhost:11434',
      model: config?.model || DEFAULT_EMBEDDING_MODEL,
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

    // Cache both positive AND negative results for CHECK_INTERVAL. Returning
    // the cached negative status avoids hammering `/api/tags` — and spamming
    // logs — when Ollama is down or the configured model is missing.
    if (this.lastStatus && now - this.lastCheckTime < this.CHECK_INTERVAL) {
      logger.trace('checkAvailability', 'Using cached availability (still valid)', {
        cacheAge: now - this.lastCheckTime,
        cacheInterval: this.CHECK_INTERVAL,
        available: this.lastStatus.available
      });
      return this.lastStatus;
    }

    logger.debug('checkAvailability', '🔍 Checking Ollama availability...', {
      endpoint: this.config.endpoint,
      targetUrl: `${this.config.endpoint}/api/tags`
    });

    const status = await this.probeOllama();
    this.isAvailable = status.available;
    this.lastCheckTime = now;
    this.lastStatus = status;
    this.maybeLogStatusTransition(status);
    return status;
  }

  /**
   * Single-shot probe of `/api/tags`. Separated from `checkAvailability` so
   * the caching and transition-logging logic in the caller stays readable.
   */
  private async probeOllama(): Promise<OllamaStatus> {
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
        const data = await readJsonWithLimit<{ models?: Array<{ name?: string }>; version?: string }>(response, MAX_RESPONSE_BYTES);
        const models = Array.isArray(data.models) ? data.models : [];
        const modelNames = models.map(m => m.name || 'unknown');
        // Compare canonicalized ids so tag-less vs `:latest`, `library/` namespace,
        // registry prefixes, casing, and whitespace all resolve to the same model.
        const targetId = canonicalizeModelId(this.config.model);
        const hasModel = targetId.length > 0 && models.some(m => canonicalizeModelId(m.name || '') === targetId);

        logger.trace('checkAvailability', '📋 Available models from Ollama', {
          models: modelNames,
          targetModel: this.config.model,
          found: hasModel
        });

        return {
          available: hasModel,
          model: hasModel ? this.config.model : null,
          version: data.version || null,
          error: hasModel ? undefined : `Model '${this.config.model}' not found. Available: ${modelNames.join(', ') || '(none)'}`
        };
      }

      logger.debug('checkAvailability', `❌ Ollama returned non-OK status: ${response.status}`);
      return {
        available: false,
        model: null,
        version: null,
        error: `Ollama responded with status ${response.status}`
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.debug('checkAvailability', '❌ Ollama connection failed', { error: errorMsg });
      return {
        available: false,
        model: null,
        version: null,
        error: errorMsg
      };
    }
  }

  /**
   * Emit an INFO log line only when the availability status *transitions*
   * (e.g. available -> unavailable, or a different error surfaces). Repeated
   * identical statuses are logged at TRACE so the console stays readable
   * when Ollama is down for an extended period.
   */
  private maybeLogStatusTransition(status: OllamaStatus): void {
    const key = status.available
      ? `ok:${this.config.model}`
      : `err:${status.error || 'unknown'}`;

    if (key === this.lastLoggedStatusKey) {
      logger.trace('checkAvailability', 'Status unchanged since last check', { key });
      return;
    }
    this.lastLoggedStatusKey = key;

    if (status.available) {
      logger.info('checkAvailability', `✅ Ollama available - model '${this.config.model}' loaded`);
    } else {
      logger.warn('checkAvailability', `❌ Ollama not available: ${status.error || 'unknown error'}`);
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
    // Conservative limit — ~2000 chars ≈ ~500 tokens, safe for models with 512-8192 token contexts.
    // Callers should use buildEmbeddingText() which already enforces this, but this is a safety net.
    const MAX_EMBEDDING_TEXT_LENGTH = 2000;
    if (text.length > MAX_EMBEDDING_TEXT_LENGTH) {
      text = text.substring(0, MAX_EMBEDDING_TEXT_LENGTH);
      logger.debug('generateEmbedding', `Truncated input to ${MAX_EMBEDDING_TEXT_LENGTH} chars`);
    }

    // === GUARD 0.5: Empty input rejection ===
    // buildEmbeddingText() returns "" for items whose title is empty and URL is
    // chrome://, about:, data:, etc. Sending those wastes a round-trip and
    // produces "0 dimensions" warnings. Refuse at the edge.
    if (!text.trim()) {
      logger.debug('generateEmbedding', 'Refusing embedding for empty/whitespace text');
      return {
        embedding: [], model: this.config.model, success: false,
        duration: 0, error: 'Empty input text',
      };
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

    // Quick availability check. `checkAvailability` already emits a single
    // INFO line per transition; logging again here would duplicate it on
    // every embedding attempt while Ollama is down.
    const status = await this.checkAvailability();
    if (!status.available) {
      requestSemaphore.release();
      logger.trace('generateEmbedding', `Cannot generate embedding: ${status.error || 'Ollama not available'}`);
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
        const errorText = await readResponseWithLimit(response, 1024 * 64).catch(() => 'No error details');

        // === Handle 400 "context length exceeded" — input problem, NOT server failure ===
        // Don't trip circuit breaker for input validation errors.
        // This happens when text exceeds the model's token context window.
        if (response.status === 400 && (errorText.includes('context length') || errorText.includes('input length'))) {
          logger.warn('generateEmbedding',
            `⚠️ Input too long for model context window (${text.length} chars). ` +
            'Text was already truncated — model may have a very small context. ' +
            'Consider using a model with larger context (e.g., nomic-embed-text:latest).');

          // Graceful failure — do NOT count toward circuit breaker
          requestSemaphore.release();
          return {
            embedding: [], model: this.config.model, success: false,
            duration: Date.now() - startTime,
            error: `Input too long for model context (${text.length} chars)`
          };
        }

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
      const data = await readJsonWithLimit<{ embeddings?: number[][] }>(response);
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

      if (embedding.length === 0) {
        logger.warn('generateEmbedding',
          `Embedding response contained 0 dimensions in ${duration}ms — model may not support this input`);
        return {
          embedding,
          model: this.config.model,
          success: false,
          duration,
          error: 'Embedding response contained 0 dimensions'
        };
      }

      logger.debug('generateEmbedding', `Embedding generated in ${duration}ms (${embedding.length} dimensions)`);
      logger.debug('generateEmbedding', '📈 Embedding stats', {
        dimensions: embedding.length,
        durationMs: duration,
        bytesProcessed: text.length,
        throughput: `${(text.length / duration * 1000).toFixed(0)} chars/sec`
      });

      circuitBreaker.recordSuccess();
      sessionEmbeddingCount++;

      return {
        embedding,
        model: this.config.model,
        success: true,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const isAbort = errorMsg.includes('abort') || errorMsg.includes('AbortError');

      // Only count real Ollama failures toward circuit breaker — NOT search-cancelled aborts
      if (!isAbort) {
        circuitBreaker.recordFailure();
      }

      if (isAbort) {
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
          isAbort,
          durationMs: duration,
          configuredTimeout: this.config.timeout
        });
      }
      logger.warn('generateEmbedding', `❌ Embedding failed after ${duration}ms: ${errorMsg}`);

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
    this.lastStatus = null; // Discard cached status — model/endpoint may have changed
    this.lastLoggedStatusKey = null; // Next check logs the new state at INFO
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
      logger.warn('warmup', '⚠️ Warmup error (non-critical):', errorMeta(error));
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

export function recordCircuitBreakerFailure(): void {
  circuitBreaker.recordFailure();
}

export function recordCircuitBreakerSuccess(): void {
  circuitBreaker.recordSuccess();
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
const MAX_SESSION_EMBEDDINGS = 5000; // Fallback cap when performance.memory is unavailable
let sessionEmbeddingCount = 0;
let sessionCapLogged = false;

export function checkMemoryPressure(): { ok: boolean; usedMB: number; limitMB: number; permanent: boolean } {
  try {
    // performance.memory is available in Chrome/Edge (non-standard but works in extensions)
    const perfMemory = (performance as any).memory;  // eslint-disable-line @typescript-eslint/no-explicit-any
    if (perfMemory) {
      const usedMB = Math.round(perfMemory.usedJSHeapSize / (1024 * 1024));
      const ok = usedMB < MEMORY_LIMIT_MB;
      if (!ok) {
        logger.warn('memoryGuard', `MEMORY PRESSURE: ${usedMB}MB used (limit: ${MEMORY_LIMIT_MB}MB)`);
      }
      return { ok, usedMB, limitMB: MEMORY_LIMIT_MB, permanent: false };
    }
  } catch { /* ignore */ }

  // Fallback: use session embedding counter when performance.memory is unavailable.
  // This is a permanent condition — the counter never decreases within a session.
  if (sessionEmbeddingCount >= MAX_SESSION_EMBEDDINGS) {
    if (!sessionCapLogged) {
      logger.warn('memoryGuard',
        `Session embedding cap reached: ${sessionEmbeddingCount}/${MAX_SESSION_EMBEDDINGS} — stopping AI operations for this session`);
      sessionCapLogged = true;
    }
    return { ok: false, usedMB: 0, limitMB: MEMORY_LIMIT_MB, permanent: true };
  }
  return { ok: true, usedMB: 0, limitMB: MEMORY_LIMIT_MB, permanent: false };
}

// Singleton instance
let ollamaService: OllamaService | null = null;

/**
 * Canonicalize an Ollama model id so two equivalent spellings compare equal.
 *
 * Ollama accepts the same model under several forms, all of which should be
 * treated as identical by the extension:
 *   - `mxbai-embed-large`              (tag-less, implicitly `:latest`)
 *   - `mxbai-embed-large:latest`       (explicit `:latest` tag)
 *   - `library/mxbai-embed-large`      (Ollama Hub `library/` namespace)
 *   - `registry.ollama.ai/.../foo`     (registry prefix)
 *   - `Mxbai-Embed-Large` / ` foo `    (casing, whitespace)
 *
 * Canonicalization steps (applied in order):
 *   1. Trim whitespace.
 *   2. Lowercase (Ollama tags are case-insensitive).
 *   3. Strip any `<host>/` registry prefix (detected via a `.` in the first
 *      segment, e.g. `registry.ollama.ai/...`).
 *   4. Strip a leading `library/` namespace (Ollama Hub's default namespace).
 *   5. Strip a trailing `:latest` tag.
 *
 * Other explicit tags (e.g. `:3b`, `:q4_K_M`) are preserved so differently-
 * tagged variants of the same model remain distinct.
 */
export function canonicalizeModelId(name: string): string {
  if (typeof name !== 'string') {return '';}
  let id = name.trim().toLowerCase();
  if (!id) {return '';}

  // Strip a registry prefix (first path segment contains a `.` — i.e. a host).
  const firstSlash = id.indexOf('/');
  if (firstSlash > 0) {
    const firstSegment = id.slice(0, firstSlash);
    if (firstSegment.includes('.')) {
      id = id.slice(firstSlash + 1);
    }
  }

  // Strip the default `library/` namespace.
  if (id.startsWith('library/')) {
    id = id.slice('library/'.length);
  }

  // `:latest` is implicit; drop it so tag-less and tagged-latest forms match.
  id = id.replace(/:latest$/, '');

  return id;
}

/**
 * Back-compat alias kept for consumers that imported the previous name.
 * @deprecated Use `canonicalizeModelId` — covers more edge cases.
 */
export function normalizeModelName(name: string): string {
  return canonicalizeModelId(name);
}

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

    try {
      const host = new URL(endpoint).hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
        logger.warn('getOllamaConfigFromSettings', `⚠️ Ollama endpoint "${host}" is not localhost — search queries will be sent to a remote host`);
      }
    } catch { /* invalid URL handled downstream */ }

    const rawModel = forEmbeddings
      ? (SettingsManager.getSetting('embeddingModel') || DEFAULT_EMBEDDING_MODEL)
      : (SettingsManager.getSetting('ollamaModel') || DEFAULT_GENERATION_MODEL);
    const model = canonicalizeModelId(rawModel);

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
