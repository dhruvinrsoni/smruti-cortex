/**
 * Unit tests for recent-interactions.ts (chrome.storage.local)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('recent-interactions', () => {
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

  it('getRecentInteractions returns empty when storage is empty', async () => {
    const { getRecentInteractions } = await import('../recent-interactions');
    await expect(getRecentInteractions()).resolves.toEqual([]);
  });

  it('getRecentInteractions returns stored array', async () => {
    const stored = [{ url: 'https://a.com', title: 'A', timestamp: 1, action: 'click' as const }];
    get.mockResolvedValueOnce({ recentInteractions: stored });
    const { getRecentInteractions } = await import('../recent-interactions');
    await expect(getRecentInteractions()).resolves.toEqual(stored);
  });

  it('getRecentInteractions returns empty when value is not an array', async () => {
    get.mockResolvedValueOnce({ recentInteractions: 123 });
    const { getRecentInteractions } = await import('../recent-interactions');
    await expect(getRecentInteractions()).resolves.toEqual([]);
  });

  it('getRecentInteractions returns empty on storage error', async () => {
    get.mockRejectedValueOnce(new Error('fail'));
    const { getRecentInteractions } = await import('../recent-interactions');
    await expect(getRecentInteractions()).resolves.toEqual([]);
  });

  it('addRecentInteraction does nothing for empty url', async () => {
    const { addRecentInteraction } = await import('../recent-interactions');
    await addRecentInteraction('', 't', 'click');
    expect(get).not.toHaveBeenCalled();
  });

  it('addRecentInteraction prepends and dedupes by url', async () => {
    get.mockResolvedValueOnce({
      recentInteractions: [
        { url: 'https://keep.com', title: 'K', timestamp: 1, action: 'copy' as const },
        { url: 'https://dup.com', title: 'Old', timestamp: 2, action: 'click' as const },
      ],
    });
    const { addRecentInteraction } = await import('../recent-interactions');
    await addRecentInteraction('https://dup.com', 'New title', 'background-tab');
    expect(set).toHaveBeenCalledTimes(1);
    const payload = set.mock.calls[0][0] as { recentInteractions: { url: string; title: string; action: string }[] };
    expect(payload.recentInteractions[0]).toMatchObject({
      url: 'https://dup.com',
      title: 'New title',
      action: 'background-tab',
    });
    expect(payload.recentInteractions.some(e => e.url === 'https://keep.com')).toBe(true);
  });

  it('addRecentInteraction uses url as title when title empty', async () => {
    get.mockResolvedValueOnce({ recentInteractions: [] });
    const { addRecentInteraction } = await import('../recent-interactions');
    await addRecentInteraction('https://only-url.com', '', 'click');
    const payload = set.mock.calls[0][0] as { recentInteractions: { title: string }[] };
    expect(payload.recentInteractions[0].title).toBe('https://only-url.com');
  });

  it('addRecentInteraction caps list length', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      url: `https://x.com/${i}`,
      title: `T${i}`,
      timestamp: i,
      action: 'click' as const,
    }));
    get.mockResolvedValueOnce({ recentInteractions: many });
    const { addRecentInteraction } = await import('../recent-interactions');
    await addRecentInteraction('https://new.com', 'N', 'copy');
    const payload = set.mock.calls[0][0] as { recentInteractions: unknown[] };
    expect(payload.recentInteractions.length).toBe(20);
  });

  it('addRecentInteraction swallows errors', async () => {
    get.mockRejectedValueOnce(new Error('read fail'));
    const { addRecentInteraction } = await import('../recent-interactions');
    await expect(addRecentInteraction('https://z.com', 'Z', 'click')).resolves.toBeUndefined();
  });

  it('clearRecentInteractions removes key', async () => {
    const { clearRecentInteractions } = await import('../recent-interactions');
    await clearRecentInteractions();
    expect(remove).toHaveBeenCalledWith('recentInteractions');
  });

  it('clearRecentInteractions swallows errors', async () => {
    remove.mockRejectedValueOnce(new Error('remove fail'));
    const { clearRecentInteractions } = await import('../recent-interactions');
    await expect(clearRecentInteractions()).resolves.toBeUndefined();
  });
});
