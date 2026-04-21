/**
 * ollama-handlers — branch-coverage unit tests.
 *
 * These tests exercise error/success branches of each handler registered by
 * `registerOllamaHandlers` without booting the full service worker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandlerRegistry } from '../registry';
import { registerOllamaHandlers } from '../ollama-handlers';
import { chromeMock } from '../../../__test-utils__/chrome-mock';

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  errorMeta: (err: unknown) => ({ error: String(err) }),
}));

vi.mock('../../database', () => ({
  getAllIndexedItems: vi.fn(),
  saveIndexedItem: vi.fn(),
}));

vi.mock('../../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn(),
  },
}));

vi.mock('../../embedding-processor', () => ({
  embeddingProcessor: {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getProgress: vi.fn(() => ({ state: 'idle', processed: 0, total: 0 })),
  },
}));

vi.mock('../../ai-keyword-cache', () => ({
  loadCache: vi.fn(),
  getCacheStats: vi.fn(),
  clearAIKeywordCache: vi.fn(),
}));

function dispatch(
  registry: MessageHandlerRegistry,
  msg: { type: string; [k: string]: unknown },
) {
  return new Promise<Record<string, unknown>>((resolve) => {
    void registry.dispatch(
      msg,
      {} as chrome.runtime.MessageSender,
      (response: unknown) => resolve(response as Record<string, unknown>),
    );
  });
}

describe('registerOllamaHandlers', () => {
  let registry: MessageHandlerRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', chromeMock().withRuntime().withStorage().build());
    registry = new MessageHandlerRegistry();
    registerOllamaHandlers(registry);
  });

  it('registers every expected message type', () => {
    const types = registry.registeredTypes;
    expect(types).toEqual(expect.arrayContaining([
      'GET_EMBEDDING_STATS',
      'CLEAR_ALL_EMBEDDINGS',
      'START_EMBEDDING_PROCESSOR',
      'PAUSE_EMBEDDING_PROCESSOR',
      'RESUME_EMBEDDING_PROCESSOR',
      'GET_EMBEDDING_PROGRESS',
      'GET_AI_CACHE_STATS',
      'CLEAR_AI_CACHE',
    ]));
  });

  describe('GET_EMBEDDING_STATS', () => {
    it('counts items with embeddings, sums dims, reports model', async () => {
      const { getAllIndexedItems } = await import('../../database');
      const { SettingsManager } = await import('../../../core/settings');
      (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { embedding: [1, 2, 3, 4] },
        { embedding: [] },
        {},
      ]);
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>).mockReturnValueOnce('custom-model');

      const res = await dispatch(registry, { type: 'GET_EMBEDDING_STATS' });

      expect(res).toMatchObject({
        status: 'OK',
        total: 3,
        withEmbeddings: 1,
        estimatedBytes: 4 * 8,
        embeddingModel: 'custom-model',
      });
    });

    it('falls back to default model when SettingsManager returns undefined', async () => {
      const { getAllIndexedItems } = await import('../../database');
      const { SettingsManager } = await import('../../../core/settings');
      (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);

      const res = await dispatch(registry, { type: 'GET_EMBEDDING_STATS' });

      expect(res.embeddingModel).toBe('mxbai-embed-large');
      expect(res.total).toBe(0);
      expect(res.withEmbeddings).toBe(0);
      expect(res.estimatedBytes).toBe(0);
    });

    it('returns ERROR when database access fails', async () => {
      const { getAllIndexedItems } = await import('../../database');
      (getAllIndexedItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));

      const res = await dispatch(registry, { type: 'GET_EMBEDDING_STATS' });

      expect(res).toEqual({ status: 'ERROR', message: 'db down' });
    });
  });

  describe('CLEAR_ALL_EMBEDDINGS', () => {
    it('clears only items that have embeddings and reports the count', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      const { getAllIndexedItems, saveIndexedItem } = await import('../../database');
      const items = [
        { embedding: [1, 2] },
        { embedding: undefined },
        { embedding: [] },
        { embedding: [3] },
      ];
      (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce(items);

      const res = await dispatch(registry, { type: 'CLEAR_ALL_EMBEDDINGS' });

      expect(embeddingProcessor.stop).toHaveBeenCalled();
      expect(res).toEqual({ status: 'OK', cleared: 2 });
      expect(saveIndexedItem).toHaveBeenCalledTimes(2);
      expect(items[0].embedding).toBeUndefined();
      expect(items[3].embedding).toBeUndefined();
    });

    it('returns OK with cleared=0 when no items have embeddings', async () => {
      const { getAllIndexedItems, saveIndexedItem } = await import('../../database');
      (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { embedding: undefined },
        { embedding: [] },
      ]);

      const res = await dispatch(registry, { type: 'CLEAR_ALL_EMBEDDINGS' });

      expect(res).toEqual({ status: 'OK', cleared: 0 });
      expect(saveIndexedItem).not.toHaveBeenCalled();
    });

    it('returns ERROR when saveIndexedItem rejects', async () => {
      const { getAllIndexedItems, saveIndexedItem } = await import('../../database');
      (getAllIndexedItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ embedding: [1] }]);
      (saveIndexedItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('save blew up'));

      const res = await dispatch(registry, { type: 'CLEAR_ALL_EMBEDDINGS' });

      expect(res).toEqual({ status: 'ERROR', message: 'save blew up' });
    });
  });

  describe('START / PAUSE / RESUME / GET_EMBEDDING_PROGRESS', () => {
    it('START returns progress on success', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({ state: 'running' });

      const res = await dispatch(registry, { type: 'START_EMBEDDING_PROCESSOR' });

      expect(embeddingProcessor.start).toHaveBeenCalled();
      expect(res).toEqual({ status: 'OK', progress: { state: 'running' } });
    });

    it('START returns ERROR when start throws', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('start fail'));

      const res = await dispatch(registry, { type: 'START_EMBEDDING_PROCESSOR' });

      expect(res).toEqual({ status: 'ERROR', message: 'start fail' });
    });

    it('PAUSE returns progress on success', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({ state: 'paused' });

      const res = await dispatch(registry, { type: 'PAUSE_EMBEDDING_PROCESSOR' });

      expect(embeddingProcessor.pause).toHaveBeenCalled();
      expect(res).toEqual({ status: 'OK', progress: { state: 'paused' } });
    });

    it('PAUSE returns ERROR when pause throws', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.pause as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('pause boom');
      });

      const res = await dispatch(registry, { type: 'PAUSE_EMBEDDING_PROCESSOR' });

      expect(res).toEqual({ status: 'ERROR', message: 'pause boom' });
    });

    it('RESUME returns progress on success', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({ state: 'running' });

      const res = await dispatch(registry, { type: 'RESUME_EMBEDDING_PROCESSOR' });

      expect(embeddingProcessor.resume).toHaveBeenCalled();
      expect(res).toEqual({ status: 'OK', progress: { state: 'running' } });
    });

    it('RESUME returns ERROR when resume throws', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.resume as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('resume boom');
      });

      const res = await dispatch(registry, { type: 'RESUME_EMBEDDING_PROCESSOR' });

      expect(res).toEqual({ status: 'ERROR', message: 'resume boom' });
    });

    it('GET_EMBEDDING_PROGRESS returns progress on success', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockReturnValueOnce({ state: 'idle' });

      const res = await dispatch(registry, { type: 'GET_EMBEDDING_PROGRESS' });

      expect(res).toEqual({ status: 'OK', progress: { state: 'idle' } });
    });

    it('GET_EMBEDDING_PROGRESS returns ERROR when getProgress throws', async () => {
      const { embeddingProcessor } = await import('../../embedding-processor');
      (embeddingProcessor.getProgress as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('progress boom');
      });

      const res = await dispatch(registry, { type: 'GET_EMBEDDING_PROGRESS' });

      expect(res).toEqual({ status: 'ERROR', message: 'progress boom' });
    });
  });

  describe('GET_AI_CACHE_STATS / CLEAR_AI_CACHE', () => {
    it('GET_AI_CACHE_STATS returns stats on success', async () => {
      const { loadCache, getCacheStats } = await import('../../ai-keyword-cache');
      (loadCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      (getCacheStats as ReturnType<typeof vi.fn>).mockReturnValueOnce({ hits: 5, size: 2 });

      const res = await dispatch(registry, { type: 'GET_AI_CACHE_STATS' });

      expect(loadCache).toHaveBeenCalled();
      expect(res).toEqual({ status: 'OK', hits: 5, size: 2 });
    });

    it('GET_AI_CACHE_STATS returns ERROR when loadCache rejects', async () => {
      const { loadCache } = await import('../../ai-keyword-cache');
      (loadCache as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('cache io fail'));

      const res = await dispatch(registry, { type: 'GET_AI_CACHE_STATS' });

      expect(res).toEqual({ status: 'ERROR', message: 'cache io fail' });
    });

    it('CLEAR_AI_CACHE spreads cleared result into response', async () => {
      const { clearAIKeywordCache } = await import('../../ai-keyword-cache');
      (clearAIKeywordCache as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cleared: 7 });

      const res = await dispatch(registry, { type: 'CLEAR_AI_CACHE' });

      expect(res).toEqual({ status: 'OK', cleared: 7 });
    });

    it('CLEAR_AI_CACHE returns ERROR when clear fails', async () => {
      const { clearAIKeywordCache } = await import('../../ai-keyword-cache');
      (clearAIKeywordCache as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('clear fail'));

      const res = await dispatch(registry, { type: 'CLEAR_AI_CACHE' });

      expect(res).toEqual({ status: 'ERROR', message: 'clear fail' });
    });
  });
});
