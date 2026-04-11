import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

// Mock Logger (must be before any module import that uses it)
vi.mock('../../core/logger', () => mockLogger());

const mockFetch = vi.fn();

// === Response mock helpers ===

function mockTagsOk(model = 'test:latest') {
  return { ok: true, json: async () => ({ models: [{ name: model }] }) };
}

function mockEmbedOk(embedding = [0.1, 0.2, 0.3]) {
  return { ok: true, json: async () => ({ embeddings: [embedding] }) };
}

function mockEmbed400(msg = 'the input length exceeds the context length') {
  return { ok: false, status: 400, statusText: 'Bad Request', text: async () => msg };
}

function mockEmbed500() {
  return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'Server error' };
}

describe('OllamaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // === cosineSimilarity (static, pure) ===

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical unit vectors', async () => {
      const { OllamaService } = await import('../ollama-service');
      expect(OllamaService.cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
    });

    it('should return 0 for orthogonal vectors', async () => {
      const { OllamaService } = await import('../ollama-service');
      expect(OllamaService.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it('should return -1 for opposite vectors', async () => {
      const { OllamaService } = await import('../ollama-service');
      expect(OllamaService.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it('should return 0 for empty vectors', async () => {
      const { OllamaService } = await import('../ollama-service');
      expect(OllamaService.cosineSimilarity([], [])).toBe(0);
    });

    it('should return 0 for mismatched lengths', async () => {
      const { OllamaService } = await import('../ollama-service');
      expect(OllamaService.cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    });

    it('should return 0 when one vector is all zeros', async () => {
      const { OllamaService } = await import('../ollama-service');
      expect(OllamaService.cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    });

    it('should calculate correctly for known values', async () => {
      const { OllamaService } = await import('../ollama-service');
      // cos([1,2,3], [4,5,6]) = (4+10+18) / (sqrt(14) * sqrt(77)) ≈ 0.9746
      const result = OllamaService.cosineSimilarity([1, 2, 3], [4, 5, 6]);
      expect(result).toBeCloseTo(0.9746, 3);
    });
  });

  // === generateEmbedding ===

  describe('generateEmbedding', () => {
    it('should return embedding on successful response', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbedOk([0.5, 0.6, 0.7]));

      const result = await service.generateEmbedding('hello world');
      expect(result.success).toBe(true);
      expect(result.embedding).toEqual([0.5, 0.6, 0.7]);
      expect(result.model).toBe('test:latest');
    });

    // --- Guard 0: input truncation ---

    describe('Guard 0: input truncation', () => {
      it('should truncate text longer than 2000 characters', async () => {
        const { OllamaService } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        mockFetch
          .mockResolvedValueOnce(mockTagsOk())
          .mockResolvedValueOnce(mockEmbedOk());

        await service.generateEmbedding('x'.repeat(3000));

        // The embed request body should have truncated input
        const embedCall = mockFetch.mock.calls[1];
        const body = JSON.parse(embedCall[1].body);
        expect(body.input.length).toBe(2000);
      });

      it('should not truncate text at exactly 2000 characters', async () => {
        const { OllamaService } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        mockFetch
          .mockResolvedValueOnce(mockTagsOk())
          .mockResolvedValueOnce(mockEmbedOk());

        await service.generateEmbedding('y'.repeat(2000));

        const embedCall = mockFetch.mock.calls[1];
        const body = JSON.parse(embedCall[1].body);
        expect(body.input.length).toBe(2000);
      });
    });

    // --- 400 context-length error handling ---

    describe('400 context-length error handling', () => {
      it('should return graceful failure for "context length" error', async () => {
        const { OllamaService } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        mockFetch
          .mockResolvedValueOnce(mockTagsOk())
          .mockResolvedValueOnce(mockEmbed400('the input length exceeds the context length'));

        const result = await service.generateEmbedding('test');
        expect(result.success).toBe(false);
        expect(result.embedding).toEqual([]);
        expect(result.error).toContain('Input too long for model context');
      });

      it('should return graceful failure for "input length" variant', async () => {
        const { OllamaService } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        mockFetch
          .mockResolvedValueOnce(mockTagsOk())
          .mockResolvedValueOnce(mockEmbed400('input length exceeds the maximum'));

        const result = await service.generateEmbedding('test');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Input too long for model context');
      });

      it('should NOT trip circuit breaker after 3 context-length errors', async () => {
        const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        // First call needs tags + embed, subsequent use cached availability
        mockFetch
          .mockResolvedValueOnce(mockTagsOk())
          .mockResolvedValueOnce(mockEmbed400('the input length exceeds the context length'))
          .mockResolvedValueOnce(mockEmbed400('the input length exceeds the context length'))
          .mockResolvedValueOnce(mockEmbed400('the input length exceeds the context length'));

        await service.generateEmbedding('test');
        await service.generateEmbedding('test');
        await service.generateEmbedding('test');

        // Circuit breaker should NOT be tripped — these were input errors, not server failures
        expect(isCircuitBreakerOpen()).toBe(false);
      });

      it('should still trip circuit breaker on regular 500 errors', async () => {
        const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        // First call needs tags + embed, subsequent use cached availability
        mockFetch
          .mockResolvedValueOnce(mockTagsOk())
          .mockResolvedValueOnce(mockEmbed500())
          .mockResolvedValueOnce(mockEmbed500())
          .mockResolvedValueOnce(mockEmbed500());

        await service.generateEmbedding('test');
        await service.generateEmbedding('test');
        await service.generateEmbedding('test');

        // Circuit breaker SHOULD be tripped — 3 consecutive server failures
        expect(isCircuitBreakerOpen()).toBe(true);
      });
    });

    // --- Other guards ---

    describe('other guards', () => {
      it('should fail when circuit breaker is open', async () => {
        const { OllamaService } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        // Trip circuit breaker with 3 server errors
        mockFetch
          .mockResolvedValueOnce(mockTagsOk())
          .mockResolvedValueOnce(mockEmbed500())
          .mockResolvedValueOnce(mockEmbed500())
          .mockResolvedValueOnce(mockEmbed500());

        await service.generateEmbedding('test');
        await service.generateEmbedding('test');
        await service.generateEmbedding('test');

        // Now circuit breaker is open — next call should fail immediately
        const result = await service.generateEmbedding('should be blocked');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Circuit breaker');
        // No additional fetch calls (blocked before network)
        expect(mockFetch).toHaveBeenCalledTimes(4); // 1 tags + 3 embeds
      });

      it('should fail when semaphore is already acquired', async () => {
        const { OllamaService, acquireOllamaSlot, releaseOllamaSlot } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        // Acquire the slot externally
        acquireOllamaSlot();

        const result = await service.generateEmbedding('should be blocked');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Another Ollama request in progress');

        releaseOllamaSlot();
      });

      it('should fail when abort signal is already aborted', async () => {
        const { OllamaService } = await import('../ollama-service');
        const service = new OllamaService({ model: 'test:latest' });

        const controller = new AbortController();
        controller.abort();

        const result = await service.generateEmbedding('test', controller.signal);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Aborted');
      });
    });
  });

  // === Constructor & config ===

  describe('constructor', () => {
    it('should use default config when none provided', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService();
      const config = service.getConfig();

      expect(config.endpoint).toBe('http://localhost:11434');
      expect(config.model).toBe('nomic-embed-text:latest');
      expect(config.timeout).toBe(10000);
      expect(config.maxRetries).toBe(1);
    });

    it('should merge provided config with defaults', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'custom:v1', timeout: 5000 });
      const config = service.getConfig();

      expect(config.model).toBe('custom:v1');
      expect(config.timeout).toBe(5000);
      expect(config.endpoint).toBe('http://localhost:11434'); // default
    });
  });

  // === checkAvailability ===

  describe('checkAvailability', () => {
    it('should return cached result when check is recent and available', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      // First call — real network check
      mockFetch.mockResolvedValueOnce(mockTagsOk());
      const first = await service.checkAvailability();
      expect(first.available).toBe(true);

      // Second call — should use cache (no additional fetch)
      const second = await service.checkAvailability();
      expect(second.available).toBe(true);
      expect(second.model).toBe('test:latest');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return unavailable when model is not in list', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'missing-model:latest' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'other-model:latest' }], version: '0.3.0' }),
      });

      const result = await service.checkAvailability();
      expect(result.available).toBe(false);
      expect(result.model).toBeNull();
      expect(result.error).toContain('not found');
    });

    it('should return version from response', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'test:latest' }], version: '0.3.6' }),
      });

      const result = await service.checkAvailability();
      expect(result.available).toBe(true);
      expect(result.version).toBe('0.3.6');
    });

    it('should handle non-OK response status', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await service.checkAvailability();
      expect(result.available).toBe(false);
      expect(result.error).toContain('503');
    });

    it('should handle network error (fetch throws)', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.checkAvailability();
      expect(result.available).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should handle models array with missing name fields', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ size: 123 }, { name: 'test:latest' }] }),
      });

      const result = await service.checkAvailability();
      expect(result.available).toBe(true);
    });

    it('should handle missing models field in response', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '0.3.0' }),
      });

      const result = await service.checkAvailability();
      expect(result.available).toBe(false);
    });
  });

  // === updateConfig ===

  describe('updateConfig', () => {
    it('should update config and force re-check', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'old:v1', timeout: 5000 });

      service.updateConfig({ model: 'new:v2', timeout: 15000 });

      const config = service.getConfig();
      expect(config.model).toBe('new:v2');
      expect(config.timeout).toBe(15000);
      expect(config.endpoint).toBe('http://localhost:11434'); // unchanged
    });
  });

  // === warmup ===

  describe('warmup', () => {
    it('should return true on successful warmup', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbedOk([0.1, 0.2]));

      const result = await service.warmup();
      expect(result).toBe(true);
    });

    it('should return false when embedding generation fails', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.warmup();
      expect(result).toBe(false);
    });

    it('should return false when Ollama is unavailable', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'missing:latest' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'other:latest' }] }),
      });

      const result = await service.warmup();
      expect(result).toBe(false);
    });
  });

  // === generateEmbedding — additional edge cases ===

  describe('generateEmbedding — additional edge cases', () => {
    it('should handle 403 CORS error with helpful message', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: async () => 'CORS blocked',
        });

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('CORS');
    });

    it('should handle abort signal fired mid-request', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      const controller = new AbortController();

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockImplementationOnce(() => {
          controller.abort();
          return Promise.reject(new Error('The operation was aborted'));
        });

      const result = await service.generateEmbedding('test', controller.signal);
      expect(result.success).toBe(false);
      expect(result.error).toContain('abort');
    });

    it('should NOT trip circuit breaker on abort errors', async () => {
      const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      // First call needs tags check; subsequent calls use cached availability
      mockFetch
        .mockResolvedValueOnce(mockTagsOk())  // tags for 1st call
        .mockImplementationOnce(() => Promise.reject(new Error('AbortError: aborted')))  // embed 1
        .mockImplementationOnce(() => Promise.reject(new Error('AbortError: aborted')))  // embed 2
        .mockImplementationOnce(() => Promise.reject(new Error('AbortError: aborted'))); // embed 3

      await service.generateEmbedding('test');
      await service.generateEmbedding('test');
      await service.generateEmbedding('test');

      expect(isCircuitBreakerOpen()).toBe(false);
    });

    it('should handle empty embeddings response', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ embeddings: [] }),
        });

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(true);
      expect(result.embedding).toEqual([]);
    });

    it('should handle response with no embeddings field', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(true);
      expect(result.embedding).toEqual([]);
    });

    it('should handle infinite timeout config (timeout <= 0)', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest', timeout: -1 });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbedOk([0.1]));

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(true);
    });

    it('should handle zero timeout config', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest', timeout: 0 });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbedOk([0.2]));

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(true);
    });

    it('should handle text.error() failure on non-ok response', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => { throw new Error('Read failed'); },
        });

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(false);
      // Should use fallback 'No error details'
      expect(result.error).toContain('502');
    });
  });

  // === checkMemoryPressure ===

  describe('checkMemoryPressure', () => {
    it('should return ok when performance.memory is unavailable', async () => {
      const { checkMemoryPressure } = await import('../ollama-service');

      // performance.memory is not standard in Node/Vitest, so it should fall through
      const saved = (performance as any).memory;
      delete (performance as any).memory;

      const result = checkMemoryPressure();
      expect(result.ok).toBe(true);
      expect(result.usedMB).toBe(0);
      expect(result.limitMB).toBe(512);

      // Restore
      if (saved !== undefined) {(performance as any).memory = saved;}
    });

    it('should return ok when memory usage is below limit', async () => {
      const { checkMemoryPressure } = await import('../ollama-service');

      const saved = (performance as any).memory;
      (performance as any).memory = {
        usedJSHeapSize: 100 * 1024 * 1024, // 100MB
        totalJSHeapSize: 200 * 1024 * 1024,
        jsHeapSizeLimit: 2048 * 1024 * 1024,
      };

      const result = checkMemoryPressure();
      expect(result.ok).toBe(true);
      expect(result.usedMB).toBe(100);
      expect(result.limitMB).toBe(512);

      // Restore
      if (saved !== undefined) {
        (performance as any).memory = saved;
      } else {
        delete (performance as any).memory;
      }
    });

    it('should return not ok when memory usage exceeds limit', async () => {
      const { checkMemoryPressure } = await import('../ollama-service');

      const saved = (performance as any).memory;
      (performance as any).memory = {
        usedJSHeapSize: 600 * 1024 * 1024, // 600MB — over 512MB limit
        totalJSHeapSize: 800 * 1024 * 1024,
        jsHeapSizeLimit: 2048 * 1024 * 1024,
      };

      const result = checkMemoryPressure();
      expect(result.ok).toBe(false);
      expect(result.usedMB).toBe(600);

      // Restore
      if (saved !== undefined) {
        (performance as any).memory = saved;
      } else {
        delete (performance as any).memory;
      }
    });
  });

  // === Circuit breaker edge cases ===

  describe('circuit breaker edge cases', () => {
    it('should not trip at exactly 2 failures (below threshold of 3)', async () => {
      const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbed500())
        .mockResolvedValueOnce(mockEmbed500());

      await service.generateEmbedding('test');
      await service.generateEmbedding('test');

      expect(isCircuitBreakerOpen()).toBe(false);
    });

    it('should trip at exactly 3 failures (at threshold)', async () => {
      const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbed500())
        .mockResolvedValueOnce(mockEmbed500())
        .mockResolvedValueOnce(mockEmbed500());

      await service.generateEmbedding('test');
      await service.generateEmbedding('test');
      await service.generateEmbedding('test');

      expect(isCircuitBreakerOpen()).toBe(true);
    });

    it('should reset circuit breaker after cooldown period', async () => {
      const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      // Trip the circuit breaker
      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbed500())
        .mockResolvedValueOnce(mockEmbed500())
        .mockResolvedValueOnce(mockEmbed500());

      await service.generateEmbedding('test');
      await service.generateEmbedding('test');
      await service.generateEmbedding('test');

      expect(isCircuitBreakerOpen()).toBe(true);

      // Advance time past cooldown (60s)
      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);

      expect(isCircuitBreakerOpen()).toBe(false);

      vi.useRealTimers();
    });

    it('should reset circuit breaker on a successful request after cooldown', async () => {
      // Use fake timers from the start so Date.now() is consistent
      vi.useFakeTimers();

      const { OllamaService, isCircuitBreakerOpen } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      // Trip the breaker with 3 server errors
      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbed500())
        .mockResolvedValueOnce(mockEmbed500())
        .mockResolvedValueOnce(mockEmbed500());

      await service.generateEmbedding('test');
      await service.generateEmbedding('test');
      await service.generateEmbedding('test');

      expect(isCircuitBreakerOpen()).toBe(true);

      // Advance past cooldown so circuit breaker allows retry
      vi.advanceTimersByTime(61_000);

      expect(isCircuitBreakerOpen()).toBe(false);

      // Now succeed — circuit breaker should fully reset
      // Need fresh tags check since lastCheckTime is now stale relative to faked time
      mockFetch
        .mockResolvedValueOnce(mockTagsOk())
        .mockResolvedValueOnce(mockEmbedOk([0.1]));

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(true);
      expect(isCircuitBreakerOpen()).toBe(false);

      vi.useRealTimers();
    });
  });

  // === acquireOllamaSlot / releaseOllamaSlot ===

  describe('acquireOllamaSlot / releaseOllamaSlot', () => {
    it('should allow acquiring a slot when none is held', async () => {
      const { acquireOllamaSlot, releaseOllamaSlot } = await import('../ollama-service');
      // Ensure clean state
      releaseOllamaSlot();

      const acquired = acquireOllamaSlot();
      expect(acquired).toBe(true);

      // Cleanup
      releaseOllamaSlot();
    });

    it('should reject second concurrent acquisition', async () => {
      const { acquireOllamaSlot, releaseOllamaSlot } = await import('../ollama-service');
      releaseOllamaSlot();

      const first = acquireOllamaSlot();
      expect(first).toBe(true);

      const second = acquireOllamaSlot();
      expect(second).toBe(false);

      // Cleanup
      releaseOllamaSlot();
    });

    it('should allow re-acquisition after release', async () => {
      const { acquireOllamaSlot, releaseOllamaSlot } = await import('../ollama-service');
      releaseOllamaSlot();

      acquireOllamaSlot();
      releaseOllamaSlot();

      const reacquired = acquireOllamaSlot();
      expect(reacquired).toBe(true);

      releaseOllamaSlot();
    });

    it('should not go below zero on extra releases', async () => {
      const { acquireOllamaSlot, releaseOllamaSlot } = await import('../ollama-service');
      // Multiple releases should not cause negative count
      releaseOllamaSlot();
      releaseOllamaSlot();
      releaseOllamaSlot();

      // Should still be able to acquire
      const acquired = acquireOllamaSlot();
      expect(acquired).toBe(true);

      releaseOllamaSlot();
    });
  });

  // === getOllamaConfigFromSettings ===

  describe('getOllamaConfigFromSettings', () => {
    it('should return embedding model when forEmbeddings is true', async () => {
      // Mock the settings module
      vi.doMock('../../core/settings', () => ({
        SettingsManager: {
          getSetting: (key: string) => {
            const map: Record<string, any> = {
              ollamaEndpoint: 'http://myhost:11434',
              ollamaTimeout: 20000,
              embeddingModel: 'nomic-embed-text:latest',
              ollamaModel: 'llama3.2:1b',
            };
            return map[key];
          },
        },
      }));

      const { getOllamaConfigFromSettings } = await import('../ollama-service');
      const config = await getOllamaConfigFromSettings(true);

      expect(config.model).toBe('nomic-embed-text:latest');
      expect(config.endpoint).toBe('http://myhost:11434');
      expect(config.timeout).toBe(20000);
    });

    it('should return generation model when forEmbeddings is false', async () => {
      vi.doMock('../../core/settings', () => ({
        SettingsManager: {
          getSetting: (key: string) => {
            const map: Record<string, any> = {
              ollamaEndpoint: 'http://localhost:11434',
              ollamaTimeout: 30000,
              embeddingModel: 'nomic-embed-text:latest',
              ollamaModel: 'llama3.2:1b',
            };
            return map[key];
          },
        },
      }));

      const { getOllamaConfigFromSettings } = await import('../ollama-service');
      const config = await getOllamaConfigFromSettings(false);

      expect(config.model).toBe('llama3.2:1b');
    });

    it('should use default generation model when forEmbeddings is omitted', async () => {
      vi.doMock('../../core/settings', () => ({
        SettingsManager: {
          getSetting: (key: string) => {
            const map: Record<string, any> = {
              ollamaEndpoint: 'http://localhost:11434',
              ollamaTimeout: 30000,
              embeddingModel: '',
              ollamaModel: '',
            };
            return map[key];
          },
        },
      }));

      const { getOllamaConfigFromSettings } = await import('../ollama-service');
      const config = await getOllamaConfigFromSettings();

      // forEmbeddings defaults to false, empty ollamaModel falls back to 'llama3.2:1b'
      expect(config.model).toBe('llama3.2:1b');
    });

    it('should return empty config when SettingsManager import fails', async () => {
      vi.doMock('../../core/settings', () => {
        throw new Error('Module not found');
      });

      const { getOllamaConfigFromSettings } = await import('../ollama-service');
      const config = await getOllamaConfigFromSettings(true);

      expect(config).toEqual({});
    });
  });

  // === getOllamaService singleton ===

  describe('getOllamaService', () => {
    it('should create a new instance when none exists', async () => {
      const { getOllamaService } = await import('../ollama-service');
      const service = getOllamaService({ model: 'test:latest' });

      expect(service).toBeDefined();
      expect(service.getConfig().model).toBe('test:latest');
    });

    it('should return same instance on subsequent calls', async () => {
      const { getOllamaService } = await import('../ollama-service');
      const first = getOllamaService({ model: 'test:latest' });
      const second = getOllamaService();

      expect(first).toBe(second);
    });

    it('should update config when it changes', async () => {
      const { getOllamaService } = await import('../ollama-service');
      getOllamaService({ model: 'old:v1', timeout: 5000 });
      const updated = getOllamaService({ model: 'new:v2', timeout: 15000 });

      expect(updated.getConfig().model).toBe('new:v2');
      expect(updated.getConfig().timeout).toBe(15000);
    });

    it('should not update config when values are the same', async () => {
      const { getOllamaService } = await import('../ollama-service');
      const first = getOllamaService({ model: 'test:latest', timeout: 10000 });
      const second = getOllamaService({ model: 'test:latest', timeout: 10000 });

      expect(first).toBe(second);
      // Config should be unchanged
      expect(second.getConfig().model).toBe('test:latest');
    });
  });

  // === generateEmbedding — memory pressure guard ===

  describe('generateEmbedding — memory pressure guard', () => {
    it('should block embedding when memory pressure is high', async () => {
      const { OllamaService } = await import('../ollama-service');
      const service = new OllamaService({ model: 'test:latest' });

      const saved = (performance as any).memory;
      (performance as any).memory = {
        usedJSHeapSize: 600 * 1024 * 1024, // 600MB — over limit
        totalJSHeapSize: 800 * 1024 * 1024,
        jsHeapSizeLimit: 2048 * 1024 * 1024,
      };

      const result = await service.generateEmbedding('test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Memory pressure');

      // Restore
      if (saved !== undefined) {
        (performance as any).memory = saved;
      } else {
        delete (performance as any).memory;
      }
    });
  });
});
