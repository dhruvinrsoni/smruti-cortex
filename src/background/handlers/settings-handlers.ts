 
import { MessageHandlerRegistry } from './registry';
import { Logger, errorMeta } from '../../core/logger';
import { browserAPI } from '../../core/helpers';
import { SettingsManager } from '../../core/settings';
import { DEFAULT_EMBEDDING_MODEL } from '../../shared/ollama-models';

const log = Logger.forComponent('SettingsHandlers');

export function registerSettingsHandlers(
  preInit: MessageHandlerRegistry,
  postInit: MessageHandlerRegistry,
): void {
  // ── Pre-init handlers ──

  preInit.register('PING', async (_msg, _sender, sendResponse) => {
    sendResponse({ status: 'ok' });
  });

  preInit.register('OPEN_SETTINGS', async (_msg, _sender, sendResponse) => {
    log.debug('OPEN_SETTINGS', 'Handling OPEN_SETTINGS');
    void browserAPI.tabs
      .create({ url: browserAPI.runtime.getURL('popup/popup.html#settings') })
      .catch(
        (err: unknown) =>
          log.error('OPEN_SETTINGS', 'Failed to open settings tab', errorMeta(err)),
      );
    sendResponse({ status: 'ok' });
  });

  preInit.register('GET_LOG_LEVEL', async (_msg, _sender, sendResponse) => {
    sendResponse({ logLevel: Logger.getLevel() });
  });

  preInit.register('SET_LOG_LEVEL', async (msg, _sender, sendResponse) => {
    log.info('SET_LOG_LEVEL', 'Handling SET_LOG_LEVEL', { level: msg.level });
    await Logger.setLevel(msg.level);
    log.info('SET_LOG_LEVEL', 'Log level set', { level: Logger.getLevel() });
    sendResponse({ status: 'ok' });
  });

  preInit.register('SETTINGS_CHANGED', async (msg, _sender, sendResponse) => {
    log.debug('SETTINGS_CHANGED', 'Handling SETTINGS_CHANGED', { settings: msg.settings });
    if (msg.settings) {
      const wasEmbeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
      const oldEmbeddingModel = SettingsManager.getSetting('embeddingModel') || DEFAULT_EMBEDDING_MODEL;

      await SettingsManager.applyRemoteSettings(msg.settings);
      log.debug('SETTINGS_CHANGED', 'SettingsManager cache updated (no re-broadcast)');

      const { clearSearchCache } = await import('../search/search-cache');
      clearSearchCache();
      log.debug('SETTINGS_CHANGED', 'Search cache cleared after settings change');

      const nowEmbeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
      const nowEmbeddingModel = SettingsManager.getSetting('embeddingModel') || DEFAULT_EMBEDDING_MODEL;

      const { embeddingProcessor } = await import('../embedding-processor');
      const { normalizeModelName } = await import('../ollama-service');

      if (!wasEmbeddingsEnabled && nowEmbeddingsEnabled) {
        log.info('SETTINGS_CHANGED', '🧠 Embeddings enabled — starting background processor');
        void embeddingProcessor.start().catch(
          (err: unknown) =>
            log.error('SETTINGS_CHANGED', 'Embedding processor start failed', errorMeta(err)),
        );
      } else if (wasEmbeddingsEnabled && !nowEmbeddingsEnabled) {
        log.info('SETTINGS_CHANGED', '🧠 Embeddings disabled — stopping background processor');
        embeddingProcessor.stop();
      } else if (
        nowEmbeddingsEnabled &&
        normalizeModelName(oldEmbeddingModel) !== normalizeModelName(nowEmbeddingModel)
      ) {
        log.info('SETTINGS_CHANGED', `🧠 Embedding model changed (${oldEmbeddingModel} → ${nowEmbeddingModel}) — stopping processor`);
        embeddingProcessor.stop();
      }
    }
    sendResponse({ status: 'ok' });
  });

  preInit.register('POPUP_PERF_LOG', async (msg, _sender, sendResponse) => {
    log.info('POPUP_PERF_LOG', `[PopupPerf] ${msg.stage} | ts=${msg.timestamp} | elapsedMs=${msg.elapsedMs}`);
    sendResponse({ status: 'ok' });
  });

  preInit.register('GET_SETTINGS', async (_msg, _sender, sendResponse) => {
    const settings = SettingsManager.getSettings();
    sendResponse({ status: 'OK', settings });
  });

  // ── Post-init handlers ──

  postInit.register('FACTORY_RESET', async (_msg, _sender, sendResponse) => {
    log.info('FACTORY_RESET', 'Factory reset requested');
    try {
      await SettingsManager.resetToDefaults();
      const { clearAndRebuild: clearRebuild } = await import('../resilience');
      await clearRebuild();
      // Factory reset wipes every persisted store; the session-scoped
      // recent-history cache would otherwise linger and paint pre-reset
      // rows on the next quick-search open.
      const { clearRecentHistoryCache } = await import('../../shared/recent-history-cache');
      void clearRecentHistoryCache();
      sendResponse({ status: 'OK' });
    } catch (err) {
      log.error('FACTORY_RESET', 'Factory reset failed', errorMeta(err));
      sendResponse({ error: (err as Error).message });
    }
  });

  postInit.register('RESET_SETTINGS', async (_msg, _sender, sendResponse) => {
    log.info('RESET_SETTINGS', 'Reset settings requested');
    try {
      await SettingsManager.resetToDefaults();
      sendResponse({ status: 'OK' });
    } catch (err) {
      log.error('RESET_SETTINGS', 'Reset settings failed', errorMeta(err));
      sendResponse({ error: (err as Error).message });
    }
  });
}
