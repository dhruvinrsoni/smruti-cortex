 
import { MessageHandlerRegistry } from './registry';
import { Logger } from '../../core/logger';
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
    log.debug('handle', 'Handling OPEN_SETTINGS');
    void browserAPI.tabs
      .create({ url: browserAPI.runtime.getURL('popup/popup.html#settings') })
      .catch(
        (err: unknown) =>
          log.error('handle', 'Failed to open settings tab', undefined, err instanceof Error ? err : new Error(String(err))),
      );
    sendResponse({ status: 'ok' });
  });

  preInit.register('GET_LOG_LEVEL', async (_msg, _sender, sendResponse) => {
    sendResponse({ logLevel: Logger.getLevel() });
  });

  preInit.register('SET_LOG_LEVEL', async (msg, _sender, sendResponse) => {
    log.info('handle', '[SmrutiCortex] Handling SET_LOG_LEVEL:', msg.level);
    await Logger.setLevel(msg.level);
    log.info('handle', '[SmrutiCortex] Log level set to', Logger.getLevel());
    sendResponse({ status: 'ok' });
  });

  preInit.register('SETTINGS_CHANGED', async (msg, _sender, sendResponse) => {
    log.debug('handle', 'Handling SETTINGS_CHANGED:', msg.settings);
    if (msg.settings) {
      const wasEmbeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
      const oldEmbeddingModel = SettingsManager.getSetting('embeddingModel') || DEFAULT_EMBEDDING_MODEL;

      await SettingsManager.applyRemoteSettings(msg.settings);
      log.debug('handle', 'SettingsManager cache updated (no re-broadcast)');

      const { clearSearchCache } = await import('../search/search-cache');
      clearSearchCache();
      log.debug('handle', 'Search cache cleared after settings change');

      const nowEmbeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
      const nowEmbeddingModel = SettingsManager.getSetting('embeddingModel') || DEFAULT_EMBEDDING_MODEL;

      const { embeddingProcessor } = await import('../embedding-processor');
      const { normalizeModelName } = await import('../ollama-service');

      if (!wasEmbeddingsEnabled && nowEmbeddingsEnabled) {
        log.info('handle', '🧠 Embeddings enabled — starting background processor');
        void embeddingProcessor.start().catch(
          (err: unknown) =>
            log.error('handle', 'Embedding processor start failed', undefined, err instanceof Error ? err : new Error(String(err))),
        );
      } else if (wasEmbeddingsEnabled && !nowEmbeddingsEnabled) {
        log.info('handle', '🧠 Embeddings disabled — stopping background processor');
        embeddingProcessor.stop();
      } else if (
        nowEmbeddingsEnabled &&
        normalizeModelName(oldEmbeddingModel) !== normalizeModelName(nowEmbeddingModel)
      ) {
        log.info('handle', `🧠 Embedding model changed (${oldEmbeddingModel} → ${nowEmbeddingModel}) — stopping processor`);
        embeddingProcessor.stop();
      }
    }
    sendResponse({ status: 'ok' });
  });

  preInit.register('POPUP_PERF_LOG', async (msg, _sender, sendResponse) => {
    log.info('handle', `[PopupPerf] ${msg.stage} | ts=${msg.timestamp} | elapsedMs=${msg.elapsedMs}`);
    sendResponse({ status: 'ok' });
  });

  preInit.register('GET_SETTINGS', async (_msg, _sender, sendResponse) => {
    const settings = SettingsManager.getSettings();
    sendResponse({ status: 'OK', settings });
  });

  // ── Post-init handlers ──

  postInit.register('FACTORY_RESET', async (_msg, _sender, sendResponse) => {
    log.info('handle', 'Factory reset requested');
    try {
      await SettingsManager.resetToDefaults();
      const { clearAndRebuild: clearRebuild } = await import('../resilience');
      await clearRebuild();
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });

  postInit.register('RESET_SETTINGS', async (_msg, _sender, sendResponse) => {
    log.info('handle', 'Reset settings requested');
    try {
      await SettingsManager.resetToDefaults();
      sendResponse({ status: 'OK' });
    } catch (err) {
      sendResponse({ error: (err as Error).message });
    }
  });
}
