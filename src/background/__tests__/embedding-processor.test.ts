import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
  },
}));

const settingsMock: Record<string, unknown> = { embeddingsEnabled: true };
vi.mock('../../core/settings', () => ({
  SettingsManager: {
    init: vi.fn(),
    getSetting: vi.fn((key: string) => settingsMock[key]),
  },
}));

const dbMocks = {
  countItemsWithoutEmbeddings: vi.fn(async () => ({ total: 5, withoutEmbeddings: 3 })),
  getItemsWithoutEmbeddingsBatch: vi.fn(async () => []),
  saveIndexedItem: vi.fn(),
};
vi.mock('../database', () => dbMocks);

const indexingMocks = {
  generateItemEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
};
vi.mock('../indexing', () => indexingMocks);

// ── Tests ──────────────────────────────────────────────────────────────────

describe('embedding-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.embeddingsEnabled = true;
    dbMocks.countItemsWithoutEmbeddings.mockResolvedValue({ total: 5, withoutEmbeddings: 3 });
    dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
    indexingMocks.generateItemEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  async function importFreshModule() {
    vi.resetModules();
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
        getSetting: vi.fn((key: string) => settingsMock[key]),
      },
    }));
    vi.doMock('../database', () => dbMocks);
    vi.doMock('../indexing', () => indexingMocks);
    // Mock ollama-service for the dynamic import inside runLoop
    vi.doMock('../ollama-service', () => ({
      isCircuitBreakerOpen: vi.fn(() => false),
      checkMemoryPressure: vi.fn(() => ({ ok: true })),
    }));
    return import('../embedding-processor');
  }

  describe('start', () => {
    it('should stay idle when embeddings are disabled', async () => {
      settingsMock.embeddingsEnabled = false;
      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      expect(embeddingProcessor.getProgress().state).toBe('idle');
    });

    it('should stay idle when no items exist', async () => {
      dbMocks.countItemsWithoutEmbeddings.mockResolvedValue({ total: 0, withoutEmbeddings: 0 });
      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      expect(embeddingProcessor.getProgress().state).toBe('idle');
    });

    it('should complete immediately when all items have embeddings', async () => {
      dbMocks.countItemsWithoutEmbeddings.mockResolvedValue({ total: 5, withoutEmbeddings: 0 });
      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      expect(embeddingProcessor.getProgress().state).toBe('completed');
    });

    it('should set state to running when items need embeddings', async () => {
      // Items without embeddings, but batch returns empty (so loop completes)
      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      // After empty batch, state should be 'completed'
      // Give the async loop time to finish
      await new Promise(r => setTimeout(r, 50));
      expect(embeddingProcessor.getProgress().state).toBe('completed');
    });

    it('should process items and update progress', async () => {
      const items = [
        { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
        { url: 'https://b.com', title: 'B', hostname: 'b.com', visitCount: 1, lastVisit: Date.now(), tokens: ['b'] },
      ];
      // First call returns items, second returns empty (done)
      dbMocks.getItemsWithoutEmbeddingsBatch
        .mockResolvedValueOnce(items)
        .mockResolvedValueOnce([]);

      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      // Wait for async processing
      await new Promise(r => setTimeout(r, 300));
      const progress = embeddingProcessor.getProgress();
      expect(progress.processed).toBe(2);
      expect(progress.state).toBe('completed');
    });

    it('should be a no-op when already running', async () => {
      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      // Start again while loop is running
      await embeddingProcessor.start();
      // Should not throw or reset state
    });
  });

  describe('pause / resume', () => {
    it('should pause and resume', async () => {
      // Items that won't finish instantly
      dbMocks.getItemsWithoutEmbeddingsBatch.mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 100));
        return [{ url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] }];
      });

      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();

      // Pause
      embeddingProcessor.pause();
      expect(embeddingProcessor.getProgress().state).toBe('paused');

      // Resume (loop restarts)
      embeddingProcessor.resume();
      expect(embeddingProcessor.getProgress().state).toBe('running');

      // Clean up
      embeddingProcessor.stop();
    });

    it('should ignore pause when not running', async () => {
      const { embeddingProcessor } = await importFreshModule();
      embeddingProcessor.pause(); // idle state
      expect(embeddingProcessor.getProgress().state).toBe('idle');
    });

    it('should ignore resume when not paused', async () => {
      const { embeddingProcessor } = await importFreshModule();
      embeddingProcessor.resume(); // idle state
      expect(embeddingProcessor.getProgress().state).toBe('idle');
    });
  });

  describe('stop', () => {
    it('should reset state to idle', async () => {
      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 50));
      embeddingProcessor.stop();
      const progress = embeddingProcessor.getProgress();
      expect(progress.state).toBe('idle');
      expect(progress.processed).toBe(0);
    });
  });

  describe('setSearchActive', () => {
    it('should toggle search active flag', async () => {
      const { embeddingProcessor } = await importFreshModule();
      embeddingProcessor.setSearchActive(true);
      embeddingProcessor.setSearchActive(false);
      // No error thrown — signal is internal, we verify via progress/behavior
    });
  });

  describe('getProgress', () => {
    it('should return progress with all fields', async () => {
      const { embeddingProcessor } = await importFreshModule();
      const progress = embeddingProcessor.getProgress();
      expect(progress).toEqual(expect.objectContaining({
        state: 'idle',
        processed: 0,
        total: 0,
        withEmbeddings: 0,
        remaining: 0,
        speed: 0,
        estimatedMinutes: 0,
      }));
    });

    it('should show remaining count after start', async () => {
      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 50));
      const progress = embeddingProcessor.getProgress();
      expect(progress.total).toBe(5);
      expect(progress.withEmbeddings).toBe(2); // total(5) - withoutEmbeddings(3)
    });
  });

  describe('error handling in runLoop', () => {
    it('should handle embedding failure gracefully (null embedding)', async () => {
      indexingMocks.generateItemEmbedding.mockResolvedValue(null);
      const items = [
        { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
      ];
      dbMocks.getItemsWithoutEmbeddingsBatch
        .mockResolvedValueOnce(items)
        .mockResolvedValueOnce([]);

      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 500));
      // Should complete without crashing, with 0 processed
      expect(embeddingProcessor.getProgress().processed).toBe(0);
    });

    it('should stop on network error', async () => {
      indexingMocks.generateItemEmbedding.mockRejectedValue(new Error('Failed to fetch'));
      const items = [
        { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
      ];
      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValueOnce(items);

      const { embeddingProcessor } = await importFreshModule();
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 300));
      expect(embeddingProcessor.getProgress().state).toBe('error');
      expect(embeddingProcessor.getProgress().lastError).toContain('Failed to fetch');
    });
  });

  // ── New tests covering lines 270-308 ──────────────────────────────────────

  describe('progress logging every 10 items (lines 270-278)', () => {
    it('should call logger.info with progress stats after every 10th item', async () => {
      // Capture the logger spy by intercepting forComponent
      let capturedInfo: ReturnType<typeof vi.fn> | null = null;

      vi.resetModules();
      vi.doMock('../../core/logger', () => ({
        Logger: {
          forComponent: () => {
            const info = vi.fn();
            capturedInfo = info;
            return { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn(), trace: vi.fn() };
          },
        },
      }));
      vi.doMock('../../core/settings', () => ({
        SettingsManager: {
          init: vi.fn(),
          getSetting: vi.fn((key: string) => settingsMock[key]),
        },
      }));
      vi.doMock('../database', () => dbMocks);
      vi.doMock('../indexing', () => indexingMocks);
      vi.doMock('../ollama-service', () => ({
        isCircuitBreakerOpen: vi.fn(() => false),
        checkMemoryPressure: vi.fn(() => ({ ok: true })),
      }));

      // Make total large enough that withEmbeddings/total division works
      dbMocks.countItemsWithoutEmbeddings.mockResolvedValue({ total: 20, withoutEmbeddings: 10 });

      // Build exactly 10 items
      const items = Array.from({ length: 10 }, (_, i) => ({
        url: `https://item${i}.com`,
        title: `Item ${i}`,
        hostname: `item${i}.com`,
        visitCount: 1,
        lastVisit: Date.now(),
        tokens: [`item${i}`],
      }));

      // Return batch of 10, then empty to finish
      dbMocks.getItemsWithoutEmbeddingsBatch
        .mockResolvedValueOnce(items)
        .mockResolvedValueOnce([]);

      indexingMocks.generateItemEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const { embeddingProcessor } = await import('../embedding-processor');
      await embeddingProcessor.start();
      // Give the async loop time to process all 10 items (each has a 50ms sleep)
      await new Promise(r => setTimeout(r, 1500));

      expect(capturedInfo).not.toBeNull();
      const progressCalls = (capturedInfo as ReturnType<typeof vi.fn>).mock.calls.filter(
        (args: unknown[]) => typeof args[1] === 'string' && (args[1] as string).includes('Progress:')
      );
      expect(progressCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('network/CORS error detection (lines 292-298)', () => {
    async function importForNetworkTest() {
      vi.resetModules();
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
          getSetting: vi.fn((key: string) => settingsMock[key]),
        },
      }));
      vi.doMock('../database', () => dbMocks);
      vi.doMock('../indexing', () => indexingMocks);
      vi.doMock('../ollama-service', () => ({
        isCircuitBreakerOpen: vi.fn(() => false),
        checkMemoryPressure: vi.fn(() => ({ ok: true })),
      }));
      return import('../embedding-processor');
    }

    it('should stop processor on CORS error', async () => {
      indexingMocks.generateItemEmbedding.mockRejectedValue(new Error('CORS policy blocked'));
      const items = [
        { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
      ];
      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValueOnce(items);

      const { embeddingProcessor } = await importForNetworkTest();
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 300));

      expect(embeddingProcessor.getProgress().state).toBe('error');
      expect(embeddingProcessor.getProgress().lastError).toContain('CORS');
    });

    it('should stop processor on NetworkError', async () => {
      indexingMocks.generateItemEmbedding.mockRejectedValue(new Error('NetworkError occurred'));
      const items = [
        { url: 'https://b.com', title: 'B', hostname: 'b.com', visitCount: 1, lastVisit: Date.now(), tokens: ['b'] },
      ];
      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValueOnce(items);

      const { embeddingProcessor } = await importForNetworkTest();
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 300));

      expect(embeddingProcessor.getProgress().state).toBe('error');
      expect(embeddingProcessor.getProgress().lastError).toContain('NetworkError');
    });

    it('should NOT stop processor on non-network errors — continues to next item', async () => {
      // First item throws a generic error, second item succeeds, then empty batch
      indexingMocks.generateItemEmbedding
        .mockRejectedValueOnce(new Error('some transient error'))
        .mockResolvedValue([0.1, 0.2, 0.3]);

      const items = [
        { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
        { url: 'https://b.com', title: 'B', hostname: 'b.com', visitCount: 1, lastVisit: Date.now(), tokens: ['b'] },
      ];
      dbMocks.getItemsWithoutEmbeddingsBatch
        .mockResolvedValueOnce(items)
        .mockResolvedValueOnce([]);

      const { embeddingProcessor } = await importForNetworkTest();
      await embeddingProcessor.start();
      // Wait for error sleep (500ms) + item processing + batch refetch
      await new Promise(r => setTimeout(r, 1500));

      // Processor should not be in error state — second item was processed successfully
      expect(embeddingProcessor.getProgress().state).toBe('completed');
      expect(embeddingProcessor.getProgress().processed).toBe(1);
    });
  });

  describe('outer catch block for fatal errors (lines 304-308)', () => {
    it('should set state to error when outer try block throws fatally', async () => {
      vi.resetModules();
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
          getSetting: vi.fn((key: string) => settingsMock[key]),
        },
      }));
      // Make getItemsWithoutEmbeddingsBatch throw a non-Error to trigger the outer catch
      vi.doMock('../database', () => ({
        ...dbMocks,
        getItemsWithoutEmbeddingsBatch: vi.fn(async () => {
          throw 'fatal string error';
        }),
      }));
      vi.doMock('../indexing', () => indexingMocks);
      vi.doMock('../ollama-service', () => ({
        isCircuitBreakerOpen: vi.fn(() => false),
        checkMemoryPressure: vi.fn(() => ({ ok: true })),
      }));

      const { embeddingProcessor } = await import('../embedding-processor');
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 300));

      expect(embeddingProcessor.getProgress().state).toBe('error');
      expect(embeddingProcessor.getProgress().lastError).toBe('fatal string error');
    });
  });
});
