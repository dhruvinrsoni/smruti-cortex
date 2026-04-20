import { MessageHandlerRegistry } from './registry';
import { Logger, errorMeta } from '../../core/logger';
import { runSearch } from '../search/search-engine';
import { getStorageQuotaInfo, getAllIndexedItems, saveIndexedItem } from '../database';
import { performFullRebuild, mergeMetadata } from '../indexing';
import { clearAndRebuild, checkHealth, selfHeal, recoverFromCorruption, handleQuotaExceeded } from '../resilience';
import type { IndexedItem } from '../schema';

const log = Logger.forComponent('SearchHandlers');

export function registerSearchHandlers(registry: MessageHandlerRegistry): void {
  registry.registerAll({

    SEARCH_QUERY: async (msg, _sender, sendResponse) => {
      const MAX_QUERY_LEN = 500;
      const safeQuery = typeof msg.query === 'string' ? msg.query.slice(0, MAX_QUERY_LEN) : '';
      log.info('SEARCH_QUERY', `Popup search: "${safeQuery}" (skipAI: ${!!msg.skipAI})`);
      const { getLastAIStatus } = await import('../search/search-engine');
      const results = await runSearch(safeQuery, { skipAI: !!msg.skipAI });
      const aiStatus = getLastAIStatus();
      log.debug('SEARCH_QUERY', 'Search completed, results:', results.length);
      sendResponse({ results, aiStatus, query: safeQuery, skipAI: !!msg.skipAI });
    },

    GET_RECENT_HISTORY: async (msg, _sender, sendResponse) => {
      const MAX_HISTORY_LIMIT = 500;
      const historyLimit = Math.min(Math.max(1, Number(msg.limit) || 50), MAX_HISTORY_LIMIT);
      log.debug('GET_RECENT_HISTORY', `Requested with limit: ${historyLimit}`);
      try {
        const { getRecentIndexedItems } = await import('../database');
        const recentItems = await getRecentIndexedItems(historyLimit);
        log.debug('GET_RECENT_HISTORY', `Completed, items: ${recentItems.length}`);
        sendResponse({ results: recentItems });
      } catch (error) {
        log.error('GET_RECENT_HISTORY', 'Failed:', errorMeta(error));
        sendResponse({ results: [] });
      }
    },

    REBUILD_INDEX: async (_msg, _sender, sendResponse) => {
      log.info('REBUILD_INDEX', '🔄 Requested by user');
      try {
        await performFullRebuild();
        const { clearSearchCache } = await import('../search/search-cache');
        clearSearchCache();
        log.info('REBUILD_INDEX', '✅ Completed successfully');
        sendResponse({ status: 'OK', message: 'Index rebuilt successfully' });
      } catch (error) {
        if ((error as Error).name === 'QuotaExceededError') {
          await handleQuotaExceeded();
        }
        log.error('REBUILD_INDEX', '❌ Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    INDEX_BOOKMARKS: async (_msg, _sender, sendResponse) => {
      log.info('INDEX_BOOKMARKS', '📚 Requested by user');
      try {
        const { performBookmarksIndex } = await import('../indexing');
        const result = await performBookmarksIndex(true);
        log.info('INDEX_BOOKMARKS', '✅ Completed', result);
        sendResponse({ status: 'OK', ...result });
      } catch (error) {
        log.error('INDEX_BOOKMARKS', '❌ Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    MANUAL_INDEX: async (_msg, _sender, sendResponse) => {
      log.info('MANUAL_INDEX', '⚡ Requested by user');
      try {
        const { performIncrementalHistoryIndexManual } = await import('../indexing');
        const { getSetting, setSetting } = await import('../database');

        const lastIndexedTimestamp = await getSetting<number>('lastIndexedTimestamp', 0);
        log.debug('MANUAL_INDEX', 'Last indexed timestamp', { lastIndexedTimestamp });

        const result = await performIncrementalHistoryIndexManual(lastIndexedTimestamp);

        await setSetting('lastIndexedTimestamp', Date.now());

        log.info('MANUAL_INDEX', '✅ Completed', result);
        sendResponse({ status: 'OK', ...result });
      } catch (error) {
        log.error('MANUAL_INDEX', '❌ Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    CLEAR_ALL_DATA: async (_msg, _sender, sendResponse) => {
      log.info('CLEAR_ALL_DATA', '🗑️ Requested by user');
      try {
        const result = await clearAndRebuild();

        if (result.success) {
          log.info('CLEAR_ALL_DATA', '✅ Completed', { itemCount: result.itemCount });
          sendResponse({ status: 'OK', message: result.message, itemCount: result.itemCount });
        } else {
          log.error('CLEAR_ALL_DATA', '❌ Failed', { message: result.message });
          sendResponse({ status: 'ERROR', message: result.message });
        }
      } catch (error) {
        log.error('CLEAR_ALL_DATA', '❌ Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    GET_STORAGE_QUOTA: async (_msg, _sender, sendResponse) => {
      log.debug('GET_STORAGE_QUOTA', 'Requested');
      try {
        const quotaInfo = await getStorageQuotaInfo();
        log.debug('GET_STORAGE_QUOTA', 'Retrieved', quotaInfo);
        sendResponse({ status: 'OK', data: quotaInfo });
      } catch (error) {
        log.error('GET_STORAGE_QUOTA', 'Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    EXPORT_INDEX: async (_msg, _sender, sendResponse) => {
      log.info('EXPORT_INDEX', '📥 Requested');
      try {
        const items = await getAllIndexedItems();
        const exportData = {
          version: chrome.runtime.getManifest().version,
          exportDate: new Date().toISOString(),
          itemCount: items.length,
          items,
        };
        sendResponse({ status: 'OK', data: exportData });
      } catch (error) {
        log.error('EXPORT_INDEX', '❌ Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    IMPORT_INDEX: async (msg, _sender, sendResponse) => {
      const MAX_IMPORT_ITEMS = 50_000;
      log.info('IMPORT_INDEX', '📤 Requested', { count: msg.items?.length });
      try {
        const items = msg.items as Array<Record<string, unknown>>;
        if (!Array.isArray(items)) {
          sendResponse({ status: 'ERROR', message: 'Invalid import data: items must be an array' });
          return;
        }
        if (items.length > MAX_IMPORT_ITEMS) {
          sendResponse({ status: 'ERROR', message: `Import too large: ${items.length} items exceeds limit of ${MAX_IMPORT_ITEMS}` });
          return;
        }
        let imported = 0;
        let skipped = 0;
        for (const item of items) {
          if (
            typeof item.url === 'string' && item.url.length > 0 && item.url.length <= 2048 &&
            typeof item.title === 'string' && item.title.length <= 1000 &&
            typeof item.lastVisit === 'number' && Number.isFinite(item.lastVisit)
          ) {
            await saveIndexedItem(item as unknown as IndexedItem);
            imported++;
          } else {
            skipped++;
          }
        }
        log.info('IMPORT_INDEX', '✅ Completed', { imported, skipped });
        sendResponse({ status: 'OK', imported, skipped });
      } catch (error) {
        log.error('IMPORT_INDEX', '❌ Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    GET_HEALTH_STATUS: async (_msg, _sender, sendResponse) => {
      log.debug('GET_HEALTH_STATUS', 'Requested');
      try {
        const health = await checkHealth();
        log.debug('GET_HEALTH_STATUS', 'Retrieved', health);
        sendResponse({ status: 'OK', data: health });
      } catch (error) {
        log.error('GET_HEALTH_STATUS', 'Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    SELF_HEAL: async (_msg, _sender, sendResponse) => {
      log.info('SELF_HEAL', '🔧 Requested by user');
      try {
        let success = await selfHeal('User requested self-heal');
        if (!success) {
          log.info('SELF_HEAL', '🔧 selfHeal failed, escalating to recoverFromCorruption');
          success = await recoverFromCorruption();
        }
        const health = await checkHealth();
        sendResponse({
          status: success ? 'OK' : 'PARTIAL',
          message: success ? 'Self-heal completed successfully' : 'Self-heal completed with issues',
          data: health,
        });
      } catch (error) {
        log.error('SELF_HEAL', 'Failed:', errorMeta(error));
        sendResponse({ status: 'ERROR', message: (error as Error).message });
      }
    },

    METADATA_CAPTURE: async (msg, _sender, sendResponse) => {
      const { payload } = msg;
      if (!payload || typeof payload.url !== 'string' || !payload.url) {
        sendResponse({ status: 'ERROR', message: 'METADATA_CAPTURE: missing or invalid payload.url' });
        return;
      }
      log.debug('METADATA_CAPTURE', 'Handling for:', payload.url);
      await mergeMetadata(payload.url, {
        description: typeof payload.metaDescription === 'string' ? payload.metaDescription.slice(0, 2000) : undefined,
        keywords: typeof payload.metaKeywords === 'string' ? payload.metaKeywords.slice(0, 2000) : undefined,
      });
      sendResponse({ status: 'ok' });
    },

    EXECUTE_COMMAND: async (msg, _sender, sendResponse) => {
      log.info('EXECUTE_COMMAND', msg.commandId);
      sendResponse({ status: 'OK' });
    },

  });
}
