import { describe, it, expect, vi } from 'vitest';

describe('palette-messages extra cases', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('formats GET_EMBEDDING_PROGRESS with null ETA and truncates long lastError', async () => {
    const { formatPaletteDiagnosticToast } = await import('../palette-messages');

    const longError = 'X'.repeat(2000);
    const msg = formatPaletteDiagnosticToast('GET_EMBEDDING_PROGRESS', {
      status: 'OK',
      progress: { state: 'running', withEmbeddings: 42, total: 100, remaining: 58, estimatedMinutes: null, lastError: longError },
    } as any);

    expect(msg).toContain('Embedding job');
    expect(msg).toContain('42/100');
    // ensure truncation for long message
    expect(msg.length).toBeLessThan(1200);
  });

  it('formats GET_EMBEDDING_STATS and shows MB correctly', async () => {
    const { formatPaletteDiagnosticToast } = await import('../palette-messages');

    const msg = formatPaletteDiagnosticToast('GET_EMBEDDING_STATS', {
      status: 'OK',
      total: 1000,
      withEmbeddings: 100,
      estimatedBytes: 24 * 1024 * 1024,
    } as any);

    expect(msg).toContain('Embeddings');
    expect(msg).toContain('24 MB');
  });

  it('formats GET_PERFORMANCE_METRICS when metrics are null', async () => {
    const { formatPaletteDiagnosticToast } = await import('../palette-messages');

    const msg = formatPaletteDiagnosticToast('GET_PERFORMANCE_METRICS', null);
    expect(msg).toBeNull();
  });
});
