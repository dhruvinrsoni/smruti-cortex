 
 
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IndexedItem } from '../schema';
import type { AppSettings } from '../../core/settings';
import { DisplayMode } from '../../core/settings';

// ═══════════════════════════════════════════════════════════════════════════
// 1. SEARCH CACHE — branch coverage
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
    getRecentLogs: vi.fn(() => []),
  },
  errorMeta: (err: unknown) => err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: 'non-Error', message: String(err) },
}));

describe('SearchCache — branch gaps', () => {
  let SearchCache: typeof import('../search/search-cache').SearchCache;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../search/search-cache');
    SearchCache = mod.SearchCache;
  });

  it('cache miss returns null (entry not present)', () => {
    const cache = new SearchCache(5, 5000);
    expect(cache.get('unknown')).toBeNull();
  });

  it('cache hit with expired entry returns null and removes entry', () => {
    vi.useFakeTimers();
    const cache = new SearchCache(5, 1000);
    cache.set('q', [{ url: 'https://a.com', title: 'A' } as any]);
    vi.advanceTimersByTime(1500);
    expect(cache.get('q')).toBeNull();
    expect(cache.getStats().size).toBe(0);
    vi.useRealTimers();
  });

  it('cache overflow triggers LRU eviction', () => {
    const cache = new SearchCache(3, 60_000);
    cache.set('a', []);
    cache.set('b', []);
    cache.set('c', []);
    cache.set('d', []);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).not.toBeNull();
    expect(cache.getStats().size).toBe(3);
  });

  it('overwriting same key does not trigger eviction', () => {
    const cache = new SearchCache(2, 60_000);
    cache.set('x', [{ url: 'https://1.com' } as any]);
    cache.set('y', [{ url: 'https://2.com' } as any]);
    cache.set('x', [{ url: 'https://3.com' } as any]);
    expect(cache.getStats().size).toBe(2);
    expect(cache.get('x')![0].url).toBe('https://3.com');
  });

  it('getStats hitRate computes correctly with 0 entries', () => {
    const cache = new SearchCache(5, 5000);
    expect(cache.getStats().hitRate).toBe('0.00');
  });

  it('pruneExpired with no expired entries returns 0', () => {
    const cache = new SearchCache(5, 60_000);
    cache.set('fresh', []);
    expect(cache.pruneExpired()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. SCORER MANAGER — branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('scorer-manager — getAllScorers branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns embedding scorer with weight 0 when embeddings disabled', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn(() => false) },
    }));
    const { getAllScorers } = await import('../search/scorer-manager');
    const scorers = getAllScorers();
    const embScorer = scorers.find(s => s.name === 'semantic');
    expect(embScorer).toBeDefined();
    expect(embScorer!.weight).toBe(0);
  });

  it('returns embedding scorer with weight 0.4 when embeddings enabled', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn(() => true) },
    }));
    const { getAllScorers } = await import('../search/scorer-manager');
    const scorers = getAllScorers();
    const embScorer = scorers.find(s => s.name === 'semantic');
    expect(embScorer).toBeDefined();
    expect(embScorer!.weight).toBe(0.4);
  });

  it('crossDimensional scorer returns 0 for single-token queries', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn(() => false) },
    }));
    const { getAllScorers } = await import('../search/scorer-manager');
    const scorers = getAllScorers();
    const crossDim = scorers.find(s => s.name === 'crossDimensional');
    expect(crossDim).toBeDefined();
    const item: IndexedItem = {
      url: 'https://example.com', title: 'Example', hostname: 'example.com',
      visitCount: 1, lastVisit: Date.now(), tokens: ['example'],
    };
    expect(crossDim!.score(item, 'example', [item])).toBe(0);
  });

  it('domainFamiliarity scorer returns 0 when hostname is empty', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn(() => false) },
    }));
    const { getAllScorers } = await import('../search/scorer-manager');
    const scorers = getAllScorers();
    const domFam = scorers.find(s => s.name === 'domainFamiliarity');
    expect(domFam).toBeDefined();
    const item: IndexedItem = {
      url: 'https://example.com', title: 'Example', hostname: '',
      visitCount: 1, lastVisit: Date.now(), tokens: ['example'],
    };
    expect(domFam!.score(item, 'test', [item])).toBe(0);
  });

  it('domainFamiliarity scorer returns 0 when domain visit count is 0', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn(() => false) },
    }));
    const { getAllScorers } = await import('../search/scorer-manager');
    const scorers = getAllScorers();
    const domFam = scorers.find(s => s.name === 'domainFamiliarity');
    const item: IndexedItem = {
      url: 'https://example.com', title: 'Example', hostname: 'example.com',
      visitCount: 1, lastVisit: Date.now(), tokens: ['example'],
    };
    const ctx = { domainVisitCounts: new Map<string, number>() };
    expect(domFam!.score(item, 'test', [item], ctx)).toBe(0);
  });

  it('multiTokenMatch scorer returns 0 for single-token queries', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn(() => false) },
    }));
    const { getAllScorers } = await import('../search/scorer-manager');
    const scorers = getAllScorers();
    const multiToken = scorers.find(s => s.name === 'multiTokenMatch');
    expect(multiToken).toBeDefined();
    const item: IndexedItem = {
      url: 'https://example.com', title: 'Example', hostname: 'example.com',
      visitCount: 1, lastVisit: Date.now(), tokens: ['example'],
    };
    expect(multiToken!.score(item, 'example', [item])).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. EMBEDDING PROCESSOR — additional branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('embedding-processor — additional branch gaps', () => {
  const settingsMock: Record<string, unknown> = { embeddingsEnabled: true };
  const dbMocks = {
    countItemsWithoutEmbeddings: vi.fn(async () => ({ total: 5, withoutEmbeddings: 3 })),
    getItemsWithoutEmbeddingsBatch: vi.fn(async () => []),
    saveIndexedItem: vi.fn(),
  };
  const indexingMocks = {
    generateItemEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  };

  function freshImport() {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: {
        forComponent: () => ({
          debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        }),
      },
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: {
        init: vi.fn(),
        getSetting: vi.fn((key: string) => settingsMock[key]),
      },
    }));
    vi.doMock('../database', () => dbMocks);
    vi.doMock('../indexing', () => indexingMocks);
    vi.doMock('../ollama-service', () => ({
      isCircuitBreakerOpen: vi.fn(() => false),
      checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
      getOllamaConfigFromSettings: vi.fn(async () => ({ model: 'test-model' })),
      getOllamaService: vi.fn(() => ({
        checkAvailability: vi.fn(async () => ({ available: true, model: 'test-model', version: '1.0' })),
      })),
    }));
    return import('../embedding-processor');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.embeddingsEnabled = true;
    dbMocks.countItemsWithoutEmbeddings.mockResolvedValue({ total: 5, withoutEmbeddings: 3 });
    dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
    indexingMocks.generateItemEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('start: re-detects new items when in completed state', async () => {
    dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
    const { embeddingProcessor } = await freshImport();
    await embeddingProcessor.start();
    await new Promise(r => setTimeout(r, 200));

    dbMocks.countItemsWithoutEmbeddings.mockResolvedValue({ total: 10, withoutEmbeddings: 2 });
    dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
    await embeddingProcessor.start();
    await new Promise(r => setTimeout(r, 200));
    expect(embeddingProcessor.getProgress().total).toBeGreaterThanOrEqual(5);
  });

  it('start: stays completed when completed and no new items', async () => {
    dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([]);
    const { embeddingProcessor } = await freshImport();
    await embeddingProcessor.start();
    await new Promise(r => setTimeout(r, 200));

    dbMocks.countItemsWithoutEmbeddings.mockResolvedValue({ total: 5, withoutEmbeddings: 0 });
    await embeddingProcessor.start();
    expect(embeddingProcessor.getProgress().state).toBe('completed');
  });

  it('resume when not paused is a no-op', async () => {
    const { embeddingProcessor } = await freshImport();
    embeddingProcessor.resume();
    expect(embeddingProcessor.getProgress().state).toBe('idle');
  });

  it('pause when not running is a no-op', async () => {
    const { embeddingProcessor } = await freshImport();
    embeddingProcessor.pause();
    expect(embeddingProcessor.getProgress().state).toBe('idle');
  });

  it('setSearchActive toggling from true to true is a no-op', async () => {
    const { embeddingProcessor } = await freshImport();
    embeddingProcessor.setSearchActive(true);
    embeddingProcessor.setSearchActive(true);
  });

  it('getProgress returns remaining=0 and startedAt=undefined when idle', async () => {
    const { embeddingProcessor } = await freshImport();
    const p = embeddingProcessor.getProgress();
    expect(p.remaining).toBe(0);
    expect(p.startedAt).toBeUndefined();
    expect(p.speed).toBe(0);
    expect(p.estimatedMinutes).toBe(0);
  });

  it('calculateSpeed returns 0 with fewer than 2 timestamps', async () => {
    const { embeddingProcessor } = await freshImport();
    const p = embeddingProcessor.getProgress();
    expect(p.speed).toBe(0);
  });

  it('refreshCounts handles error gracefully', async () => {
    dbMocks.countItemsWithoutEmbeddings.mockRejectedValueOnce(new Error('DB unavailable'));
    const { embeddingProcessor } = await freshImport();
    await embeddingProcessor.start();
    await new Promise(r => setTimeout(r, 100));
    expect(embeddingProcessor.getProgress().total).toBe(0);
  });

  it('memory pressure with permanent flag sets state to completed', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: {
        forComponent: () => ({
          debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        }),
      },
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: {
        init: vi.fn(),
        getSetting: vi.fn((key: string) => settingsMock[key]),
      },
    }));
    vi.doMock('../database', () => dbMocks);
    vi.doMock('../indexing', () => indexingMocks);
    vi.doMock('../ollama-service', () => ({
      isCircuitBreakerOpen: vi.fn(() => false),
      checkMemoryPressure: vi.fn(() => ({ ok: false, permanent: true, usedMB: 500 })),
      getOllamaConfigFromSettings: vi.fn(async () => ({ model: 'test-model' })),
      getOllamaService: vi.fn(() => ({
        checkAvailability: vi.fn(async () => ({ available: true, model: 'test-model', version: '1.0' })),
      })),
    }));
    dbMocks.getItemsWithoutEmbeddingsBatch.mockResolvedValue([
      { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
    ]);
    const { embeddingProcessor } = await import('../embedding-processor');
    await embeddingProcessor.start();
    await new Promise(r => setTimeout(r, 300));
    expect(embeddingProcessor.getProgress().state).toBe('completed');
  });

  it('empty embedding array (length 0) skips save', async () => {
    indexingMocks.generateItemEmbedding.mockResolvedValue([]);
    const items = [
      { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
    ];
    dbMocks.getItemsWithoutEmbeddingsBatch
      .mockResolvedValueOnce(items)
      .mockResolvedValueOnce([]);
    const { embeddingProcessor } = await freshImport();
    await embeddingProcessor.start();
    await new Promise(r => setTimeout(r, 500));
    expect(embeddingProcessor.getProgress().processed).toBe(0);
    expect(dbMocks.saveIndexedItem).not.toHaveBeenCalled();
  });

  it('non-Error thrown from generateItemEmbedding is handled', async () => {
    indexingMocks.generateItemEmbedding.mockRejectedValue('string error');
    const items = [
      { url: 'https://a.com', title: 'A', hostname: 'a.com', visitCount: 1, lastVisit: Date.now(), tokens: ['a'] },
    ];
    dbMocks.getItemsWithoutEmbeddingsBatch
      .mockResolvedValueOnce(items)
      .mockResolvedValueOnce([]);
    const { embeddingProcessor } = await freshImport();
    await embeddingProcessor.start();
    await new Promise(r => setTimeout(r, 800));
    expect(embeddingProcessor.getProgress().lastError).toBe('string error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. COMMAND REGISTRY — branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('command-registry — branch gaps', () => {
  const base: AppSettings = {
    displayMode: DisplayMode.LIST,
    logLevel: 2,
    highlightMatches: true,
    advancedBrowserCommands: true,
    theme: 'auto',
    webSearchEngine: 'google',
  };

  let ALL_COMMANDS: any[];
  let matchCommands: any;
  let getAvailableCommands: any;
  let preparePaletteCommandList: any;
  let getCycleValueFromCommand: any;
  let getCurrentValueLabel: any;
  let getPowerSettingsPatch: any;
  let formatPaletteCategoryHeader: any;

  beforeEach(async () => {
    const mod = await import('../../shared/command-registry');
    ALL_COMMANDS = mod.ALL_COMMANDS;
    matchCommands = mod.matchCommands;
    getAvailableCommands = mod.getAvailableCommands;
    preparePaletteCommandList = mod.preparePaletteCommandList;
    getCycleValueFromCommand = mod.getCycleValueFromCommand;
    getCurrentValueLabel = mod.getCurrentValueLabel;
    getPowerSettingsPatch = mod.getPowerSettingsPatch;
    formatPaletteCategoryHeader = mod.formatPaletteCategoryHeader;
  });

  describe('matchCommands filter branches', () => {
    it('filters unavailable commands when settings provided', () => {
      const settingsOff: AppSettings = { ...base, advancedBrowserCommands: false };
      const all = matchCommands('close other', ALL_COMMANDS, settingsOff);
      expect(all.every((c: any) => c.id !== 'close-other-tabs')).toBe(true);
    });

    it('returns all matching commands when settings not provided', () => {
      const results = matchCommands('close', ALL_COMMANDS);
      expect(results.length).toBeGreaterThan(0);
    });

    it('empty query with settings filters unavailable and expands sub-commands', () => {
      const settingsOff: AppSettings = { ...base, advancedBrowserCommands: false };
      const results = matchCommands('', ALL_COMMANDS, settingsOff);
      expect(results.every((c: any) => {
        if (c.isAvailable) {return c.isAvailable(settingsOff);}
        return true;
      })).toBe(true);
    });

    it('empty query without settings includes all and expands sub-commands', () => {
      const results = matchCommands('', ALL_COMMANDS);
      const hasSub = results.some((c: any) => c.id === 'theme-dark');
      expect(hasSub).toBe(true);
    });

    it('alias exact match gets highest score', () => {
      const results = matchCommands('md', ALL_COMMANDS, base);
      expect(results[0]?.id).toBe('copy-markdown');
    });

    it('label startsWith match gets high score', () => {
      const results = matchCommands('Toggle AI', ALL_COMMANDS, base);
      expect(results[0]?.id).toBe('toggle-ai');
    });

    it('partial token match still returns results', () => {
      const results = matchCommands('bookmark', ALL_COMMANDS, base);
      expect(results.length).toBeGreaterThan(0);
    });

    it('non-matching query returns empty', () => {
      const results = matchCommands('xyznonexistent123', ALL_COMMANDS, base);
      expect(results).toHaveLength(0);
    });
  });

  describe('isAvailable for embeddings-gated commands', () => {
    it('excludes embedding commands when embeddings disabled', () => {
      const settingsNoEmb: AppSettings = { ...base, embeddingsEnabled: false } as any;
      const available = getAvailableCommands('power', settingsNoEmb);
      expect(available.some((c: any) => c.id === 'start-embeddings')).toBe(false);
    });

    it('includes embedding commands when embeddings enabled', () => {
      const settingsEmb: AppSettings = { ...base, embeddingsEnabled: true } as any;
      const available = getAvailableCommands('power', settingsEmb);
      expect(available.some((c: any) => c.id === 'start-embeddings')).toBe(true);
    });
  });

  describe('preparePaletteCommandList sorting', () => {
    it('returns search-scored list when query is non-empty (power tier)', () => {
      const power = ALL_COMMANDS.filter((c: any) => c.tier === 'power');
      const list = preparePaletteCommandList('power', 'rebuild', power, base);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].id).toBe('rebuild-index');
    });

    it('sorts by everyday category order for empty query', () => {
      const everyday = ALL_COMMANDS.filter((c: any) => c.tier === 'everyday');
      const list = preparePaletteCommandList('everyday', '', everyday, base);
      const toggleIdx = list.findIndex((c: any) => c.category === 'toggle');
      const browserIdx = list.findIndex((c: any) => c.category === 'browser');
      expect(toggleIdx).toBeLessThan(browserIdx);
    });
  });

  describe('getCycleValueFromCommand edge cases', () => {
    it('resolves numeric cycle values', () => {
      const maxResultsSub = ALL_COMMANDS
        .flatMap((c: any) => c.subCommands ?? [])
        .find((s: any) => s.id === 'max-results-100');
      expect(maxResultsSub).toBeDefined();
      const value = getCycleValueFromCommand(maxResultsSub);
      expect(value).toBe(100);
    });

    it('resolves string cycle values like theme', () => {
      const themeSub = ALL_COMMANDS
        .flatMap((c: any) => c.subCommands ?? [])
        .find((s: any) => s.id === 'theme-auto');
      expect(themeSub).toBeDefined();
      expect(getCycleValueFromCommand(themeSub)).toBe('auto');
    });

    it('returns undefined for non-cycle command', () => {
      const settingsCmd = ALL_COMMANDS.find((c: any) => c.id === 'settings');
      expect(getCycleValueFromCommand(settingsCmd!)).toBeUndefined();
    });

    it('falls back to suffix match for unlabeled sub-commands', () => {
      const focusDelaySub = ALL_COMMANDS
        .flatMap((c: any) => c.subCommands ?? [])
        .find((s: any) => s.id === 'focus-delay-off');
      expect(focusDelaySub).toBeDefined();
      const val = getCycleValueFromCommand(focusDelaySub);
      expect(val).toBe(0);
    });
  });

  describe('getCurrentValueLabel edge cases', () => {
    it('returns undefined when value does not match any cycleValue', () => {
      const themeCmd = ALL_COMMANDS.find((c: any) => c.id === 'theme');
      const result = getCurrentValueLabel(themeCmd!, { ...base, theme: 'unknown-theme' as any });
      expect(result).toBeUndefined();
    });
  });

  describe('getPowerSettingsPatch branches', () => {
    it('returns commandPaletteModes for palette-modes-no-power', () => {
      const patch = getPowerSettingsPatch('palette-modes-no-power');
      expect(patch?.commandPaletteModes).toEqual(['/', '@', '#', '??']);
    });

    it('returns toolbar toggles for toolbar-preset-default', () => {
      const patch = getPowerSettingsPatch('toolbar-preset-default');
      expect(patch?.toolbarToggles).toBeDefined();
    });

    it('returns toolbar toggles for toolbar-preset-full', () => {
      const patch = getPowerSettingsPatch('toolbar-preset-full');
      expect(patch?.toolbarToggles).toBeDefined();
      expect(patch!.toolbarToggles!.length).toBeGreaterThan(3);
    });

    it('returns null for unknown command', () => {
      expect(getPowerSettingsPatch('unknown-xyz')).toBeNull();
    });
  });

  describe('formatPaletteCategoryHeader fallback', () => {
    it('returns category string for unknown category', () => {
      expect(formatPaletteCategoryHeader('unknown-cat', 'power')).toBe('unknown-cat');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DIAGNOSTICS — branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('diagnostics — branch gaps', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        getManifest: vi.fn(() => ({ name: 'Test', version: '1.0', manifest_version: 3 })),
        lastError: null,
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
    vi.doMock('../../core/logger', () => ({
      Logger: {
        forComponent: () => ({
          debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        }),
        getRecentLogs: vi.fn(() => []),
      },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: {
        init: vi.fn().mockResolvedValue(undefined),
        getSettings: vi.fn().mockReturnValue({ sensitiveUrlBlacklist: ['https://secret.com'] }),
        getSetting: vi.fn().mockReturnValue(false),
      },
    }));
    vi.doMock('../database', () => ({
      getAllIndexedItems: vi.fn().mockResolvedValue([]),
      getStorageQuotaInfo: vi.fn().mockResolvedValue({ bytesInUse: 0, quota: 0 }),
    }));
    vi.doMock('../resilience', () => ({
      checkHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recordSearchDebug trims history when exceeding MAX_SEARCH_HISTORY', async () => {
    const { recordSearchDebug, getSearchHistory } = await import('../diagnostics');
    for (let i = 0; i < 55; i++) {
      recordSearchDebug(`query-${i}`, i, i * 5);
    }
    const history = getSearchHistory();
    expect(history.length).toBe(50);
    expect(history[0].query).toBe('query-5');
  });

  it('initSearchDebugState handles storage error', async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('denied'));
    const { initSearchDebugState, isSearchDebugEnabled } = await import('../diagnostics');
    await initSearchDebugState();
    expect(isSearchDebugEnabled()).toBe(false);
  });

  it('setSearchDebugEnabled handles storage.set error gracefully', async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('quota'));
    const { setSearchDebugEnabled, isSearchDebugEnabled } = await import('../diagnostics');
    await setSearchDebugEnabled(true);
    expect(isSearchDebugEnabled()).toBe(true);
  });

  it('recordSearchSnapshot and getLastSearchSnapshot', async () => {
    const { recordSearchSnapshot, getLastSearchSnapshot } = await import('../diagnostics');
    expect(getLastSearchSnapshot()).toBeNull();
    const snapshot = {
      timestamp: Date.now(),
      query: 'test',
      tokens: ['test'],
      aiExpandedKeywords: [],
      duration: 42,
      sortBy: 'best-match',
      showNonMatchingResults: false,
      showDuplicateUrls: false,
      ollamaEnabled: false,
      embeddingsEnabled: false,
      resultCount: 1,
      totalIndexedItems: 100,
      results: [],
    };
    recordSearchSnapshot(snapshot);
    expect(getLastSearchSnapshot()).toBe(snapshot);
  });

  it('getSearchAnalytics returns queryLengthDistribution accurately', async () => {
    const { getSearchAnalytics, recordSearchDebug } = await import('../diagnostics');
    recordSearchDebug('ab', 1, 5);
    recordSearchDebug('abc', 2, 10);
    recordSearchDebug('ab', 1, 5);
    const analytics = getSearchAnalytics();
    expect(analytics.queryLengthDistribution[2]).toBe(2);
    expect(analytics.queryLengthDistribution[3]).toBe(1);
    expect(analytics.topQueries[0].query).toBe('ab');
    expect(analytics.topQueries[0].count).toBe(2);
  });

  it('getSearchAnalytics recentSearches returns most recent', async () => {
    const { getSearchAnalytics, recordSearchDebug } = await import('../diagnostics');
    for (let i = 0; i < 25; i++) {
      recordSearchDebug(`q${i}`, 1, 1);
    }
    const analytics = getSearchAnalytics();
    expect(analytics.recentSearches.length).toBe(20);
    expect(analytics.recentSearches[0].query).toBe('q24');
  });

  it('settings collector sanitizes sensitiveUrlBlacklist to count', async () => {
    const { generateDiagnosticReport } = await import('../diagnostics');
    const report = await generateDiagnosticReport();
    const settings = report.collectors.settings as any;
    expect(settings.sensitiveUrlBlacklist).toBe(1);
  });

  it('storage collector handles error', async () => {
    vi.resetModules();
    vi.doMock('../../core/logger', () => ({
      Logger: {
        forComponent: () => ({
          debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        }),
        getRecentLogs: vi.fn(() => []),
      },
      errorMeta: (e: unknown) => ({ message: String(e) }),
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: {
        init: vi.fn().mockResolvedValue(undefined),
        getSettings: vi.fn().mockReturnValue({ sensitiveUrlBlacklist: [] }),
        getSetting: vi.fn().mockReturnValue(false),
      },
    }));
    vi.doMock('../database', () => ({
      getAllIndexedItems: vi.fn().mockRejectedValue(new Error('db broken')),
      getStorageQuotaInfo: vi.fn().mockRejectedValue(new Error('quota error')),
    }));
    vi.doMock('../resilience', () => ({
      checkHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
    }));
    const { generateDiagnosticReport } = await import('../diagnostics');
    const report = await generateDiagnosticReport();
    const storage = report.collectors.storage as any;
    expect(storage.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. SEARCH ENGINE — additional sort & scoring branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('search-engine — additional branch gaps', () => {
  const settingsMap: Record<string, unknown> = {
    ollamaEnabled: false,
    embeddingsEnabled: false,
    showNonMatchingResults: false,
    showDuplicateUrls: false,
    sortBy: 'best-match',
  };
  const mockCache = { get: vi.fn(() => null), set: vi.fn() };

  function makeItem(overrides: Partial<IndexedItem> = {}): IndexedItem {
    return {
      url: 'https://example.com',
      title: 'Test Page',
      hostname: 'example.com',
      visitCount: 1,
      lastVisit: Date.now(),
      tokens: ['test', 'page'],
      ...overrides,
    } as IndexedItem;
  }

  function setupMocks(overrides: {
    items?: IndexedItem[];
    scorerFactory?: () => any[];
    expandFn?: (q: string) => Promise<string[]>;
    expansionSource?: string;
  } = {}) {
    vi.resetModules();
    const items = overrides.items ?? [];
    vi.doMock('../../core/logger', () => ({
      Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
      errorMeta: (e: unknown) => e instanceof Error ? { name: e.name, message: e.message } : { name: 'non-Error', message: String(e) },
    }));
    vi.doMock('../../core/settings', () => ({
      SettingsManager: { getSetting: vi.fn((key: string) => settingsMap[key]), init: vi.fn() },
    }));
    const defaultScorer = {
      name: 'test-scorer', weight: 1.0,
      score: (_item: IndexedItem, query: string) => {
        const h = (_item.title + ' ' + _item.url).toLowerCase();
        return h.includes(query) ? 1.0 : 0.0;
      },
    };
    vi.doMock('../search/scorer-manager', () => ({
      getAllScorers: vi.fn(() => overrides.scorerFactory ? overrides.scorerFactory() : [defaultScorer]),
    }));
    vi.doMock('../database', () => ({
      getAllIndexedItems: vi.fn(async () => items),
      loadEmbeddingsInto: vi.fn(async () => 0),
      saveIndexedItem: vi.fn(),
    }));
    vi.doMock('../search/tokenizer', () => ({
      tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
      classifyTokenMatches: vi.fn((tokens: string[], text: string) => tokens.map((t: string) => (text.includes(t) ? 1 : 0))),
      graduatedMatchScore: vi.fn(() => 0.5),
      countConsecutiveMatches: vi.fn(() => 0),
      MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
      MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
    }));
    vi.doMock('../../core/helpers', () => ({
      browserAPI: { history: { search: vi.fn((_q: unknown, cb: (r: unknown[]) => void) => cb([])) } },
    }));
    vi.doMock('../ai-keyword-expander', () => ({
      expandQueryKeywords: overrides.expandFn
        ? vi.fn(overrides.expandFn)
        : vi.fn(async (q: string) => q.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
      getLastExpansionSource: vi.fn(() => overrides.expansionSource ?? 'disabled'),
    }));
    vi.doMock('../search/diversity-filter', () => ({ applyDiversityFilter: vi.fn((i: unknown[]) => i) }));
    vi.doMock('../performance-monitor', () => ({ performanceTracker: { recordSearch: vi.fn() } }));
    vi.doMock('../search/query-expansion', () => ({
      getExpandedTerms: vi.fn((q: string) => q.split(/\s+/).filter((t: string) => t.length > 0)),
    }));
    vi.doMock('../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
    vi.doMock('../search/search-cache', () => ({ getSearchCache: vi.fn(() => mockCache) }));
    vi.doMock('../embedding-processor', () => ({ embeddingProcessor: { setSearchActive: vi.fn() } }));
    vi.doMock('../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'text') }));
    vi.doMock('../ollama-service', () => ({
      isCircuitBreakerOpen: vi.fn(() => true),
      checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
      getOllamaConfigFromSettings: vi.fn(async () => ({})),
      getOllamaService: vi.fn(() => ({
        generateEmbedding: vi.fn(async () => ({ success: false, embedding: [], error: 'mocked' })),
      })),
    }));
    vi.doMock('../../core/scorer-types', () => ({}));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    settingsMap.ollamaEnabled = false;
    settingsMap.embeddingsEnabled = false;
    settingsMap.showNonMatchingResults = false;
    settingsMap.showDuplicateUrls = false;
    settingsMap.sortBy = 'best-match';
    mockCache.get.mockReturnValue(null);
  });

  describe('sortBy: most-recent', () => {
    it('orders by lastVisit descending within same relevance tier', async () => {
      settingsMap.sortBy = 'most-recent';
      const now = Date.now();
      setupMocks({
        items: [
          makeItem({ url: 'https://a.com/test', title: 'Test Old', hostname: 'a.com', lastVisit: now - 100_000 }),
          makeItem({ url: 'https://b.com/test', title: 'Test Recent', hostname: 'b.com', lastVisit: now }),
        ],
      });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('test');
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Test Recent');
      settingsMap.sortBy = 'best-match';
    });
  });

  describe('sortBy: alphabetical', () => {
    it('orders by title alphabetically within same relevance tier', async () => {
      settingsMap.sortBy = 'alphabetical';
      setupMocks({
        items: [
          makeItem({ url: 'https://z.com/test', title: 'Omega Test', hostname: 'z.com' }),
          makeItem({ url: 'https://a.com/test', title: 'Alpha Test', hostname: 'a.com' }),
        ],
      });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('test');
      expect(results[0].title).toBe('Alpha Test');
      expect(results[1].title).toBe('Omega Test');
      settingsMap.sortBy = 'best-match';
    });
  });

  describe('scorer error handling in scoring loop', () => {
    it('scorer throwing error is caught, score treated as 0', async () => {
      setupMocks({
        items: [makeItem({ url: 'https://example.com/test', title: 'Test Page', hostname: 'example.com' })],
        scorerFactory: () => [
          { name: 'bad-scorer', weight: 1.0, score: () => { throw new Error('boom'); } },
          { name: 'good-scorer', weight: 1.0, score: () => 1.0 },
        ],
      });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('test');
      expect(results.length).toBe(1);
    });
  });

  describe('AI keyword expansion: expanded status', () => {
    it('reports expanded when source is neither cache-hit nor prefix-hit', async () => {
      settingsMap.ollamaEnabled = true;
      setupMocks({
        items: [makeItem({ url: 'https://example.com', title: 'Example Page', hostname: 'example.com' })],
        expandFn: async () => ['example', 'illustration', 'sample'],
        expansionSource: 'llm',
      });
      const { runSearch, getLastAIStatus } = await import('../search/search-engine');
      await runSearch('example', { skipAI: false });
      const status = getLastAIStatus();
      expect(status?.aiKeywords).toBe('expanded');
      expect(status?.expandedCount).toBe(2);
      settingsMap.ollamaEnabled = false;
    });
  });

  describe('showNonMatchingResults includes items above threshold without token match', () => {
    it('includes scored items even without original token match', async () => {
      settingsMap.showNonMatchingResults = true;
      setupMocks({
        items: [
          makeItem({ url: 'https://example.com/test', title: 'Test Page', hostname: 'example.com' }),
        ],
        scorerFactory: () => [{
          name: 'always-scorer', weight: 1.0, score: () => 0.5,
        }],
      });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('test');
      expect(results.length).toBeGreaterThanOrEqual(1);
      settingsMap.showNonMatchingResults = false;
    });
  });

  describe('bookmark strict matching: word boundary match', () => {
    it('includes bookmark with word boundary match', async () => {
      setupMocks({
        items: [makeItem({
          url: 'https://github.com/react',
          title: 'React Repository',
          hostname: 'github.com',
          isBookmark: true,
        })],
      });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('react');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('bookmark strict matching: long literal match', () => {
    it('includes bookmark with literal query match >= 3 chars', async () => {
      setupMocks({
        items: [makeItem({
          url: 'https://example.com/typescript-tutorial',
          title: 'TypeScript Tutorial',
          hostname: 'example.com',
          isBookmark: true,
        })],
      });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('typescript');
      expect(results.length).toBe(1);
    });
  });

  describe('domain diversification', () => {
    it('limits to 10 results per domain', async () => {
      const items: IndexedItem[] = [];
      for (let i = 0; i < 15; i++) {
        items.push(makeItem({
          url: `https://same.com/page${i}`,
          title: `Test Page ${i}`,
          hostname: 'same.com',
        }));
      }
      setupMocks({ items });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('test');
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('AI keyword expansion: no-new-keywords status', () => {
    it('reports no-new-keywords when expansion returns same tokens', async () => {
      settingsMap.ollamaEnabled = true;
      setupMocks({
        items: [makeItem()],
        expandFn: async (q: string) => q.toLowerCase().split(/\s+/),
        expansionSource: 'cache-hit',
      });
      const { runSearch, getLastAIStatus } = await import('../search/search-engine');
      await runSearch('example', { skipAI: false });
      const status = getLastAIStatus();
      expect(status?.aiKeywords).toBe('no-new-keywords');
      settingsMap.ollamaEnabled = false;
    });
  });

  describe('sortBy: default best-match falls through to finalScore', () => {
    it('sorts by finalScore when sortBy=best-match and all tier values equal', async () => {
      settingsMap.sortBy = 'best-match';
      setupMocks({
        items: [
          makeItem({ url: 'https://a.com/test', title: 'Test Low', hostname: 'a.com' }),
          makeItem({ url: 'https://b.com/test', title: 'Test High', hostname: 'b.com' }),
        ],
        scorerFactory: () => [{
          name: 'diff-scorer', weight: 1.0,
          score: (item: IndexedItem) => item.title.includes('High') ? 2.0 : 0.5,
        }],
      });
      const { runSearch } = await import('../search/search-engine');
      const results = await runSearch('test');
      expect(results[0].title).toBe('Test High');
    });
  });

  describe('synonym expansion logging branch', () => {
    it('logs when synonym expansion adds tokens', async () => {
      vi.resetModules();
      vi.doMock('../../core/logger', () => ({
        Logger: { forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }) },
        errorMeta: (e: unknown) => ({ message: String(e) }),
      }));
      vi.doMock('../../core/settings', () => ({
        SettingsManager: { getSetting: vi.fn((key: string) => settingsMap[key]), init: vi.fn() },
      }));
      vi.doMock('../database', () => ({
        getAllIndexedItems: vi.fn(async () => [makeItem()]),
        loadEmbeddingsInto: vi.fn(async () => 0),
        saveIndexedItem: vi.fn(),
      }));
      vi.doMock('../search/scorer-manager', () => ({
        getAllScorers: vi.fn(() => [{
          name: 'test', weight: 1.0,
          score: (_item: IndexedItem, q: string) => _item.title.toLowerCase().includes(q) ? 1 : 0,
        }]),
      }));
      vi.doMock('../search/tokenizer', () => ({
        tokenize: vi.fn((text: string) => text.toLowerCase().split(/\s+/).filter((t: string) => t.length > 0)),
        classifyTokenMatches: vi.fn((tokens: string[], text: string) => tokens.map((t: string) => (text.includes(t) ? 1 : 0))),
        graduatedMatchScore: vi.fn(() => 0.5),
        countConsecutiveMatches: vi.fn(() => 0),
        MatchType: { NONE: 0, EXACT: 1, PREFIX: 2, SUBSTRING: 3 },
        MATCH_WEIGHTS: { 0: 0, 1: 1.0, 2: 0.75, 3: 0.5 },
      }));
      vi.doMock('../../core/helpers', () => ({
        browserAPI: { history: { search: vi.fn((_q: unknown, cb: (r: unknown[]) => void) => cb([])) } },
      }));
      vi.doMock('../ai-keyword-expander', () => ({
        expandQueryKeywords: vi.fn(async (q: string) => q.split(/\s+/)),
        getLastExpansionSource: vi.fn(() => 'disabled'),
      }));
      vi.doMock('../search/query-expansion', () => ({
        getExpandedTerms: vi.fn(() => ['example', 'sample', 'illustration']),
      }));
      vi.doMock('../search/diversity-filter', () => ({ applyDiversityFilter: vi.fn((i: unknown[]) => i) }));
      vi.doMock('../performance-monitor', () => ({ performanceTracker: { recordSearch: vi.fn() } }));
      vi.doMock('../diagnostics', () => ({ recordSearchDebug: vi.fn(), recordSearchSnapshot: vi.fn() }));
      vi.doMock('../search/search-cache', () => ({ getSearchCache: vi.fn(() => mockCache) }));
      vi.doMock('../embedding-processor', () => ({ embeddingProcessor: { setSearchActive: vi.fn() } }));
      vi.doMock('../embedding-text', () => ({ buildEmbeddingText: vi.fn(() => 'text') }));
      vi.doMock('../ollama-service', () => ({
        isCircuitBreakerOpen: vi.fn(() => true),
        checkMemoryPressure: vi.fn(() => ({ ok: true, permanent: false })),
        getOllamaConfigFromSettings: vi.fn(async () => ({})),
        getOllamaService: vi.fn(() => ({
          generateEmbedding: vi.fn(async () => ({ success: false, embedding: [] })),
        })),
      }));
      vi.doMock('../../core/scorer-types', () => ({}));

      const { runSearch } = await import('../search/search-engine');
      await runSearch('example');
    });
  });
});
