/**
 * recent-searches.ts — Persists and retrieves recent search queries.
 * Shared between popup and quick-search overlay via chrome.storage.local.
 */

export interface RecentSearchEntry {
  query: string;
  timestamp: number;
  selectedUrl?: string;
}

const STORAGE_KEY = 'recentSearches';
const MAX_ENTRIES = 20;

export async function getRecentSearches(): Promise<RecentSearchEntry[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const entries = result[STORAGE_KEY];
    if (Array.isArray(entries)) {return entries;}
    return [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(query: string, selectedUrl?: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {return;}

  try {
    const entries = await getRecentSearches();

    // Remove duplicate of the same query (case-insensitive)
    const filtered = entries.filter(e => e.query.toLowerCase() !== trimmed.toLowerCase());

    const entry: RecentSearchEntry = {
      query: trimmed,
      timestamp: Date.now(),
      ...(selectedUrl ? { selectedUrl } : {}),
    };

    // Prepend new entry, cap at MAX_ENTRIES
    const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  } catch {
    // Silently fail — non-critical
  }
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}
