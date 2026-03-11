import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock dependencies BEFORE importing module under test ---

vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    }),
  },
}));

vi.mock('../database', () => ({
  openDatabase: vi.fn(),
  getAllIndexedItems: vi.fn(),
  clearIndexedDB: vi.fn(),
  getForceRebuildFlag: vi.fn(),
  setForceRebuildFlag: vi.fn(),
}));

vi.mock('../indexing', () => ({
  performFullRebuild: vi.fn(),
}));

vi.mock('../performance-monitor', () => ({
  performanceTracker: {
    recordHealthCheck: vi.fn(),
    recordSelfHeal: vi.fn(),
  },
}));

vi.mock('../favicon-cache', () => ({
  clearExpiredFavicons: vi.fn(),
}));

// --- Import module under test and mocked deps ---

import {
  checkHealth,
  selfHeal,
  clearAndRebuild,
  startHealthMonitoring,
  stopHealthMonitoring,
  getLastHealthStatus,
  gracefulDegrade,
  safeDatabaseOperation,
  recoverFromCorruption,
  handleQuotaExceeded,
  ensureReady,
} from '../resilience';
import type { HealthStatus } from '../resilience';

import { openDatabase, getAllIndexedItems, clearIndexedDB, getForceRebuildFlag, setForceRebuildFlag } from '../database';
import { performFullRebuild } from '../indexing';
import { performanceTracker } from '../performance-monitor';
import { clearExpiredFavicons } from '../favicon-cache';

// --- Helpers ---

function mockHealthyIndex(itemCount = 50) {
  vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
  vi.mocked(getAllIndexedItems).mockResolvedValue(
    Array.from({ length: itemCount }, (_, i) => ({ url: `https://example.com/${i}` }) as any)
  );
}

function mockEmptyIndex() {
  vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
  vi.mocked(getAllIndexedItems).mockResolvedValue([]);
}

// --- Tests ---

