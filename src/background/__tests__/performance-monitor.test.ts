import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    forComponent: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { performanceTracker, getPerformanceMetrics } from '../performance-monitor';

describe('performanceTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    performanceTracker.reset();
  });

  describe('initial state', () => {
    it('should have correct defaults after reset', () => {
      const metrics = performanceTracker.getMetrics();
      expect(metrics.searchCount).toBe(0);
      expect(metrics.serviceWorkerRestarts).toBe(0);
      expect(metrics.healthCheckCount).toBe(0);
      expect(metrics.selfHealCount).toBe(0);
      expect(metrics.lastRestartTime).toBeNull();
      expect(metrics.startTime).toBeGreaterThan(0);
    });
  });

  describe('recordSearch', () => {
    it('should increment searchCount', () => {
      performanceTracker.recordSearch(100);
      expect(performanceTracker.getMetrics().searchCount).toBe(1);
    });

    it('should track multiple searches', () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(200);
      performanceTracker.recordSearch(300);
      expect(performanceTracker.getMetrics().searchCount).toBe(3);
    });

    it('should compute average search time', () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(200);
      expect(performanceTracker.getMetrics().averageSearchTimeMs).toBeCloseTo(150, 1);
    });

    it('should track min search time', () => {
      performanceTracker.recordSearch(300);
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(200);
      expect(performanceTracker.getMetrics().minSearchTimeMs).toBe(100);
    });

    it('should track max search time', () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(500);
      performanceTracker.recordSearch(200);
      expect(performanceTracker.getMetrics().maxSearchTimeMs).toBe(500);
    });

    it('should track last search time', () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordSearch(250);
      expect(performanceTracker.getMetrics().lastSearchTimeMs).toBe(250);
    });

    it('should keep only last 100 searches', () => {
      for (let i = 0; i < 110; i++) {
        performanceTracker.recordSearch(i);
      }
      expect(performanceTracker.getMetrics().searchCount).toBe(100);
    });
  });

  describe('recordIndexing', () => {
    it('should update lastIndexDurationMs', () => {
      performanceTracker.recordIndexing(500, 1000);
      expect(performanceTracker.getMetrics().lastIndexDurationMs).toBe(500);
    });

    it('should update totalItemsIndexed', () => {
      performanceTracker.recordIndexing(200, 500);
      expect(performanceTracker.getMetrics().totalItemsIndexed).toBe(500);
    });
  });

  describe('recordRestart', () => {
    it('should increment serviceWorkerRestarts', () => {
      performanceTracker.recordRestart();
      expect(performanceTracker.getMetrics().serviceWorkerRestarts).toBe(1);
    });

    it('should record lastRestartTime', () => {
      const before = Date.now();
      performanceTracker.recordRestart();
      const after = Date.now();
      const restartTime = performanceTracker.getMetrics().lastRestartTime;
      expect(restartTime).not.toBeNull();
      expect(restartTime!).toBeGreaterThanOrEqual(before);
      expect(restartTime!).toBeLessThanOrEqual(after);
    });

    it('should count multiple restarts', () => {
      performanceTracker.recordRestart();
      performanceTracker.recordRestart();
      expect(performanceTracker.getMetrics().serviceWorkerRestarts).toBe(2);
    });
  });

  describe('recordHealthCheck', () => {
    it('should increment healthCheckCount', () => {
      performanceTracker.recordHealthCheck();
      performanceTracker.recordHealthCheck();
      expect(performanceTracker.getMetrics().healthCheckCount).toBe(2);
    });
  });

  describe('recordSelfHeal', () => {
    it('should increment selfHealCount', () => {
      performanceTracker.recordSelfHeal();
      expect(performanceTracker.getMetrics().selfHealCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset all metrics to zero', () => {
      performanceTracker.recordSearch(100);
      performanceTracker.recordRestart();
      performanceTracker.recordHealthCheck();
      performanceTracker.recordSelfHeal();
      performanceTracker.recordIndexing(1000, 500);

      performanceTracker.reset();

      const metrics = performanceTracker.getMetrics();
      expect(metrics.searchCount).toBe(0);
      expect(metrics.serviceWorkerRestarts).toBe(0);
      expect(metrics.healthCheckCount).toBe(0);
      expect(metrics.selfHealCount).toBe(0);
      expect(metrics.lastIndexDurationMs).toBe(0);
      expect(metrics.lastRestartTime).toBeNull();
    });
  });

  describe('getMetrics', () => {
    it('should return uptimeMs greater than 0', () => {
      const metrics = performanceTracker.getMetrics();
      expect(metrics.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return zero averageSearchTimeMs with no searches', () => {
      expect(performanceTracker.getMetrics().averageSearchTimeMs).toBe(0);
    });
  });

  describe('getPerformanceMetrics (exported function)', () => {
    it('should return the same data as performanceTracker.getMetrics()', () => {
      performanceTracker.recordSearch(42);
      const fromFunction = getPerformanceMetrics();
      const fromTracker = performanceTracker.getMetrics();
      expect(fromFunction.searchCount).toBe(fromTracker.searchCount);
      expect(fromFunction.lastSearchTimeMs).toBe(fromTracker.lastSearchTimeMs);
    });
  });
});

import { formatUptime, formatMetricsForDisplay } from '../performance-monitor';
import type { PerformanceMetrics } from '../performance-monitor';

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
      searchCount: 42,
      averageSearchTimeMs: 12.5,
      minSearchTimeMs: 5.0,
      maxSearchTimeMs: 30.0,
      lastSearchTimeMs: 10.0,
      totalItemsIndexed: 1000,
      lastIndexDurationMs: 500,
      memoryUsedMB: 64,
      memoryTotalMB: 128,
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
    expect(display['Search Count']).toBe('42');
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
});
