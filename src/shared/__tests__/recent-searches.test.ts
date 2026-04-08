/**
 * Unit tests for recent-searches.ts (chrome.storage.local)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('recent-searches', () => {
  const get = vi.fn();
  const set = vi.fn();
  const remove = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    get.mockReset();
    set.mockReset();
    remove.mockReset();
    get.mockResolvedValue({});
    set.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: { get, set, remove },
      },
    });
  });

  it('getRecentSearches returns empty array when storage is empty', async () => {
    const { getRecentSearches } = await import('../recent-searches');
    await expect(getRecentSearches()).resolves.toEqual([]);
  });

  it('getRecentSearches returns stored array', async () => {
    const stored = [{ query: 'foo', timestamp: 1 }];
    get.mockResolvedValueOnce({ recentSearches: stored });
    const { getRecentSearches } = await import('../recent-searches');
    await expect(getRecentSearches()).resolves.toEqual(stored);
  });

  it('getRecentSearches returns empty when value is not an array', async () => {
    get.mockResolvedValueOnce({ recentSearches: 'bad' });
    const { getRecentSearches } = await import('../recent-searches');
    await expect(getRecentSearches()).resolves.toEqual([]);
  });

  it('getRecentSearches returns empty on storage error', async () => {
    get.mockRejectedValueOnce(new Error('storage fail'));
    const { getRecentSearches } = await import('../recent-searches');
    await expect(getRecentSearches()).resolves.toEqual([]);
  });

  it('addRecentSearch does nothing for short or empty query', async () => {
    const { addRecentSearch } = await import('../recent-searches');
    await addRecentSearch('');
    await addRecentSearch('   ');
    await addRecentSearch('a');
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('addRecentSearch prepends entry and dedupes case-insensitively', async () => {
    get.mockResolvedValueOnce({
      recentSearches: [
        { query: 'Other', timestamp: 1 },
        { query: 'hello', timestamp: 2 },
      ],
    });
    const { addRecentSearch } = await import('../recent-searches');
    await addRecentSearch('  Hello  ', 'https://x.com');
    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0][0] as { recentSearches: { query: string; selectedUrl?: string }[] };
    expect(payload.recentSearches[0].query).toBe('Hello');
    expect(payload.recentSearches[0].selectedUrl).toBe('https://x.com');
    expect(payload.recentSearches.find(e => e.query.toLowerCase() === 'hello')).toBe(payload.recentSearches[0]);
    expect(payload.recentSearches.some(e => e.query === 'Other')).toBe(true);
  });

  it('addRecentSearch caps at MAX_ENTRIES', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ query: `q${i}`, timestamp: i }));
    get.mockResolvedValueOnce({ recentSearches: many });
    const { addRecentSearch } = await import('../recent-searches');
    await addRecentSearch('newquery');
    const payload = set.mock.calls[0][0] as { recentSearches: unknown[] };
    expect(payload.recentSearches.length).toBe(20);
    expect(payload.recentSearches[0]).toMatchObject({ query: 'newquery' });
  });

  it('addRecentSearch swallows errors', async () => {
    get.mockRejectedValueOnce(new Error('read fail'));
    const { addRecentSearch } = await import('../recent-searches');
    await expect(addRecentSearch('valid query')).resolves.toBeUndefined();
  });

  it('clearRecentSearches removes key', async () => {
    const { clearRecentSearches } = await import('../recent-searches');
    await clearRecentSearches();
    expect(remove).toHaveBeenCalledWith('recentSearches');
  });

  it('clearRecentSearches swallows errors', async () => {
    remove.mockRejectedValueOnce(new Error('remove fail'));
    const { clearRecentSearches } = await import('../recent-searches');
    await expect(clearRecentSearches()).resolves.toBeUndefined();
  });
});
