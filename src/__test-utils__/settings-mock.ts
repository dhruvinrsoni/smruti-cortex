/**
 * Shared SettingsManager mock with configurable defaults.
 *
 * Usage:
 *   vi.mock('../../core/settings', () => mockSettings({ sortBy: 'recency' }));
 *
 * Pass only the settings your test cares about; the rest use sensible defaults.
 */
import { vi } from 'vitest';

const DEFAULT_SETTINGS: Record<string, unknown> = {
  displayMode: 'list',
  logLevel: 2,
  highlightMatches: true,
  focusDelayMs: 450,
  ollamaEnabled: false,
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2:1b',
  ollamaTimeout: 30000,
  aiSearchDelayMs: 500,
  embeddingsEnabled: false,
  embeddingModel: 'nomic-embed-text:latest',
  loadFavicons: true,
  sensitiveUrlBlacklist: [],
  indexBookmarks: true,
  showDuplicateUrls: false,
  showNonMatchingResults: false,
  sortBy: 'best-match',
  defaultResultCount: 50,
  selectAllOnFocus: false,
  showRecentHistory: true,
  maxResults: 200,
  theme: 'system',
  commandPaletteEnabled: true,
  webSearchEngine: 'google',
  developerGithubPat: '',
};

/**
 * Returns a factory-compatible mock for `vi.mock('…/settings', () => mockSettings({...}))`.
 */
export function mockSettings(overrides: Record<string, unknown> = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };

  return {
    SettingsManager: {
      init: vi.fn().mockResolvedValue(undefined),
      getSetting: vi.fn((key: string) => settings[key]),
      getSettings: vi.fn(() => ({ ...settings })),
      setSetting: vi.fn(),
      updateSettings: vi.fn(),
      applyRemoteSettings: vi.fn(),
    },
    SETTINGS_SCHEMA: {},
    DisplayMode: { List: 'list', Card: 'card' },
  };
}
