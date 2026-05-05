/**
 * Search Analytics & Debug System
 * 
 * Captures search queries, results, scoring details, and performance metrics
 * for debugging and algorithm analysis.
 */

import { Logger, errorMeta } from '../core/logger';
import { browserAPI } from '../core/helpers';

const logger = Logger.forComponent('SearchDebug');

export interface SearchDebugEntry {
  timestamp: number;
  sessionId: string;
  query: string;
  queryLength: number;
  resultCount: number;
  results: Array<{
    id: string;
    url: string;
    title: string;
    score: number;
    scores?: {
      title?: number;
      url?: number;
      recency?: number;
      frequency?: number;
      metadata?: number;
      embedding?: number;
      total: number;
    };
    rank: number;
  }>;
  performance: {
    searchDuration: number;
    scoringDuration: number;
    filteringDuration: number;
    totalDuration: number;
  };
  settings: {
    strictMode: boolean;
    diverseResults: boolean;
    aiEnabled: boolean;
    semanticEnabled: boolean;
  };
  metadata: {
    totalHistoryItems: number;
    cacheHits: number;
    cacheMisses: number;
  };
}

export interface SearchAnalytics {
  totalSearches: number;
  averageResultCount: number;
  averageSearchDuration: number;
  topQueries: Array<{ query: string; count: number }>;
  queryLengthDistribution: { [key: number]: number };
}

class SearchDebugService {
  private enabled = false;
  private sessionId: string;
  private searchHistory: SearchDebugEntry[] = [];
  private readonly MAX_HISTORY = 1000; // Keep last 1000 searches
  private readonly STORAGE_KEY = 'search_debug_history';

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    void this.loadFromStorage();
  }

  /**
   * Enable/disable debug logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('setEnabled', `Search debug ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if debug logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Log a search operation with full debug details
   */
  logSearch(entry: Omit<SearchDebugEntry, 'timestamp' | 'sessionId'>): void {
    if (!this.enabled) {return;}

    const fullEntry: SearchDebugEntry = {
      ...entry,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };

    this.searchHistory.push(fullEntry);

    // Trim history if too large
    if (this.searchHistory.length > this.MAX_HISTORY) {
      this.searchHistory = this.searchHistory.slice(-this.MAX_HISTORY);
    }

    // Save to storage
    this.saveToStorage();

    logger.debug('logSearch', 'Search logged', JSON.stringify({
      query: entry.query,
      results: entry.resultCount,
      duration: entry.performance.totalDuration,
    }));
  }

  /**
   * Get all search history
   */
  getHistory(): SearchDebugEntry[] {
    return [...this.searchHistory];
  }

  /**
   * Get searches from current session only
   */
  getSessionHistory(): SearchDebugEntry[] {
    return this.searchHistory.filter((e) => e.sessionId === this.sessionId);
  }

  /**
   * Get analytics summary
   */
  getAnalytics(): SearchAnalytics {
    const history = this.searchHistory;
    const totalSearches = history.length;

    if (totalSearches === 0) {
      return {
        totalSearches: 0,
        averageResultCount: 0,
        averageSearchDuration: 0,
        topQueries: [],
        queryLengthDistribution: {},
      };
    }

    // Calculate averages
    const totalResults = history.reduce((sum, e) => sum + e.resultCount, 0);
    const totalDuration = history.reduce(
      (sum, e) => sum + e.performance.totalDuration,
      0
    );

    // Top queries
    const queryCounts = new Map<string, number>();
    history.forEach((e) => {
      const normalized = e.query.toLowerCase().trim();
      queryCounts.set(normalized, (queryCounts.get(normalized) || 0) + 1);
    });
    const topQueries = Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Query length distribution
    const queryLengthDistribution: { [key: number]: number } = {};
    history.forEach((e) => {
      const len = e.queryLength;
      queryLengthDistribution[len] = (queryLengthDistribution[len] || 0) + 1;
    });

    return {
      totalSearches,
      averageResultCount: totalResults / totalSearches,
      averageSearchDuration: totalDuration / totalSearches,
      topQueries,
      queryLengthDistribution,
    };
  }

  /**
   * Export all debug data as JSON
   */
  exportDebugData(): string {
    const data = {
      sessionId: this.sessionId,
      exportTimestamp: Date.now(),
      history: this.searchHistory,
      analytics: this.getAnalytics(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear all debug history
   */
  clearHistory(): void {
    this.searchHistory = [];
    this.saveToStorage();
    logger.info('clearHistory', 'Search debug history cleared');
  }

  /**
   * Find searches with specific query
   */
  findByQuery(query: string): SearchDebugEntry[] {
    const normalized = query.toLowerCase().trim();
    return this.searchHistory.filter(
      (e) => e.query.toLowerCase().includes(normalized)
    );
  }

  /**
   * Find searches with performance issues (slow searches)
   */
  findSlowSearches(thresholdMs = 100): SearchDebugEntry[] {
    return this.searchHistory.filter(
      (e) => e.performance.totalDuration > thresholdMs
    );
  }

  /**
   * Find searches with zero results
   */
  findZeroResults(): SearchDebugEntry[] {
    return this.searchHistory.filter((e) => e.resultCount === 0);
  }

  /**
   * Load history from browser storage (prefer `chrome.storage.local`), fall back to `localStorage`.
   * Non-blocking and resilient so it cannot crash the service worker at module load.
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const storageLocal = (browserAPI as any).storage?.local;
      if (storageLocal && typeof storageLocal.get === 'function') {
        const result = await new Promise<any>((resolve) => {
          storageLocal.get([this.STORAGE_KEY], (items: any) => {
            resolve(items?.[this.STORAGE_KEY]);
          });
        });
        if (result && Array.isArray(result)) {
          this.searchHistory = result;
          logger.debug('loadFromStorage', `Loaded ${this.searchHistory.length} debug entries from storage`);
          return;
        }
      }

      // Fallback for environments that expose `localStorage` (e.g., tests)
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
          this.searchHistory = JSON.parse(stored);
          logger.debug('loadFromStorage', `Loaded ${this.searchHistory.length} debug entries from storage`);
        }
      }
    } catch (err) {
      logger.error('loadFromStorage', 'Failed to load search debug history', errorMeta(err));
    }
  }

  /**
   * Persist history to browser storage (prefer `chrome.storage.local`), fall back to `localStorage`.
   */
  private async saveToStorage(): Promise<void> {
    try {
      const storageLocal = (browserAPI as any).storage?.local;
      if (storageLocal && typeof storageLocal.set === 'function') {
        await new Promise<void>((resolve) => {
          storageLocal.set({ [this.STORAGE_KEY]: this.searchHistory }, () => resolve());
        });
        return;
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.searchHistory));
      }
    } catch (err) {
      logger.error('saveToStorage', 'Failed to save search debug history', errorMeta(err));
    }
  }
}

// Singleton instance
export const searchDebugService = new SearchDebugService();
