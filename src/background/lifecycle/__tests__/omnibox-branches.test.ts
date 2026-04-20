 
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockTabsQuery = vi.fn();
const mockTabsGet = vi.fn();
const mockTabsUpdate = vi.fn();
const mockTabsCreate = vi.fn();
const mockWindowsUpdate = vi.fn();
const mockBookmarksSearch = vi.fn();
const mockRuntimeSendMessage = vi.fn();
const inputChangedListeners: Array<(t: string, s: (r: any[]) => void) => void | Promise<void>> = [];
const inputEnteredListeners: Array<(t: string, d: string) => void | Promise<void>> = [];

vi.mock('../../../core/helpers', () => ({
  browserAPI: {
    omnibox: {
      setDefaultSuggestion: vi.fn(),
      onInputChanged: { addListener: (cb: any) => { inputChangedListeners.push(cb); } },
      onInputEntered: { addListener: (cb: any) => { inputEnteredListeners.push(cb); } },
    },
    tabs: {
      query: (...a: unknown[]) => mockTabsQuery(...a),
      get: (...a: unknown[]) => mockTabsGet(...a),
      update: (...a: unknown[]) => mockTabsUpdate(...a),
      create: (...a: unknown[]) => mockTabsCreate(...a),
    },
    windows: { update: (...a: unknown[]) => mockWindowsUpdate(...a) },
    bookmarks: { search: (...a: unknown[]) => mockBookmarksSearch(...a) },
    runtime: {
      sendMessage: (...a: unknown[]) => mockRuntimeSendMessage(...a),
      lastError: null,
    },
  },
}));

vi.mock('../../../core/logger', () => ({
  Logger: {
    forComponent: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
    }),
  },
  errorMeta: (e: unknown) => e,
}));

vi.mock('../../../core/settings', () => ({
  SettingsManager: { getSettings: vi.fn(() => ({})) },
}));

vi.mock('../../search/search-engine', () => ({
  runSearch: vi.fn(async () => []),
}));

import { setupOmnibox } from '../omnibox';

describe('Omnibox — branch gaps', () => {
  let onChanged: (typeof inputChangedListeners)[0];
  let onEntered: (typeof inputEnteredListeners)[0];

  beforeEach(() => {
    vi.clearAllMocks();
    inputChangedListeners.length = 0;
    inputEnteredListeners.length = 0;
    mockTabsQuery.mockResolvedValue([]);
    mockTabsGet.mockResolvedValue({ id: 1, windowId: 10 });
    mockTabsUpdate.mockResolvedValue({});
    mockTabsCreate.mockResolvedValue({});
    mockWindowsUpdate.mockResolvedValue({});
    mockBookmarksSearch.mockResolvedValue([]);

    setupOmnibox(() => true);
    onChanged = inputChangedListeners[0];
    onEntered = inputEnteredListeners[0];
  });

  it('onInputChanged: not initialized → empty suggestions', async () => {
    inputChangedListeners.length = 0;
    inputEnteredListeners.length = 0;
    setupOmnibox(() => false);
    const cb = inputChangedListeners[0];
    const suggest = vi.fn();
    await cb('hello', suggest);
    expect(suggest).toHaveBeenCalledWith([]);
  });

  it('onInputChanged: empty trimmed → empty suggestions', async () => {
    const suggest = vi.fn();
    await onChanged('   ', suggest);
    expect(suggest).toHaveBeenCalledWith([]);
  });

  it('onInputChanged: # without query → returns without calling suggest with bookmarks', async () => {
    const suggest = vi.fn();
    await onChanged('#', suggest);
    expect(mockBookmarksSearch).not.toHaveBeenCalled();
  });

  it('onInputChanged: # with query filters bookmarks without url', async () => {
    mockBookmarksSearch.mockResolvedValue([
      { title: 'Doc', url: 'https://x.com' },
      { title: 'Folder' },
    ]);
    const suggest = vi.fn();
    await onChanged('#docs', suggest);
    expect(suggest).toHaveBeenCalledWith([
      expect.objectContaining({ content: 'https://x.com' }),
    ]);
  });

  it('onInputChanged: @ without query returns all tabs', async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, title: 'Tab1', url: 'https://a.com' },
      { id: 2, title: null, url: null },
    ]);
    const suggest = vi.fn();
    await onChanged('@', suggest);
    expect(suggest).toHaveBeenCalledWith([
      expect.objectContaining({ content: '@tab:1' }),
      expect.objectContaining({ content: '@tab:2', description: expect.stringContaining('Untitled') }),
    ]);
  });

  it('onInputEntered: @tab:NaN does nothing', async () => {
    await onEntered('@tab:abc', 'currentTab');
    expect(mockTabsGet).not.toHaveBeenCalled();
  });

  it('onInputEntered: tab without windowId skips window focus', async () => {
    mockTabsGet.mockResolvedValue({ id: 5, windowId: undefined });
    await onEntered('@tab:5', 'currentTab');
    expect(mockTabsUpdate).toHaveBeenCalledWith(5, { active: true });
    expect(mockWindowsUpdate).not.toHaveBeenCalled();
  });

  it('onInputEntered: / command without url or messageType does nothing', async () => {
    vi.doMock('../../../shared/command-registry', () => ({
      ALL_COMMANDS: [{ id: 'noop-cmd', label: 'Noop' }],
    }));
    await onEntered('/unknown-cmd-xyz', 'currentTab');
    expect(mockTabsCreate).not.toHaveBeenCalled();
    expect(mockRuntimeSendMessage).not.toHaveBeenCalled();
  });

  it('onInputEntered: > prefix also matches commands', async () => {
    vi.doMock('../../../shared/command-registry', () => ({
      ALL_COMMANDS: [{ id: 'test-cmd', url: 'chrome://extensions' }],
    }));
    await onEntered('>test-cmd', 'currentTab');
  });

  it('onInputEntered: currentTab with no activeTab skips update', async () => {
    mockTabsQuery.mockResolvedValue([{ id: undefined }]);
    await onEntered('https://example.com', 'currentTab');
    expect(mockTabsUpdate).not.toHaveBeenCalled();
  });

  it('onInputEntered: error in handler is caught', async () => {
    mockTabsQuery.mockRejectedValue(new Error('boom'));
    await expect(onEntered('https://x.com', 'currentTab')).resolves.toBeUndefined();
  });

  it('onInputChanged: bookmark title fallback to Untitled', async () => {
    mockBookmarksSearch.mockResolvedValue([
      { url: 'https://a.com', title: '' },
    ]);
    const suggest = vi.fn();
    await onChanged('#q', suggest);
    expect(suggest).toHaveBeenCalledWith([
      expect.objectContaining({ description: expect.stringContaining('Untitled') }),
    ]);
  });

  it('onInputChanged: search result without title uses Untitled', async () => {
    const { runSearch } = await import('../../search/search-engine');
    vi.mocked(runSearch).mockResolvedValueOnce([
      { url: 'https://a.com', title: '' } as any,
    ]);
    const suggest = vi.fn();
    await onChanged('test', suggest);
    expect(suggest).toHaveBeenCalledWith([
      expect.objectContaining({ description: expect.stringContaining('Untitled') }),
    ]);
  });
});
