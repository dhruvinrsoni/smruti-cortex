import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Logger (must be before any module import that uses it)
vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      info: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
}));

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
});
