import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
  },
}));

const mockSettings: Record<string, unknown> = {
  ollamaEnabled: true,
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2:1b',
  ollamaTimeout: 30000,
};

vi.mock('../../core/settings', () => ({
  SettingsManager: {
    init: vi.fn(),
    getSetting: vi.fn((key: string) => mockSettings[key]),
  },
}));

const ollamaMocks = {
  isCircuitBreakerOpen: vi.fn(() => false),
  checkMemoryPressure: vi.fn(() => ({ ok: true })),
  acquireOllamaSlot: vi.fn(() => true),
  releaseOllamaSlot: vi.fn(),
};
vi.mock('../ollama-service', () => ollamaMocks);

const cacheMocks = {
  loadCache: vi.fn(),
  getCachedExpansion: vi.fn(() => null),
  getPrefixMatch: vi.fn(() => null),
  cacheExpansion: vi.fn(),
};
vi.mock('../ai-keyword-cache', () => cacheMocks);

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ai-keyword-expander', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.ollamaEnabled = true;
    mockSettings.ollamaModel = 'llama3.2:1b';
    // Mock fetch globally
    vi.stubGlobal('fetch', vi.fn());
  });

  async function importModule() {
    // We don't resetModules here because the top-level mocks are sufficient
    // and the module's internal state (lastExpansionSource) is useful to test
    return import('../ai-keyword-expander');
  }

  // Reset module state for tests that need clean lastExpansionSource
  async function importFreshModule() {
    vi.resetModules();
    // Restore mock defaults after clearAllMocks
    ollamaMocks.isCircuitBreakerOpen.mockReturnValue(false);
    ollamaMocks.checkMemoryPressure.mockReturnValue({ ok: true });
    ollamaMocks.acquireOllamaSlot.mockReturnValue(true);
    cacheMocks.getCachedExpansion.mockReturnValue(null);
    cacheMocks.getPrefixMatch.mockReturnValue(null);

    vi.doMock('../../core/logger', () => ({
      Logger: {
        forComponent: () => ({
          debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        }),
      },
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: {
        init: vi.fn(),
        getSetting: vi.fn((key: string) => mockSettings[key]),
      },
    }));
    vi.doMock('../ollama-service', () => ollamaMocks);
    vi.doMock('../ai-keyword-cache', () => cacheMocks);
    return import('../ai-keyword-expander');
  }

  describe('expandQueryKeywords', () => {
    it('should return empty array for empty query', async () => {
      const { expandQueryKeywords } = await importFreshModule();
      const result = await expandQueryKeywords('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const { expandQueryKeywords } = await importFreshModule();
      const result = await expandQueryKeywords('   ');
      expect(result).toEqual([]);
    });

    it('should skip AI for long queries (>200 chars)', async () => {
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      const longQuery = 'a'.repeat(201);
      const result = await expandQueryKeywords(longQuery);
      expect(result.length).toBeGreaterThan(0);
      expect(getLastExpansionSource()).toBe('skipped');
    });

    it('should return original tokens when AI is disabled', async () => {
      mockSettings.ollamaEnabled = false;
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      const result = await expandQueryKeywords('test query');
      expect(result).toEqual(['test', 'query']);
      expect(getLastExpansionSource()).toBe('disabled');
    });

    it('should return cached results when all tokens are cached', async () => {
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      cacheMocks.getCachedExpansion.mockReturnValue(['war', 'battle', 'conflict']);
      const result = await expandQueryKeywords('war');
      expect(result).toContain('war');
      expect(result).toContain('battle');
      expect(getLastExpansionSource()).toBe('cache-hit');
      expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    });

    it('should use prefix match when available', async () => {
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      cacheMocks.getCachedExpansion.mockReturnValue(null);
      cacheMocks.getPrefixMatch.mockReturnValue(['war', 'warfare', 'warrior']);
      const result = await expandQueryKeywords('war');
      expect(result).toContain('warfare');
      expect(getLastExpansionSource()).toBe('cache-hit');
    });

    it('should skip AI when circuit breaker is open', async () => {
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      ollamaMocks.isCircuitBreakerOpen.mockReturnValue(true);
      const result = await expandQueryKeywords('war');
      expect(result).toContain('war');
      expect(getLastExpansionSource()).toBe('skipped');
    });

    it('should skip AI when memory pressure detected', async () => {
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      ollamaMocks.checkMemoryPressure.mockReturnValue({ ok: false });
      const result = await expandQueryKeywords('war');
      expect(result).toContain('war');
      expect(getLastExpansionSource()).toBe('skipped');
    });

    it('should skip AI when Ollama slot is busy', async () => {
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      ollamaMocks.acquireOllamaSlot.mockReturnValue(false);
      const result = await expandQueryKeywords('war');
      expect(result).toContain('war');
      expect(getLastExpansionSource()).toBe('skipped');
    });

    it('should call Ollama and return expanded keywords on success', async () => {
      cacheMocks.getCachedExpansion.mockReturnValue(null);
      cacheMocks.getPrefixMatch.mockReturnValue(null);
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '["war", "battle", "conflict", "combat"]' },
        }),
        text: async () => '',
      } as Response);

      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      const result = await expandQueryKeywords('war');
      expect(result).toContain('war');
      expect(result).toContain('battle');
      expect(result).toContain('conflict');
      expect(getLastExpansionSource()).toBe('ollama');
      expect(ollamaMocks.releaseOllamaSlot).toHaveBeenCalled();
    });

    it('should handle Ollama API error gracefully', async () => {
      cacheMocks.getCachedExpansion.mockReturnValue(null);
      cacheMocks.getPrefixMatch.mockReturnValue(null);
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
        json: async () => ({}),
      } as Response);

      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      const result = await expandQueryKeywords('war');
      // Should still return original keyword even on error
      expect(result).toContain('war');
      expect(getLastExpansionSource()).toBe('error');
      expect(ollamaMocks.releaseOllamaSlot).toHaveBeenCalled();
    });

    it('should handle fetch network error gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const { expandQueryKeywords } = await importFreshModule();
      const result = await expandQueryKeywords('war');
      expect(result).toContain('war');
      expect(ollamaMocks.releaseOllamaSlot).toHaveBeenCalled();
    });

    it('should skip single-character tokens for expansion', async () => {
      cacheMocks.getCachedExpansion.mockReturnValue(null);
      cacheMocks.getPrefixMatch.mockReturnValue(null);
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      const result = await expandQueryKeywords('a b');
      expect(result).toEqual(['a', 'b']);
      expect(getLastExpansionSource()).toBe('skipped');
    });

    it('should handle abort signal that is already aborted', async () => {
      cacheMocks.getCachedExpansion.mockReturnValue(null);
      cacheMocks.getPrefixMatch.mockReturnValue(null);
      const controller = new AbortController();
      controller.abort();

      const { expandQueryKeywords } = await importFreshModule();
      const result = await expandQueryKeywords('war', controller.signal);
      // Should still return original keyword (error path)
      expect(result).toContain('war');
    });

    it('should use embedding-only model fallback for generation', async () => {
      mockSettings.ollamaModel = 'nomic-embed-text';
      cacheMocks.getCachedExpansion.mockReturnValue(null);
      cacheMocks.getPrefixMatch.mockReturnValue(null);
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '["test", "exam"]' },
        }),
        text: async () => '',
      } as Response);

      const { expandQueryKeywords } = await importFreshModule();
      await expandQueryKeywords('test');

      // Should have used llama3.2:1b fallback, not nomic-embed-text
      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe('llama3.2:1b');
    });

    it('should mix cached and fresh results for multi-word queries', async () => {
      const { expandQueryKeywords, getLastExpansionSource } = await importFreshModule();
      // First token cached, second needs Ollama
      cacheMocks.getCachedExpansion.mockImplementation((token: string) => {
        if (token === 'web') return ['web', 'internet', 'online'];
        return null;
      });
      cacheMocks.getPrefixMatch.mockReturnValue(null);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '["browser", "chrome", "firefox"]' },
        }),
        text: async () => '',
      } as Response));

      const result = await expandQueryKeywords('web browser');
      expect(result).toContain('web');
      expect(result).toContain('internet');
      expect(result).toContain('browser');
      expect(result).toContain('chrome');
      expect(getLastExpansionSource()).toBe('ollama');
    });
  });

  describe('getLastExpansionSource', () => {
    it('should return disabled by default', async () => {
      const { getLastExpansionSource } = await importFreshModule();
      expect(getLastExpansionSource()).toBe('disabled');
    });
  });
});
