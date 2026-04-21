/**
 * settings-handlers — branch-coverage unit tests.
 *
 * Focuses on SETTINGS_CHANGED branches (model-changed, suppressed processor
 * start rejection), OPEN_SETTINGS tab-create rejection (.catch path), and
 * FACTORY_RESET / RESET_SETTINGS error catches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandlerRegistry } from '../registry';
import { registerSettingsHandlers } from '../settings-handlers';

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    getLevel: vi.fn().mockReturnValue('INFO'),
    setLevel: vi.fn().mockResolvedValue(undefined),
  },
  errorMeta: (err: unknown) => ({ error: String(err) }),
}));

vi.mock('../../../core/settings', () => ({
  SettingsManager: {
    getSetting: vi.fn(),
    getSettings: vi.fn(() => ({ theme: 'system' })),
    applyRemoteSettings: vi.fn(),
    resetToDefaults: vi.fn(),
  },
}));

const helperMocks = vi.hoisted(() => ({
  tabsCreate: vi.fn(),
  runtimeGetURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
}));

vi.mock('../../../core/helpers', () => ({
  browserAPI: {
    tabs: { create: helperMocks.tabsCreate },
    runtime: { getURL: helperMocks.runtimeGetURL },
  },
}));

vi.mock('../../search/search-cache', () => ({
  clearSearchCache: vi.fn(),
}));

vi.mock('../../embedding-processor', () => ({
  embeddingProcessor: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('../../ollama-service', () => ({
  normalizeModelName: vi.fn((m: string) => m.trim().toLowerCase()),
}));

vi.mock('../../resilience', () => ({
  clearAndRebuild: vi.fn(),
}));

vi.mock('../../../shared/recent-history-cache', () => ({
  clearRecentHistoryCache: vi.fn().mockResolvedValue(undefined),
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

describe('registerSettingsHandlers', () => {
  let preInit: MessageHandlerRegistry;
  let postInit: MessageHandlerRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    helperMocks.tabsCreate.mockResolvedValue({});
    preInit = new MessageHandlerRegistry();
    postInit = new MessageHandlerRegistry();
    registerSettingsHandlers(preInit, postInit);
  });

  it('registers pre-init and post-init handlers into the correct registries', () => {
    expect(preInit.registeredTypes).toEqual(expect.arrayContaining([
      'PING',
      'OPEN_SETTINGS',
      'GET_LOG_LEVEL',
      'SET_LOG_LEVEL',
      'SETTINGS_CHANGED',
      'POPUP_PERF_LOG',
      'GET_SETTINGS',
    ]));
    expect(postInit.registeredTypes).toEqual(expect.arrayContaining([
      'FACTORY_RESET',
      'RESET_SETTINGS',
    ]));
    // Guard against drift: FACTORY_RESET should NOT be in preInit.
    expect(preInit.has('FACTORY_RESET')).toBe(false);
    expect(postInit.has('PING')).toBe(false);
  });

  describe('trivial handlers', () => {
    it('PING returns ok', async () => {
      const res = await dispatch(preInit, { type: 'PING' });
      expect(res).toEqual({ status: 'ok' });
    });

    it('GET_LOG_LEVEL returns current Logger level', async () => {
      const res = await dispatch(preInit, { type: 'GET_LOG_LEVEL' });
      expect(res).toEqual({ logLevel: 'INFO' });
    });

    it('SET_LOG_LEVEL awaits Logger.setLevel and responds ok', async () => {
      const { Logger } = await import('../../../core/logger');
      const res = await dispatch(preInit, { type: 'SET_LOG_LEVEL', level: 'DEBUG' });
      expect((Logger as { setLevel: ReturnType<typeof vi.fn> }).setLevel).toHaveBeenCalledWith('DEBUG');
      expect(res).toEqual({ status: 'ok' });
    });

    it('POPUP_PERF_LOG logs and responds ok', async () => {
      const res = await dispatch(preInit, {
        type: 'POPUP_PERF_LOG',
        stage: 'opened',
        timestamp: 123,
        elapsedMs: 45,
      });
      expect(res).toEqual({ status: 'ok' });
    });

    it('GET_SETTINGS returns current settings snapshot', async () => {
      const res = await dispatch(preInit, { type: 'GET_SETTINGS' });
      expect(res).toEqual({ status: 'OK', settings: { theme: 'system' } });
    });
  });

  describe('OPEN_SETTINGS', () => {
    it('responds ok and requests the settings URL', async () => {
      const res = await dispatch(preInit, { type: 'OPEN_SETTINGS' });

      expect(res).toEqual({ status: 'ok' });
      expect(helperMocks.runtimeGetURL).toHaveBeenCalledWith('popup/popup.html#settings');
      expect(helperMocks.tabsCreate).toHaveBeenCalledWith({
        url: 'chrome-extension://mock/popup/popup.html#settings',
      });
    });

    it('suppresses tabs.create rejection via .catch branch without rejecting the handler', async () => {
      helperMocks.tabsCreate.mockRejectedValueOnce(new Error('tab create fail'));
      const res = await dispatch(preInit, { type: 'OPEN_SETTINGS' });
      expect(res).toEqual({ status: 'ok' });
      // Give the fire-and-forget .catch a microtask to drain so logger.error fires.
      await Promise.resolve();
      await Promise.resolve();
    });

    it('accepts a non-Error rejection via the String(err) fallback in the .catch', async () => {
      helperMocks.tabsCreate.mockRejectedValueOnce('plain-string-error');
      const res = await dispatch(preInit, { type: 'OPEN_SETTINGS' });
      expect(res).toEqual({ status: 'ok' });
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  describe('SETTINGS_CHANGED', () => {
    it('responds ok and skips processing when msg.settings is absent', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const res = await dispatch(preInit, { type: 'SETTINGS_CHANGED' });
      expect(res).toEqual({ status: 'ok' });
      expect(SettingsManager.applyRemoteSettings).not.toHaveBeenCalled();
    });

    it('defaults wasEmbeddingsEnabled to false when prior value is undefined', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(undefined) // wasEmbeddingsEnabled
        .mockReturnValueOnce(undefined) // oldEmbeddingModel → fallback
        .mockReturnValueOnce(undefined) // nowEmbeddingsEnabled → still falsy
        .mockReturnValueOnce(undefined); // nowEmbeddingModel

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { theme: 'dark' },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(SettingsManager.applyRemoteSettings).toHaveBeenCalledWith({ theme: 'dark' });
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
      expect(embeddingProcessor.stop).not.toHaveBeenCalled();
    });

    it('starts processor when embeddings flip from off → on', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');
      (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: true },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.start).toHaveBeenCalled();
      expect(embeddingProcessor.stop).not.toHaveBeenCalled();
    });

    it('swallows processor start rejection via fire-and-forget .catch', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');
      (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('processor boom'),
      );

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: true },
      });

      expect(res).toEqual({ status: 'ok' });
      await Promise.resolve();
      await Promise.resolve();
    });

    it('accepts a non-Error rejection from processor start', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');
      (embeddingProcessor.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'plain-string-error',
      );

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: true },
      });

      expect(res).toEqual({ status: 'ok' });
      await Promise.resolve();
      await Promise.resolve();
    });

    it('stops processor when embeddings flip from on → off', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce('nomic-embed-text');

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingsEnabled: false },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.stop).toHaveBeenCalled();
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
    });

    it('stops processor when embedding model changes while enabled', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('mxbai-embed-large');

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { embeddingModel: 'mxbai-embed-large' },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.stop).toHaveBeenCalled();
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
    });

    it('is a no-op for embeddings when nothing relevant changed', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { embeddingProcessor } = await import('../../embedding-processor');
      (SettingsManager.getSetting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce('nomic-embed-text');

      const res = await dispatch(preInit, {
        type: 'SETTINGS_CHANGED',
        settings: { theme: 'dark' },
      });

      expect(res).toEqual({ status: 'ok' });
      expect(embeddingProcessor.start).not.toHaveBeenCalled();
      expect(embeddingProcessor.stop).not.toHaveBeenCalled();
    });
  });

  describe('FACTORY_RESET / RESET_SETTINGS', () => {
    it('FACTORY_RESET resets settings and rebuilds on success', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { clearAndRebuild } = await import('../../resilience');
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      (clearAndRebuild as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(postInit, { type: 'FACTORY_RESET' });

      expect(res).toEqual({ status: 'OK' });
      expect(SettingsManager.resetToDefaults).toHaveBeenCalled();
      expect(clearAndRebuild).toHaveBeenCalled();
      // Cache of the session-scoped recent-history list must be wiped so
      // post-reset opens do not render pre-reset rows.
      expect(clearRecentHistoryCache).toHaveBeenCalled();
    });

    it('FACTORY_RESET does not clear recent-history cache if rebuild fails', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { clearAndRebuild } = await import('../../resilience');
      const { clearRecentHistoryCache } = await import('../../../shared/recent-history-cache');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      (clearAndRebuild as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('rebuild fail'));

      const res = await dispatch(postInit, { type: 'FACTORY_RESET' });

      expect(res).toEqual({ error: 'rebuild fail' });
      // If rebuild fails, the underlying data is in an unknown state —
      // we deliberately do not touch the cache so the existing warm
      // entry can still be served while the user retries.
      expect(clearRecentHistoryCache).not.toHaveBeenCalled();
    });

    it('FACTORY_RESET returns { error } when resetToDefaults rejects', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('reset fail'),
      );

      const res = await dispatch(postInit, { type: 'FACTORY_RESET' });

      expect(res).toEqual({ error: 'reset fail' });
    });

    it('FACTORY_RESET returns { error } when clearAndRebuild rejects', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      const { clearAndRebuild } = await import('../../resilience');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      (clearAndRebuild as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('rebuild fail'));

      const res = await dispatch(postInit, { type: 'FACTORY_RESET' });

      expect(res).toEqual({ error: 'rebuild fail' });
    });

    it('RESET_SETTINGS resets to defaults on success', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const res = await dispatch(postInit, { type: 'RESET_SETTINGS' });

      expect(res).toEqual({ status: 'OK' });
    });

    it('RESET_SETTINGS returns { error } when reset rejects', async () => {
      const { SettingsManager } = await import('../../../core/settings');
      (SettingsManager.resetToDefaults as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('reset boom'),
      );

      const res = await dispatch(postInit, { type: 'RESET_SETTINGS' });

      expect(res).toEqual({ error: 'reset boom' });
    });
  });
});
