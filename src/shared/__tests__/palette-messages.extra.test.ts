import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatPaletteDiagnosticToast, isPaletteDiagnosticMessageType } from '../palette-messages';

describe('palette-messages branch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns null for null response', () => {
    expect(formatPaletteDiagnosticToast('GET_STORAGE_QUOTA', null)).toBeNull();
  });

  it('returns null for undefined response', () => {
    expect(formatPaletteDiagnosticToast('GET_HEALTH_STATUS', undefined)).toBeNull();
  });

  it('returns null for non-OK status', () => {
    expect(formatPaletteDiagnosticToast('GET_HEALTH_STATUS', { status: 'ERROR' })).toBeNull();
  });

  it('accepts lowercase ok status', () => {
    const msg = formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
      status: 'ok',
      data: { isHealthy: true },
    });
    expect(msg).toContain('Healthy');
  });

  it('returns null for unknown message type', () => {
    expect(formatPaletteDiagnosticToast('UNKNOWN_TYPE', { status: 'OK' })).toBeNull();
  });

  describe('GET_STORAGE_QUOTA branches', () => {
    it('returns null when data is undefined', () => {
      expect(formatPaletteDiagnosticToast('GET_STORAGE_QUOTA', { status: 'OK' })).toBeNull();
    });

    it('omits percentage when total is 0', () => {
      const msg = formatPaletteDiagnosticToast('GET_STORAGE_QUOTA', {
        status: 'OK',
        data: { usedFormatted: '1 MB', totalFormatted: '0 B', itemCount: 5, percentage: 0, total: 0 },
      });
      expect(msg).toContain('1 MB');
      expect(msg).not.toContain('of quota');
    });

    it('omits percentage when percentage is missing', () => {
      const msg = formatPaletteDiagnosticToast('GET_STORAGE_QUOTA', {
        status: 'OK',
        data: { usedFormatted: '2 MB', totalFormatted: '5 GB', itemCount: 10 },
      });
      expect(msg).toContain('2 MB');
      expect(msg).not.toContain('of quota');
    });

    it('shows ? for missing formatted fields', () => {
      const msg = formatPaletteDiagnosticToast('GET_STORAGE_QUOTA', {
        status: 'OK',
        data: { itemCount: 0 },
      });
      expect(msg).toContain('?');
      expect(msg).toContain('0 indexed items');
    });
  });

  describe('GET_HEALTH_STATUS branches', () => {
    it('returns Health: OK when data is null', () => {
      const msg = formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
        status: 'OK',
        data: null,
      });
      expect(msg).toBe('Health: OK');
    });

    it('omits items count when indexedItems is not a number', () => {
      const msg = formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
        status: 'OK',
        data: { isHealthy: true },
      });
      expect(msg).toContain('Healthy');
      expect(msg).not.toContain('indexed items');
    });

    it('omits issue hint when isHealthy is false but issues array is empty', () => {
      const msg = formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
        status: 'OK',
        data: { isHealthy: false, indexedItems: 3, issues: [] },
      });
      expect(msg).toContain('Issues');
      expect(msg).not.toContain('…');
    });

    it('shows exactly two issues without ellipsis when issues.length === 2', () => {
      const msg = formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
        status: 'OK',
        data: { isHealthy: false, issues: ['issue1', 'issue2'] },
      });
      expect(msg).toContain('issue1; issue2');
      expect(msg).not.toContain('…');
    });
  });

  describe('GET_EMBEDDING_STATS branches', () => {
    it('returns null when total is undefined', () => {
      expect(formatPaletteDiagnosticToast('GET_EMBEDDING_STATS', {
        status: 'OK',
        withEmbeddings: 10,
      })).toBeNull();
    });

    it('returns null when withEmbeddings is undefined', () => {
      expect(formatPaletteDiagnosticToast('GET_EMBEDDING_STATS', {
        status: 'OK',
        total: 100,
      })).toBeNull();
    });

    it('omits model when not provided', () => {
      const msg = formatPaletteDiagnosticToast('GET_EMBEDDING_STATS', {
        status: 'OK',
        total: 50,
        withEmbeddings: 20,
      });
      expect(msg).toContain('20 / 50');
      expect(msg).not.toContain('·');
    });

    it('omits bytes when estimatedBytes is not a number', () => {
      const msg = formatPaletteDiagnosticToast('GET_EMBEDDING_STATS', {
        status: 'OK',
        total: 50,
        withEmbeddings: 20,
        embeddingModel: 'test',
      });
      expect(msg).toContain('test');
      expect(msg).not.toContain('vector data');
    });
  });

  describe('GET_EMBEDDING_PROGRESS branches', () => {
    it('returns null when progress is null', () => {
      expect(formatPaletteDiagnosticToast('GET_EMBEDDING_PROGRESS', {
        status: 'OK',
        progress: null,
      })).toBeNull();
    });

    it('returns null when progress is undefined', () => {
      expect(formatPaletteDiagnosticToast('GET_EMBEDDING_PROGRESS', {
        status: 'OK',
      })).toBeNull();
    });

    it('shows ETA when estimatedMinutes is present', () => {
      const msg = formatPaletteDiagnosticToast('GET_EMBEDDING_PROGRESS', {
        status: 'OK',
        progress: {
          state: 'running',
          withEmbeddings: 10,
          total: 100,
          remaining: 90,
          estimatedMinutes: 5,
        },
      });
      expect(msg).toContain('ETA ~5 min');
    });

    it('shows lastError snippet', () => {
      const msg = formatPaletteDiagnosticToast('GET_EMBEDDING_PROGRESS', {
        status: 'OK',
        progress: {
          state: 'error',
          withEmbeddings: 0,
          total: 50,
          remaining: 50,
          lastError: 'Connection refused',
        },
      });
      expect(msg).toContain('Connection refused');
    });

    it('uses defaults for missing state/withEmbeddings/total/remaining', () => {
      const msg = formatPaletteDiagnosticToast('GET_EMBEDDING_PROGRESS', {
        status: 'OK',
        progress: {},
      });
      expect(msg).toContain('unknown');
      expect(msg).toContain('0/0');
      expect(msg).toContain('0 left');
    });
  });

  describe('GET_PERFORMANCE_METRICS branches', () => {
    it('returns null when formatted is not an object', () => {
      expect(formatPaletteDiagnosticToast('GET_PERFORMANCE_METRICS', {
        status: 'OK',
        formatted: 'not-an-object',
      })).toBeNull();
    });

    it('returns null when formatted is missing', () => {
      expect(formatPaletteDiagnosticToast('GET_PERFORMANCE_METRICS', {
        status: 'OK',
      })).toBeNull();
    });

    it('limits to 7 entries', () => {
      const formatted: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        formatted[`metric${i}`] = `${i}ms`;
      }
      const msg = formatPaletteDiagnosticToast('GET_PERFORMANCE_METRICS', {
        status: 'OK',
        formatted,
      });
      const lines = msg!.split('\n');
      expect(lines.length).toBeLessThanOrEqual(7);
    });
  });

  describe('GET_SEARCH_ANALYTICS branches', () => {
    it('returns null when totalSearches is undefined', () => {
      expect(formatPaletteDiagnosticToast('GET_SEARCH_ANALYTICS', {
        status: 'OK',
      })).toBeNull();
    });
  });

  describe('RUN_TROUBLESHOOTER branches', () => {
    it('returns null when data is undefined', () => {
      expect(formatPaletteDiagnosticToast('RUN_TROUBLESHOOTER', {
        status: 'OK',
      })).toBeNull();
    });

    it('returns null when steps is missing', () => {
      expect(formatPaletteDiagnosticToast('RUN_TROUBLESHOOTER', {
        status: 'OK',
        data: {},
      })).toBeNull();
    });

    it('handles issues-remain status (not healed, not healthy)', () => {
      const msg = formatPaletteDiagnosticToast('RUN_TROUBLESHOOTER', {
        status: 'OK',
        data: {
          steps: [{ status: 'pass' }, { status: 'fail' }],
          overallStatus: 'issues',
          totalDurationMs: 50,
        },
      });
      expect(msg).toContain('Issues remain');
      expect(msg).toContain('1/2 passed');
    });

    it('omits duration when totalDurationMs is missing', () => {
      const msg = formatPaletteDiagnosticToast('RUN_TROUBLESHOOTER', {
        status: 'OK',
        data: {
          steps: [{ status: 'pass' }],
          overallStatus: 'healthy',
        },
      });
      expect(msg).toContain('All systems healthy');
      expect(msg).not.toContain('ms)');
    });

    it('counts skipped as passed', () => {
      const msg = formatPaletteDiagnosticToast('RUN_TROUBLESHOOTER', {
        status: 'OK',
        data: {
          steps: [{ status: 'skipped' }, { status: 'pass' }],
          overallStatus: 'healthy',
        },
      });
      expect(msg).toContain('2/2 passed');
    });
  });

  describe('isPaletteDiagnosticMessageType', () => {
    it('returns true for all known types', () => {
      const knownTypes = [
        'GET_STORAGE_QUOTA', 'GET_HEALTH_STATUS', 'GET_EMBEDDING_STATS',
        'GET_EMBEDDING_PROGRESS', 'GET_PERFORMANCE_METRICS', 'GET_SEARCH_ANALYTICS',
        'RUN_TROUBLESHOOTER',
      ];
      for (const type of knownTypes) {
        expect(isPaletteDiagnosticMessageType(type)).toBe(true);
      }
    });

    it('returns false for unknown types', () => {
      expect(isPaletteDiagnosticMessageType('SEARCH_QUERY')).toBe(false);
    });
  });
});