describe('resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset module-level state by stopping any running timers
    stopHealthMonitoring();
  });

  afterEach(() => {
    stopHealthMonitoring();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // checkHealth
  // ==========================================================================

  describe('checkHealth', () => {
    it('should return healthy status when database is open and index has enough items', async () => {
      // Arrange
      mockHealthyIndex(50);

      // Act
      const status = await checkHealth();

      // Assert
      expect(status.isHealthy).toBe(true);
      expect(status.databaseOpen).toBe(true);
      expect(status.indexedItems).toBe(50);
      expect(status.issues).toHaveLength(0);
      expect(status.lastCheck).toBeGreaterThan(0);
    });

    it('should report issue when database is not accessible', async () => {
      // Arrange
      vi.mocked(openDatabase).mockRejectedValue(new Error('DB open failed'));
      vi.mocked(getAllIndexedItems).mockResolvedValue([]);

      // Act
      const status = await checkHealth();

      // Assert
      expect(status.isHealthy).toBe(false);
      expect(status.databaseOpen).toBe(false);
      expect(status.issues).toContain('Database not accessible');
    });

    it('should report issue when index is empty', async () => {
      // Arrange
      mockEmptyIndex();

      // Act
      const status = await checkHealth();

      // Assert
      expect(status.isHealthy).toBe(false);
      expect(status.indexedItems).toBe(0);
      expect(status.issues).toContain('Index is empty');
    });

    it('should report issue when index has very few items (below threshold)', async () => {
      // Arrange — MIN_EXPECTED_ITEMS is 10
      mockHealthyIndex(5);

      // Act
      const status = await checkHealth();

      // Assert
      expect(status.isHealthy).toBe(false);
      expect(status.indexedItems).toBe(5);
      expect(status.issues).toEqual([expect.stringContaining('very few items')]);
    });

    it('should report issue when index read fails', async () => {
      // Arrange
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockRejectedValue(new Error('Read error'));

      // Act
      const status = await checkHealth();

      // Assert
      expect(status.isHealthy).toBe(false);
      expect(status.issues).toContain('Failed to read index');
    });

    it('should report multiple issues simultaneously', async () => {
      // Arrange — both DB and index fail
      vi.mocked(openDatabase).mockRejectedValue(new Error('DB fail'));
      vi.mocked(getAllIndexedItems).mockRejectedValue(new Error('Index fail'));

      // Act
      const status = await checkHealth();

      // Assert
      expect(status.isHealthy).toBe(false);
      expect(status.issues).toContain('Database not accessible');
      expect(status.issues).toContain('Failed to read index');
      expect(status.issues).toHaveLength(2);
    });

    it('should call performanceTracker.recordHealthCheck', async () => {
      // Arrange
      mockHealthyIndex();

      // Act
      await checkHealth();

      // Assert
      expect(performanceTracker.recordHealthCheck).toHaveBeenCalledTimes(1);
    });

    it('should treat exactly MIN_EXPECTED_ITEMS (10) as healthy', async () => {
      // Arrange
      mockHealthyIndex(10);

      // Act
      const status = await checkHealth();

      // Assert
      expect(status.isHealthy).toBe(true);
      expect(status.issues).toHaveLength(0);
    });
  });

  // ==========================================================================
  // selfHeal
  // ==========================================================================

  describe('selfHeal', () => {
    it('should return true when healing succeeds and health is restored', async () => {
      // Arrange — empty index triggers rebuild, then healthy after rebuild
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems)
        .mockResolvedValueOnce([]) // Step 2: empty → triggers rebuild
        .mockResolvedValueOnce(Array(50).fill({ url: 'https://example.com' })) // checkHealth inside selfHeal
        ;
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act
      const result = await selfHeal('test reason');

      // Assert
      expect(result).toBe(true);
      expect(openDatabase).toHaveBeenCalled();
      expect(performFullRebuild).toHaveBeenCalledTimes(1);
    });

    it('should not rebuild when index already has items', async () => {
      // Arrange
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockResolvedValue(
        Array(50).fill({ url: 'https://example.com' })
      );
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act
      const result = await selfHeal('test');

      // Assert
      expect(result).toBe(true);
      expect(performFullRebuild).not.toHaveBeenCalled();
    });

    it('should clear force rebuild flag when it is set', async () => {
      // Arrange
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockResolvedValue(
        Array(50).fill({ url: 'https://example.com' })
      );
      vi.mocked(getForceRebuildFlag).mockResolvedValue(true);
      vi.mocked(setForceRebuildFlag).mockResolvedValue(undefined);

      // Act
      await selfHeal('flag check');

      // Assert
      expect(setForceRebuildFlag).toHaveBeenCalledWith(false);
    });

    it('should not clear force rebuild flag when it is not set', async () => {
      // Arrange
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockResolvedValue(
        Array(50).fill({ url: 'https://example.com' })
      );
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act
      await selfHeal('no flag');

      // Assert
      expect(setForceRebuildFlag).not.toHaveBeenCalled();
    });

    it('should return false when healing fails with an exception', async () => {
      // Arrange
      vi.mocked(openDatabase).mockRejectedValue(new Error('DB crashed'));

      // Act
      const result = await selfHeal('crash recovery');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when health check still fails after healing', async () => {
      // Arrange — index stays empty even after rebuild
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockResolvedValue([]); // always empty
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act
      const result = await selfHeal('still broken');

      // Assert
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // clearAndRebuild
  // ==========================================================================

  describe('clearAndRebuild', () => {
    it('should clear, rebuild, and report success with item count', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getAllIndexedItems).mockResolvedValue(
        Array(100).fill({ url: 'https://example.com' })
      );

      // Act
      const result = await clearAndRebuild();

      // Assert
      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(100);
      expect(result.message).toContain('100 items indexed');
      expect(clearIndexedDB).toHaveBeenCalledTimes(1);
      expect(performFullRebuild).toHaveBeenCalledTimes(1);
    });

    it('should report success with zero items when no history is found', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getAllIndexedItems).mockResolvedValue([]);

      // Act
      const result = await clearAndRebuild();

      // Assert
      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(0);
      expect(result.message).toContain('No browser history found');
    });

    it('should return failure when clearIndexedDB throws', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockRejectedValue(new Error('Clear failed'));

      // Act
      const result = await clearAndRebuild();

      // Assert
      expect(result.success).toBe(false);
      expect(result.itemCount).toBe(0);
      expect(result.message).toContain('Clear failed');
    });

    it('should return failure when performFullRebuild throws', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(performFullRebuild).mockRejectedValue(new Error('Rebuild boom'));

      // Act
      const result = await clearAndRebuild();

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Rebuild boom');
    });

    it('should return failure when getAllIndexedItems throws after rebuild', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getAllIndexedItems).mockRejectedValue(new Error('Verify failed'));

      // Act
      const result = await clearAndRebuild();

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Verify failed');
    });
  });

  // ==========================================================================
  // startHealthMonitoring / stopHealthMonitoring
  // ==========================================================================

  describe('startHealthMonitoring', () => {
    it('should run an initial health check on start', async () => {
      // Arrange
      mockHealthyIndex();

      // Act
      startHealthMonitoring();
      // Flush the microtask queue so the initial .then() fires
      await vi.advanceTimersByTimeAsync(0);

      // Assert
      expect(openDatabase).toHaveBeenCalled();
      expect(getAllIndexedItems).toHaveBeenCalled();
    });

    it('should trigger self-heal when initial check is unhealthy', async () => {
      // Arrange — empty index on initial check, then stays empty for selfHeal
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockResolvedValue([]);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act
      startHealthMonitoring();
      await vi.advanceTimersByTimeAsync(0);

      // Assert — selfHeal was called which calls performFullRebuild on empty index
      expect(performFullRebuild).toHaveBeenCalled();
    });

    it('should not set up a second timer if called twice', async () => {
      // Arrange
      mockHealthyIndex();

      // Act
      startHealthMonitoring();
      await vi.advanceTimersByTimeAsync(0);
      const callCountAfterFirst = vi.mocked(openDatabase).mock.calls.length;

      startHealthMonitoring(); // second call should be no-op
      await vi.advanceTimersByTimeAsync(0);

      // Assert — no additional health check from second call
      expect(vi.mocked(openDatabase).mock.calls.length).toBe(callCountAfterFirst);
    });

    it('should run periodic health checks at 60-second intervals', async () => {
      // Arrange
      mockHealthyIndex();

      // Act
      startHealthMonitoring();
      await vi.advanceTimersByTimeAsync(0); // initial check

      vi.clearAllMocks();
      mockHealthyIndex();

      // Advance past one interval (60s)
      await vi.advanceTimersByTimeAsync(60_000);

      // Assert — periodic check ran
      expect(openDatabase).toHaveBeenCalled();
      expect(performanceTracker.recordHealthCheck).toHaveBeenCalled();
    });

    it('should auto-heal during periodic check when index is empty but DB is open', async () => {
      // Arrange — healthy on first check, empty on periodic check
      mockHealthyIndex();
      startHealthMonitoring();
      await vi.advanceTimersByTimeAsync(0);

      // Now set up empty index for periodic check
      vi.clearAllMocks();
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockResolvedValue([]);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act — advance to trigger periodic check
      await vi.advanceTimersByTimeAsync(60_000);

      // Assert — selfHeal triggered via performFullRebuild
      expect(performFullRebuild).toHaveBeenCalled();
    });
  });

  describe('stopHealthMonitoring', () => {
    it('should stop periodic checks', async () => {
      // Arrange
      mockHealthyIndex();
      startHealthMonitoring();
      await vi.advanceTimersByTimeAsync(0);

      // Act
      stopHealthMonitoring();

      vi.clearAllMocks();
      mockHealthyIndex();
      await vi.advanceTimersByTimeAsync(60_000);

      // Assert — no periodic check after stopping
      expect(openDatabase).not.toHaveBeenCalled();
    });

    it('should be safe to call when monitoring is not running', () => {
      // Act & Assert — should not throw
      expect(() => stopHealthMonitoring()).not.toThrow();
    });
  });

  // ==========================================================================
  // getLastHealthStatus
  // ==========================================================================

  describe('getLastHealthStatus', () => {
    it('should return the most recent health status after a check', async () => {
      // Arrange
      mockHealthyIndex(25);

      // Act
      await checkHealth();
      const status = getLastHealthStatus();

      // Assert
      expect(status).not.toBeNull();
      expect((status as HealthStatus).isHealthy).toBe(true);
      expect((status as HealthStatus).indexedItems).toBe(25);
    });
  });

  // ==========================================================================
  // gracefulDegrade
  // ==========================================================================

  describe('gracefulDegrade', () => {
    it('should return the function result on success', async () => {
      // Arrange
      const fn = async () => 42;

      // Act
      const result = await gracefulDegrade(fn, 0, 'test op');

      // Assert
      expect(result).toBe(42);
    });

    it('should return fallback when the function throws', async () => {
      // Arrange
      const fn = async (): Promise<number> => { throw new Error('boom'); };

      // Act
      const result = await gracefulDegrade(fn, -1, 'failing op');

      // Assert
      expect(result).toBe(-1);
    });

    it('should return fallback with default operation name', async () => {
      // Arrange
      const fn = async (): Promise<string> => { throw new Error('fail'); };

      // Act
      const result = await gracefulDegrade(fn, 'default');

      // Assert
      expect(result).toBe('default');
    });
  });

  // ==========================================================================
  // safeDatabaseOperation
  // ==========================================================================

  describe('safeDatabaseOperation', () => {
    it('should return the operation result on success', async () => {
      // Arrange
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      const operation = vi.fn().mockResolvedValue('data');

      // Act
      const result = await safeDatabaseOperation(operation, 'fallback', 'test op');

      // Assert
      expect(result).toBe('data');
      expect(openDatabase).toHaveBeenCalled();
    });

    it('should return fallback after all retries are exhausted', async () => {
      // Arrange — openDatabase always fails
      vi.mocked(openDatabase).mockRejectedValue(new Error('DB gone'));
      const operation = vi.fn().mockResolvedValue('data');

      // Act — need to advance timers past backoff delays (1000ms + 2000ms)
      const promise = safeDatabaseOperation(operation, 'fallback', 'broken op');
      await vi.advanceTimersByTimeAsync(1000); // backoff after attempt 1
      await vi.advanceTimersByTimeAsync(2000); // backoff after attempt 2
      const result = await promise;

      // Assert
      expect(result).toBe('fallback');
    });

    it('should retry the operation on transient failure then succeed', async () => {
      // Arrange — first openDatabase fails, second succeeds
      vi.mocked(openDatabase)
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue({} as IDBDatabase);
      const operation = vi.fn().mockResolvedValue('recovered');

      // Act — advance past first backoff delay
      const promise = safeDatabaseOperation(operation, 'fallback', 'retry op');
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      // Assert
      expect(result).toBe('recovered');
      // openDatabase called at least twice (first failure + retry success)
      expect(openDatabase).toHaveBeenCalledTimes(2);
    });

    it('should return fallback when operation itself throws after DB opens', async () => {
      // Arrange
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      const operation = vi.fn().mockRejectedValue(new Error('op failed'));

      // Act — operation fails on every attempt; advance through backoff delays
      const promise = safeDatabaseOperation(operation, 'safe-value', 'fail op');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      // Assert
      expect(result).toBe('safe-value');
    });
  });

  // ==========================================================================
  // recoverFromCorruption
  // ==========================================================================

  describe('recoverFromCorruption', () => {
    it('should return true when recovery succeeds with items restored', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getAllIndexedItems).mockResolvedValue(
        Array(30).fill({ url: 'https://example.com' })
      );

      // Act
      const promise = recoverFromCorruption();
      await vi.advanceTimersByTimeAsync(500); // 500ms wait between clear and reopen
      const result = await promise;

      // Assert
      expect(result).toBe(true);
      expect(clearIndexedDB).toHaveBeenCalledTimes(1);
      expect(openDatabase).toHaveBeenCalled();
      expect(performFullRebuild).toHaveBeenCalledTimes(1);
      expect(performanceTracker.recordSelfHeal).toHaveBeenCalledTimes(1);
    });

    it('should return false when recovery results in zero items', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getAllIndexedItems).mockResolvedValue([]);

      // Act
      const promise = recoverFromCorruption();
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      // Assert
      expect(result).toBe(false);
      expect(performanceTracker.recordSelfHeal).not.toHaveBeenCalled();
    });

    it('should return false when clearIndexedDB throws', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockRejectedValue(new Error('Clear failed'));

      // Act — no timer advance needed; error happens before setTimeout
      const result = await recoverFromCorruption();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when openDatabase throws after clear', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(openDatabase).mockRejectedValue(new Error('Reopen failed'));

      // Act — openDatabase fails after the 500ms wait
      const promise = recoverFromCorruption();
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when performFullRebuild throws', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(performFullRebuild).mockRejectedValue(new Error('Rebuild failed'));

      // Act
      const promise = recoverFromCorruption();
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      // Assert
      expect(result).toBe(false);
    });

    it('should wait 500ms between clear and reopen', async () => {
      // Arrange
      vi.mocked(clearIndexedDB).mockResolvedValue(undefined);
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getAllIndexedItems).mockResolvedValue([{ url: 'https://a.com' } as any]);

      // Act
      const promise = recoverFromCorruption();
      // Advance past the 500ms wait
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      // Assert
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // handleQuotaExceeded
  // ==========================================================================

  describe('handleQuotaExceeded', () => {
    it('should return true when expired favicons are cleared successfully', async () => {
      // Arrange
      vi.mocked(clearExpiredFavicons).mockResolvedValue(5);

      // Act
      const result = await handleQuotaExceeded();

      // Assert
      expect(result).toBe(true);
      expect(clearExpiredFavicons).toHaveBeenCalledTimes(1);
    });

    it('should return false when clearing favicons throws', async () => {
      // Arrange
      vi.mocked(clearExpiredFavicons).mockRejectedValue(new Error('Quota cleanup boom'));

      // Act
      const result = await handleQuotaExceeded();

      // Assert
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // ensureReady
  // ==========================================================================

  describe('ensureReady', () => {
    it('should return true when health check passes', async () => {
      // Arrange
      mockHealthyIndex();

      // Act
      const result = await ensureReady();

      // Assert
      expect(result).toBe(true);
    });

    it('should trigger self-heal and return true when heal succeeds', async () => {
      // Arrange — first checkHealth sees empty, selfHeal rebuilds, second checkHealth is healthy
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems)
        .mockResolvedValueOnce([]) // ensureReady → checkHealth (empty)
        .mockResolvedValueOnce([]) // selfHeal step 2 (empty → triggers rebuild)
        .mockResolvedValueOnce(Array(50).fill({ url: 'https://example.com' })); // selfHeal → checkHealth
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act
      const result = await ensureReady();

      // Assert
      expect(result).toBe(true);
      expect(performanceTracker.recordSelfHeal).toHaveBeenCalledTimes(1);
    });

    it('should return false when health fails and heal fails', async () => {
      // Arrange — always empty
      vi.mocked(openDatabase).mockResolvedValue({} as IDBDatabase);
      vi.mocked(getAllIndexedItems).mockResolvedValue([]);
      vi.mocked(performFullRebuild).mockResolvedValue(undefined);
      vi.mocked(getForceRebuildFlag).mockResolvedValue(false);

      // Act
      const result = await ensureReady();

      // Assert
      expect(result).toBe(false);
      expect(performanceTracker.recordSelfHeal).not.toHaveBeenCalled();
    });

    it('should return true when unhealthy but items exist (non-critical)', async () => {
      // Arrange — few items (below MIN_EXPECTED_ITEMS) but not zero
      // ensureReady only self-heals when indexedItems === 0
      mockHealthyIndex(5); // below threshold but not zero

      // Act
      const result = await ensureReady();

      // Assert — isHealthy is false (few items), but indexedItems !== 0 → returns isHealthy directly
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // retryWithBackoff (tested through safeDatabaseOperation)
  // ==========================================================================

  describe('retryWithBackoff (via safeDatabaseOperation)', () => {
    it('should use exponential backoff delays between retries', async () => {
      // Arrange — openDatabase fails 3 times (MAX_RETRY_ATTEMPTS), exhausting all retries
      vi.mocked(openDatabase).mockRejectedValue(new Error('persistent failure'));
      const operation = vi.fn().mockResolvedValue('data');

      // Act
      const promise = safeDatabaseOperation(operation, 'fallback', 'backoff test');

      // Advance through backoff delays: 1000ms (attempt 1→2), 2000ms (attempt 2→3)
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;

      // Assert
      expect(result).toBe('fallback');
      // openDatabase called 3 times (MAX_RETRY_ATTEMPTS)
      expect(openDatabase).toHaveBeenCalledTimes(3);
    });

    it('should succeed on second attempt after first failure', async () => {
      // Arrange
      vi.mocked(openDatabase)
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue({} as IDBDatabase);
      const operation = vi.fn().mockResolvedValue('success');

      // Act
      const promise = safeDatabaseOperation(operation, 'fallback', 'retry test');
      // Advance past first backoff delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      // Assert
      expect(result).toBe('success');
    });

    it('should succeed on third attempt after two failures', async () => {
      // Arrange
      vi.mocked(openDatabase)
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue({} as IDBDatabase);
      const operation = vi.fn().mockResolvedValue('third-time-charm');

      // Act
      const promise = safeDatabaseOperation(operation, 'fallback', 'retry test');
      // Advance past backoff delays: 1000ms + 2000ms
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      // Assert
      expect(result).toBe('third-time-charm');
      expect(openDatabase).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // Module exports verification
  // ==========================================================================

  describe('module exports', () => {
    it('should export checkHealth as a function', () => {
      expect(typeof checkHealth).toBe('function');
    });

    it('should export selfHeal as a function', () => {
      expect(typeof selfHeal).toBe('function');
    });

    it('should export clearAndRebuild as a function', () => {
      expect(typeof clearAndRebuild).toBe('function');
    });

    it('should export startHealthMonitoring as a function', () => {
      expect(typeof startHealthMonitoring).toBe('function');
    });

    it('should export stopHealthMonitoring as a function', () => {
      expect(typeof stopHealthMonitoring).toBe('function');
    });

    it('should export getLastHealthStatus as a function', () => {
      expect(typeof getLastHealthStatus).toBe('function');
    });

    it('should export gracefulDegrade as a function', () => {
      expect(typeof gracefulDegrade).toBe('function');
    });

    it('should export safeDatabaseOperation as a function', () => {
      expect(typeof safeDatabaseOperation).toBe('function');
    });

    it('should export recoverFromCorruption as a function', () => {
      expect(typeof recoverFromCorruption).toBe('function');
    });

    it('should export handleQuotaExceeded as a function', () => {
      expect(typeof handleQuotaExceeded).toBe('function');
    });

    it('should export ensureReady as a function', () => {
      expect(typeof ensureReady).toBe('function');
    });
  });
});
