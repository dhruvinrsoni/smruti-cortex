/* eslint-disable @typescript-eslint/no-explicit-any */
import { MessageHandlerRegistry } from './registry';
import { Logger, errorMeta } from '../../core/logger';

const log = Logger.forComponent('OllamaHandlers');

export function registerOllamaHandlers(registry: MessageHandlerRegistry): void {
  registry.register('GET_EMBEDDING_STATS', async (_msg, _sender, sendResponse) => {
    log.debug('handle', 'GET_EMBEDDING_STATS requested');
    try {
      const { getAllIndexedItems } = await import('../database');
      const items = await getAllIndexedItems();
      const withEmbeddings = items.filter((i: any) => i.embedding && i.embedding.length > 0);
      const totalDims = withEmbeddings.reduce((sum: number, i: any) => sum + (i.embedding?.length || 0), 0);
      const estimatedBytes = totalDims * 8;
      const { SettingsManager } = await import('../../core/settings');
      const embeddingModel = SettingsManager.getSetting('embeddingModel') || 'nomic-embed-text';
      sendResponse({
        status: 'OK',
        total: items.length,
        withEmbeddings: withEmbeddings.length,
        estimatedBytes,
        embeddingModel,
      });
    } catch (error) {
      log.error('handle', 'GET_EMBEDDING_STATS failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('CLEAR_ALL_EMBEDDINGS', async (_msg, _sender, sendResponse) => {
    log.info('handle', '🧠 CLEAR_ALL_EMBEDDINGS requested');
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
      log.info('handle', `✅ Cleared embeddings from ${cleared} items`);
      sendResponse({ status: 'OK', cleared });
    } catch (error) {
      log.error('handle', 'CLEAR_ALL_EMBEDDINGS failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('START_EMBEDDING_PROCESSOR', async (_msg, _sender, sendResponse) => {
    log.info('handle', '🧠 START_EMBEDDING_PROCESSOR requested');
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      await embeddingProcessor.start();
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      log.error('handle', 'START_EMBEDDING_PROCESSOR failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('PAUSE_EMBEDDING_PROCESSOR', async (_msg, _sender, sendResponse) => {
    log.info('handle', '⏸ PAUSE_EMBEDDING_PROCESSOR requested');
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      embeddingProcessor.pause();
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      log.error('handle', 'PAUSE_EMBEDDING_PROCESSOR failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('RESUME_EMBEDDING_PROCESSOR', async (_msg, _sender, sendResponse) => {
    log.info('handle', '▶ RESUME_EMBEDDING_PROCESSOR requested');
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      embeddingProcessor.resume();
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      log.error('handle', 'RESUME_EMBEDDING_PROCESSOR failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_EMBEDDING_PROGRESS', async (_msg, _sender, sendResponse) => {
    try {
      const { embeddingProcessor } = await import('../embedding-processor');
      sendResponse({ status: 'OK', progress: embeddingProcessor.getProgress() });
    } catch (error) {
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('GET_AI_CACHE_STATS', async (_msg, _sender, sendResponse) => {
    log.debug('handle', 'GET_AI_CACHE_STATS requested');
    try {
      const { loadCache, getCacheStats } = await import('../ai-keyword-cache');
      await loadCache();
      const stats = getCacheStats();
      sendResponse({ status: 'OK', ...stats });
    } catch (error) {
      log.error('handle', 'GET_AI_CACHE_STATS failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });

  registry.register('CLEAR_AI_CACHE', async (_msg, _sender, sendResponse) => {
    log.info('handle', '📝 CLEAR_AI_CACHE requested');
    try {
      const { clearAIKeywordCache } = await import('../ai-keyword-cache');
      const result = await clearAIKeywordCache();
      sendResponse({ status: 'OK', ...result });
    } catch (error) {
      log.error('handle', 'CLEAR_AI_CACHE failed:', errorMeta(error));
      sendResponse({ status: 'ERROR', message: (error as Error).message });
    }
  });
}
