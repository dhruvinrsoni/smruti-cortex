/**
 * recent-interactions.ts — Persists recently clicked/copied/opened results.
 * Shared between popup and quick-search overlay via chrome.storage.local.
 */

export interface RecentInteraction {
  url: string;
  title: string;
  timestamp: number;
  action: 'click' | 'copy' | 'background-tab';
}

const STORAGE_KEY = 'recentInteractions';
const MAX_ENTRIES = 20;

export async function getRecentInteractions(): Promise<RecentInteraction[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const entries = result[STORAGE_KEY];
    if (Array.isArray(entries)) {return entries;}
    return [];
  } catch {
    return [];
  }
}

export async function addRecentInteraction(
  url: string,
  title: string,
  action: RecentInteraction['action']
): Promise<void> {
  if (!url) {return;}

  try {
    const entries = await getRecentInteractions();

    const filtered = entries.filter(e => e.url !== url);

    const entry: RecentInteraction = {
      url,
      title: title || url,
      timestamp: Date.now(),
      action,
    };

    const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  } catch {
    // Silently fail — non-critical
  }
}

export async function clearRecentInteractions(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}
