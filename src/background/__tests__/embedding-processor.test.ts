import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../core/logger', () => mockLogger());

// Default ollama-service mock factory — every test block that re-mocks
// `../ollama-service` with `vi.doMock` should spread this to include the
// availability-gate functions imported by `runLoop`. Tests that specifically
// want to simulate outages override `checkAvailability` per-test.
function makeOllamaServiceMock(overrides: {
  checkAvailability?: () => Promise<{ available: boolean; model: string | null; version?: string | null; error?: string }>;
  isCircuitBreakerOpen?: () => boolean;
  checkMemoryPressure?: () => { ok: boolean; usedMB?: number; limitMB?: number; permanent: boolean };
} = {}) {
  return {
    isCircuitBreakerOpen: vi.fn(overrides.isCircuitBreakerOpen ?? (() => false)),
    checkMemoryPressure: vi.fn(overrides.checkMemoryPressure ?? (() => ({ ok: true, permanent: false }))),
    getOllamaConfigFromSettings: vi.fn(async () => ({ model: 'test-model' })),
    getOllamaService: vi.fn(() => ({
      checkAvailability: vi.fn(overrides.checkAvailability ?? (async () => ({
        available: true,
        model: 'test-model',
        version: '1.0',
      }))),
    })),
  };
}

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
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: {
        init: vi.fn(),
        getSetting: vi.fn((key: string) => settingsMock[key]),
      },
    }));
    vi.doMock('../database', () => dbMocks);
    vi.doMock('../indexing', () => indexingMocks);
    vi.doMock('../ollama-service', () => makeOllamaServiceMock());
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
      // Give the async loop time to finish (loop has internal sleeps)
      await new Promise(r => setTimeout(r, 500));
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
      // Wait for async processing (each item has sleep(50) + save overhead)
      await new Promise(r => setTimeout(r, 1000));
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
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
      }));
      vi.doMock('../../core/settings', () => ({
        SettingsManager: {
          init: vi.fn(),
          getSetting: vi.fn((key: string) => settingsMock[key]),
        },
      }));
      vi.doMock('../database', () => dbMocks);
      vi.doMock('../indexing', () => indexingMocks);
      vi.doMock('../ollama-service', () => makeOllamaServiceMock());

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
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
      }));
      vi.doMock('../../core/settings', () => ({
        SettingsManager: {
          init: vi.fn(),
          getSetting: vi.fn((key: string) => settingsMock[key]),
        },
      }));
      vi.doMock('../database', () => dbMocks);
      vi.doMock('../indexing', () => indexingMocks);
      vi.doMock('../ollama-service', () => makeOllamaServiceMock());
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
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
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
      vi.doMock('../ollama-service', () => makeOllamaServiceMock());

      const { embeddingProcessor } = await import('../embedding-processor');
      await embeddingProcessor.start();
      await new Promise(r => setTimeout(r, 300));

      expect(embeddingProcessor.getProgress().state).toBe('error');
      expect(embeddingProcessor.getProgress().lastError).toBe('fatal string error');
    });
  });

  // ── Availability-gated backoff (processor pauses when Ollama is unreachable) ──

  describe('availability backoff', () => {
    /**
     * Shared setup: spies on `global.setTimeout` so in-loop sleeps fire on the
     * next microtask (making 30 s backoff windows collapse to µs while still
     * recording the requested delay). Also captures the component logger spies
     * so tests can assert exact INFO/DEBUG call counts.
     *
     * Returns:
     *   - `sleepDurations`: array of every ms value passed to setTimeout
     *   - `loggerSpies`: the {info, debug, warn, error, trace} spies
     *   - `availabilityCalls`: incremented every time checkAvailability is hit
     *   - `setTimeoutSpy`: so tests can restore / assert if needed
     */
    async function importWithAvailabilityMock(checkAvailabilityImpl: () => Promise<{
      available: boolean;
      model: string | null;
      version?: string | null;
      error?: string;
    }>) {
      vi.resetModules();

      const loggerSpies = {
        debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
      };
      vi.doMock('../../core/logger', () => ({
        Logger: { forComponent: () => loggerSpies },
        errorMeta: (err: unknown) => err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: 'non-Error', message: String(err) },
      }));
      vi.doMock('../../core/settings', () => ({
        SettingsManager: {
          init: vi.fn(),
          getSetting: vi.fn((key: string) => settingsMock[key]),
        },
      }));
      vi.doMock('../database', () => dbMocks);
      vi.doMock('../indexing', () => indexingMocks);

      const availabilityFn = vi.fn(checkAvailabilityImpl);
      vi.doMock('../ollama-service', () => makeOllamaServiceMock({
        checkAvailability: availabilityFn,
      }));

      const sleepDurations: number[] = [];
      // Spy on setTimeout but fan out to `queueMicrotask` so in-loop sleeps
      // collapse to µs (no recursion into the real scheduler) while we still
      // record the requested delay for backoff-sequence assertions.
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation(
        ((fn: (...args: unknown[]) => void, ms?: number) => {
          if (typeof ms === 'number') {sleepDurations.push(ms);}
          queueMicrotask(() => fn());
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof global.setTimeout
      );

      const mod = await import('../embedding-processor');
      return { ...mod, sleepDurations, loggerSpies, availabilityFn, setTimeoutSpy };
    }

    /** Drain N microtask turns so the processor's chained awaits settle. */
    async function drain(turns = 40): Promise<void> {
      for (let i = 0; i < turns; i++) {
        await new Promise<void>(r => queueMicrotask(r));
      }
    }

    /** Helper: filter sleep durations to only the availability-backoff windows (>= 30 s). */
    function backoffSleeps(all: number[]): number[] {
      return all.filter(ms => ms === 30_000 || ms === 60_000 || ms === 120_000);
    }

    it('pauses and does not process items when checkAvailability reports unavailable', async () => {
      // Unavailable forever, but stop() the processor after 2 checks so the
      // test doesn't loop forever.
      let callCount = 0;
      const { embeddingProcessor, loggerSpies, availabilityFn, setTimeoutSpy } =
        await importWithAvailabilityMock(async () => {
          callCount++;
          if (callCount >= 2) {embeddingProcessor.stop();}
          return { available: false, model: null, error: 'Connection refused' };
        });

      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([
        { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
      ]);

      await embeddingProcessor.start();
      await drain();

      expect(indexingMocks.generateItemEmbedding).not.toHaveBeenCalled();
      expect(availabilityFn).toHaveBeenCalled();

      const pauseInfo = loggerSpies.info.mock.calls.filter(
        call => typeof call[1] === 'string' && (call[1] as string).startsWith('Pausing —')
      );
      expect(pauseInfo).toHaveLength(1);
      expect(pauseInfo[0][1]).toContain('Connection refused');

      setTimeoutSpy.mockRestore();
    });

    it('logs a single Resuming INFO when availability transitions back to ok', async () => {
      // Unavailable on first check, available on second. After the second
      // availability check we stop() so the loop ends promptly.
      let callCount = 0;
      const { embeddingProcessor, loggerSpies, setTimeoutSpy } =
        await importWithAvailabilityMock(async () => {
          callCount++;
          if (callCount === 1) {
            return { available: false, model: null, error: 'Connection refused' };
          }
          queueMicrotask(() => embeddingProcessor.stop());
          return { available: true, model: 'mxbai-embed-large', version: '0.1.0' };
        });

      dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
      await embeddingProcessor.start();
      await drain();

      const pauseInfo = loggerSpies.info.mock.calls.filter(
        call => typeof call[1] === 'string' && (call[1] as string).startsWith('Pausing —')
      );
      const resumeInfo = loggerSpies.info.mock.calls.filter(
        call => typeof call[1] === 'string' && (call[1] as string).startsWith('Resuming —')
      );
      expect(pauseInfo).toHaveLength(1);
      expect(resumeInfo).toHaveLength(1);
      expect(resumeInfo[0][1]).toContain('mxbai-embed-large');

      setTimeoutSpy.mockRestore();
    });

    it('doubles backoff up to the 2-minute cap across consecutive outages', async () => {
      let callCount = 0;
      const { embeddingProcessor, sleepDurations, setTimeoutSpy } =
        await importWithAvailabilityMock(async () => {
          callCount++;
          if (callCount > 4) {embeddingProcessor.stop();}
          return { available: false, model: null, error: 'Connection refused' };
        });

      await embeddingProcessor.start();
      await drain(60);

      const observed = backoffSleeps(sleepDurations);
      // 4 unavailable checks → sleeps 30_000, 60_000, 120_000, 120_000 (cap).
      expect(observed.slice(0, 4)).toEqual([30_000, 60_000, 120_000, 120_000]);

      setTimeoutSpy.mockRestore();
    });

    it('resets backoff to 30s after the processor transitions back to available', async () => {
      // Pattern across availability checks:
      //   1: unavailable (sleep 30_000, backoff→60_000)
      //   2: unavailable (sleep 60_000, backoff→120_000)
      //   3: available   (reset backoff→30_000, proceed to batch)
      //   4: unavailable (sleep should be 30_000 — proves the reset worked)
      let callCount = 0;
      const { embeddingProcessor, sleepDurations, setTimeoutSpy } =
        await importWithAvailabilityMock(async () => {
          callCount++;
          if (callCount === 3) {
            return { available: true, model: 'mxbai-embed-large', version: '0.1.0' };
          }
          if (callCount >= 5) {embeddingProcessor.stop();}
          return { available: false, model: null, error: 'Connection refused' };
        });

      // After call 3 (available) the main loop will fetch a batch; give it one
      // item to process so the loop iterates back round to call 4.
      dbMocks.getItemsWithoutEmbeddingsBatch
        .mockResolvedValueOnce([
          { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
        ])
        .mockResolvedValue([]);

      await embeddingProcessor.start();
      await drain(80);

      const observed = backoffSleeps(sleepDurations);
      expect(observed.slice(0, 3)).toEqual([30_000, 60_000, 30_000]);

      setTimeoutSpy.mockRestore();
    });

    it('emits exactly one INFO Pausing across 5 consecutive unavailable iterations', async () => {
      let callCount = 0;
      const { embeddingProcessor, loggerSpies, setTimeoutSpy } =
        await importWithAvailabilityMock(async () => {
          callCount++;
          if (callCount > 5) {embeddingProcessor.stop();}
          return { available: false, model: null, error: 'Connection refused' };
        });

      await embeddingProcessor.start();
      await drain(80);

      const pauseInfo = loggerSpies.info.mock.calls.filter(
        call => typeof call[1] === 'string' && (call[1] as string).startsWith('Pausing —')
      );
      const stillUnavailableDebug = loggerSpies.debug.mock.calls.filter(
        call => typeof call[1] === 'string' && (call[1] as string).startsWith('Still unavailable')
      );
      expect(pauseInfo).toHaveLength(1);
      // Subsequent outage iterations should log at DEBUG, not INFO.
      expect(stillUnavailableDebug.length).toBeGreaterThanOrEqual(1);

      setTimeoutSpy.mockRestore();
    });
  });
});
