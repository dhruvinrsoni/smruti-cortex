/* eslint-disable @typescript-eslint/no-explicit-any */
import { MessageHandlerRegistry } from './registry';
import { Logger, errorMeta } from '../../core/logger';
import { DEFAULT_EMBEDDING_MODEL } from '../../shared/ollama-models';

const log = Logger.forComponent('OllamaHandlers');

export function registerOllamaHandlers(registry: MessageHandlerRegistry): void {
  registry.register('GET_EMBEDDING_STATS', async (_msg, _sender, sendResponse) => {
    log.debug('GET_EMBEDDING_STATS', 'GET_EMBEDDING_STATS requested');
    try {
      const { getAllIndexedItems } = await import('../database');
      const items = await getAllIndexedItems();
      const withEmbeddings = items.filter((i: any) => i.embedding && i.embedding.length > 0);
      const totalDims = withEmbeddings.reduce((sum: number, i: any) => sum + (i.embedding?.length || 0), 0);
      const estimatedBytes = totalDims * 8;
      const { SettingsManager } = await import('../../core/settings');
      const embeddingModel = SettingsManager.getSetting('embeddingModel') || DEFAULT_EMBEDDING_MODEL;
      sendResponse({
        status: 'OK',
        total: items.length,
        withEmbeddings: withEmbeddings.length,
        estimatedBytes,
        embeddingModel,
      });
    } catch (error) {
      log.error('GET_EMBEDDING_STATS', 'GET_EMBEDDING_STATS failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('CLEAR_ALL_EMBEDDINGS', async (_msg, _sender, sendResponse) => {
    log.info('CLEAR_ALL_EMBEDDINGS', '🧠 CLEAR_ALL_EMBEDDINGS requested');
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      embeddingProcessor.stop();

      const { getAllIndexedItems, saveIndexedItem } = await import('../database');
      const items = await getAllIndexedItems();
      let cleared = 0;
      for (const item of items) {
        if (item.embedding && item.embedding.length > 0) {
          item.embedding = undefined;
          await saveIndexedItem(item);
          cleared++;
        }
      }
      log.info('CLEAR_ALL_EMBEDDINGS', `✅ Cleared embeddings from ${cleared} items`);
      sendResponse({ status: 'OK', cleared });
    } catch (error) {
      log.error('CLEAR_ALL_EMBEDDINGS', 'CLEAR_ALL_EMBEDDINGS failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('START_EMBEDDING_PROCESSOR', async (_msg, _sender, sendResponse) => {
    log.info('START_EMBEDDING_PROCESSOR', '🧠 START_EMBEDDING_PROCESSOR requested');
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      await embeddingProcessor.start();
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      log.error('START_EMBEDDING_PROCESSOR', 'START_EMBEDDING_PROCESSOR failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('PAUSE_EMBEDDING_PROCESSOR', async (_msg, _sender, sendResponse) => {
    log.info('PAUSE_EMBEDDING_PROCESSOR', '⏸ PAUSE_EMBEDDING_PROCESSOR requested');
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      embeddingProcessor.pause();
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      log.error('PAUSE_EMBEDDING_PROCESSOR', 'PAUSE_EMBEDDING_PROCESSOR failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('RESUME_EMBEDDING_PROCESSOR', async (_msg, _sender, sendResponse) => {
    log.info('RESUME_EMBEDDING_PROCESSOR', '▶ RESUME_EMBEDDING_PROCESSOR requested');
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      embeddingProcessor.resume();
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      log.error('RESUME_EMBEDDING_PROCESSOR', 'RESUME_EMBEDDING_PROCESSOR failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_EMBEDDING_PROGRESS', async (_msg, _sender, sendResponse) => {
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      log.error('GET_EMBEDDING_PROGRESS', 'GET_EMBEDDING_PROGRESS failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_AI_CACHE_STATS', async (_msg, _sender, sendResponse) => {
    log.debug('GET_AI_CACHE_STATS', 'GET_AI_CACHE_STATS requested');
    try {
      const { loadCache, getCacheStats } = await import('../ai-keyword-cache');
      await loadCache();
      const stats = getCacheStats();
      sendResponse({ status: 'OK', ...stats });
    } catch (error) {
      log.error('GET_AI_CACHE_STATS', 'GET_AI_CACHE_STATS failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('CLEAR_AI_CACHE', async (_msg, _sender, sendResponse) => {
    log.info('CLEAR_AI_CACHE', '📝 CLEAR_AI_CACHE requested');
    try {
      const { clearAIKeywordCache } = await import('../ai-keyword-cache');
      const result = await clearAIKeywordCache();
      sendResponse({ status: 'OK', ...result });
    } catch (error) {
      log.error('CLEAR_AI_CACHE', 'CLEAR_AI_CACHE failed', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });
}
