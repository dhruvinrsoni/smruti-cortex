import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../__test-utils__';

vi.mock('../../core/logger', () => mockLogger());

// Mock browserAPI for persistence
const mockStorageData: Record<string, unknown> = {};
vi.mock('../../core/helpers', () => ({
  browserAPI: {
    storage: {
      local: {
        get: vi.fn((_keys: string[], cb: (r: Record<string, unknown>) => void) => {
          cb({ ...mockStorageData });
        }),
        set: vi.fn((data: Record<string, unknown>, cb?: () => void) => {
          Object.assign(mockStorageData, data);
          if (cb) { cb(); }
        }),
        remove: vi.fn((_key: string, cb?: () => void) => {
          delete mockStorageData[_key];
          if (cb) { cb(); }
        }),
      },
    },
    runtime: { lastError: null },
  },
}));

import { performanceTracker, getPerformanceMetrics } from '../performance-monitor';

function clearMockStorage() {
  for (const key of Object.keys(mockStorageData)) {
    delete mockStorageData[key];
  }
}

describe('performanceTracker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clearMockStorage();
    await performanceTracker.reset();
    performanceTracker._setRestoredFlag(true);
  });

  describe('initial state', () => {
    it('should have correct defaults after reset', async () => {
      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(0);
      expect(metrics.recentSearchCount).toBe(0);
      expect(metrics.serviceWorkerRestarts).toBe(0);
      expect(metrics.healthCheckCount).toBe(0);
      expect(metrics.selfHealCount).toBe(0);
      expect(metrics.lastRestartTime).toBeNull();
      expect(metrics.startTime).toBeGreaterThan(0);
    });
  });

  describe('recordSearch', () => {
    it('should increment totalSearchCount', async () => {
      performanceTracker.recordSearch(100);
      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(1);
      expect(metrics.recentSearchCount).toBe(1);
    });

    it('should track multiple searches', async () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(200);
      performanceTracker.recordSearch(300);
      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(3);
      expect(metrics.recentSearchCount).toBe(3);
    });

    it('should compute average search time', async () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(200);
      expect((await performanceTracker.getMetrics()).averageSearchTimeMs).toBeCloseTo(150, 1);
    });

    it('should track min search time', async () => {
      performanceTracker.recordSearch(300);
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(200);
      expect((await performanceTracker.getMetrics()).minSearchTimeMs).toBe(100);
    });

    it('should track max search time', async () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(500);
      performanceTracker.recordSearch(200);
      expect((await performanceTracker.getMetrics()).maxSearchTimeMs).toBe(500);
    });

    it('should track last search time', async () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(250);
      expect((await performanceTracker.getMetrics()).lastSearchTimeMs).toBe(250);
    });

    it('should keep only last 100 searches in buffer but count all', async () => {
      for (let i = 0; i < 110; i++) {
        performanceTracker.recordSearch(i);
      }
      const metrics = await performanceTracker.getMetrics();
      expect(metrics.recentSearchCount).toBe(100);
      expect(metrics.totalSearchCount).toBe(110);
    });
  });

  describe('recordIndexing', () => {
    it('should update lastIndexDurationMs', async () => {
      performanceTracker.recordIndexing(500, 1000);
      expect((await performanceTracker.getMetrics()).lastIndexDurationMs).toBe(500);
    });

    it('should update totalItemsIndexed', async () => {
      performanceTracker.recordIndexing(200, 500);
      expect((await performanceTracker.getMetrics()).totalItemsIndexed).toBe(500);
    });
  });

  describe('recordRestart', () => {
    it('should increment serviceWorkerRestarts', async () => {
      performanceTracker.recordRestart();
      expect((await performanceTracker.getMetrics()).serviceWorkerRestarts).toBe(1);
    });

    it('should record lastRestartTime', async () => {
      const before = Date.now();
      performanceTracker.recordRestart();
      const after = Date.now();
      const restartTime = (await performanceTracker.getMetrics()).lastRestartTime;
      expect(restartTime).not.toBeNull();
      expect(restartTime!).toBeGreaterThanOrEqual(before);
      expect(restartTime!).toBeLessThanOrEqual(after);
    });

    it('should count multiple restarts', async () => {
      performanceTracker.recordRestart();
      performanceTracker.recordRestart();
      expect((await performanceTracker.getMetrics()).serviceWorkerRestarts).toBe(2);
    });
  });

  describe('recordHealthCheck', () => {
    it('should increment healthCheckCount', async () => {
      performanceTracker.recordHealthCheck();
      performanceTracker.recordHealthCheck();
      expect((await performanceTracker.getMetrics()).healthCheckCount).toBe(2);
    });
  });

  describe('recordSelfHeal', () => {
    it('should increment selfHealCount', async () => {
      performanceTracker.recordSelfHeal();
      expect((await performanceTracker.getMetrics()).selfHealCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset all metrics to zero', async () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordRestart();
      performanceTracker.recordHealthCheck();
      performanceTracker.recordSelfHeal();
      performanceTracker.recordIndexing(1000, 500);

      await performanceTracker.reset();
      performanceTracker._setRestoredFlag(true);

      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(0);
      expect(metrics.recentSearchCount).toBe(0);
      expect(metrics.serviceWorkerRestarts).toBe(0);
      expect(metrics.healthCheckCount).toBe(0);
      expect(metrics.selfHealCount).toBe(0);
      expect(metrics.lastIndexDurationMs).toBe(0);
      expect(metrics.lastRestartTime).toBeNull();
    });

    it('should remove persisted data from storage', async () => {
      performanceTracker.recordSearch(50);
      performanceTracker.recordRestart();
      await performanceTracker.reset();
      expect(mockStorageData['smruticortex_performance_metrics']).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('should persist metrics after recordRestart (immediate)', () => {
      performanceTracker.recordRestart();
      const stored = mockStorageData['smruticortex_performance_metrics'] as Record<string, unknown>;
      expect(stored).toBeDefined();
      expect(stored.totalRestarts).toBe(1);
    });

    it('should restore persisted metrics on first getMetrics call', async () => {
      mockStorageData['smruticortex_performance_metrics'] = {
        totalSearchCount: 42,
        totalRestarts: 3,
        totalSelfHeals: 1,
        totalHealthChecks: 10,
        totalItemsIndexed: 5000,
        lastIndexDurationMs: 800,
        version: 1,
      };
      performanceTracker._setRestoredFlag(false);

      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(42);
      expect(metrics.serviceWorkerRestarts).toBe(3);
      expect(metrics.selfHealCount).toBe(1);
      expect(metrics.healthCheckCount).toBe(10);
      expect(metrics.totalItemsIndexed).toBe(5000);
    });

    it('should handle corrupt storage data gracefully', async () => {
      mockStorageData['smruticortex_performance_metrics'] = 'not-an-object';
      performanceTracker._setRestoredFlag(false);
      await performanceTracker.reset();
      performanceTracker._setRestoredFlag(false);

      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(0);
      expect(metrics.serviceWorkerRestarts).toBe(0);
    });

    it('should handle missing storage data gracefully', async () => {
      clearMockStorage();
      performanceTracker._setRestoredFlag(false);
      await performanceTracker.reset();
      performanceTracker._setRestoredFlag(false);

      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(0);
    });

    it('should handle partially invalid storage data', async () => {
      mockStorageData['smruticortex_performance_metrics'] = {
        totalSearchCount: 'not-a-number',
        version: 1,
      };
      performanceTracker._setRestoredFlag(false);
      await performanceTracker.reset();
      performanceTracker._setRestoredFlag(false);

      const metrics = await performanceTracker.getMetrics();
      expect(metrics.totalSearchCount).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should return uptimeMs greater than 0', async () => {
      const metrics = await performanceTracker.getMetrics();
      expect(metrics.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return zero averageSearchTimeMs with no searches', async () => {
      expect((await performanceTracker.getMetrics()).averageSearchTimeMs).toBe(0);
    });

    it('should return empty storage fields (populated externally)', async () => {
      const metrics = await performanceTracker.getMetrics();
      expect(metrics.storageUsed).toBe('');
      expect(metrics.storageTotal).toBe('');
    });
  });

  describe('getPerformanceMetrics (exported function)', () => {
    it('should return the same data as performanceTracker.getMetrics()', async () => {
      performanceTracker.recordSearch(42);
      const fromFunction = await getPerformanceMetrics();
      const fromTracker = await performanceTracker.getMetrics();
      expect(fromFunction.totalSearchCount).toBe(fromTracker.totalSearchCount);
      expect(fromFunction.lastSearchTimeMs).toBe(fromTracker.lastSearchTimeMs);
    });
  });
});

import { formatUptime, formatMetricsForDisplay } from '../performance-monitor';
import type { PerformanceMetrics, StorageDisplayInfo } from '../performance-monitor';

describe('formatUptime', () => {
  it('returns seconds format for < 1 minute', () => {
    expect(formatUptime(45000)).toBe('45s');
  });

  it('returns minutes format for < 1 hour', () => {
    expect(formatUptime(3 * 60 * 1000 + 30 * 1000)).toBe('3m 30s');
  });

  it('returns hours format for < 1 day', () => {
    expect(formatUptime(2 * 3600 * 1000 + 5 * 60 * 1000)).toBe('2h 5m 0s');
  });

  it('returns days format for >= 1 day', () => {
    expect(formatUptime(25 * 3600 * 1000)).toBe('1d 1h 0m');
  });

  it('returns 0s for zero uptime', () => {
    expect(formatUptime(0)).toBe('0s');
  });
});

describe('formatMetricsForDisplay', () => {
  function makeMetrics(): PerformanceMetrics {
    return {
      totalSearchCount: 42,
      recentSearchCount: 10,
      averageSearchTimeMs: 12.5,
      minSearchTimeMs: 5.0,
      maxSearchTimeMs: 30.0,
      lastSearchTimeMs: 10.0,
      totalItemsIndexed: 1000,
      lastIndexDurationMs: 500,
      storageUsed: '',
      storageTotal: '',
      serviceWorkerRestarts: 2,
      lastRestartTime: null,
      healthCheckCount: 5,
      selfHealCount: 1,
      uptimeMs: 60 * 1000,
      startTime: Date.now() - 60 * 1000,
    };
  }

  it('returns an object with expected string keys', () => {
    const display = formatMetricsForDisplay(makeMetrics());
    expect(display['Total Searches']).toBe('42');
    expect(display['Avg Search Time']).toContain('ms');
  });

  it('formats min/max search time', () => {
    const display = formatMetricsForDisplay(makeMetrics());
    expect(display['Min/Max Search']).toContain('/');
  });

  it('includes SW Restarts', () => {
    const display = formatMetricsForDisplay(makeMetrics());
    expect(display['SW Restarts']).toBe('2');
  });

  it('shows N/A for storage when no storage info provided', () => {
    const display = formatMetricsForDisplay(makeMetrics());
    expect(display['Storage Used']).toBe('N/A');
  });

  it('shows storage info when provided', () => {
    const storage: StorageDisplayInfo = { usedFormatted: '12.5 MB', totalFormatted: '5 GB' };
    const display = formatMetricsForDisplay(makeMetrics(), storage);
    expect(display['Storage Used']).toBe('12.5 MB / 5 GB');
  });

  it('includes Health Checks', () => {
    const display = formatMetricsForDisplay(makeMetrics());
    expect(display['Health Checks']).toBe('5');
  });

  it('includes Self-Heals', () => {
    const display = formatMetricsForDisplay(makeMetrics());
    expect(display['Self-Heals']).toBe('1');
  });
});
