/**
 * Search Analytics & Debug System
 * 
 * Captures search queries, results, scoring details, and performance metrics
 * for debugging and algorithm analysis.
 */

import { Logger } from "../core/logger";

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
  private readonly STORAGE_KEY = "search_debug_history";

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.loadFromStorage();
  }

  /**
   * Enable/disable debug logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('setEnabled', `Search debug ${enabled ? "enabled" : "disabled"}`);
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
  logSearch(entry: Omit<SearchDebugEntry, "timestamp" | "sessionId">): void {
    if (!this.enabled) return;

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
    logger.info('clearHistory', "Search debug history cleared");
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
   * Load history from IndexedDB
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.searchHistory = JSON.parse(stored);
        logger.debug('loadFromStorage',
          `Loaded ${this.searchHistory.length} debug entries from storage`
        );
      }
    } catch (err) {
      logger.error('loadFromStorage', "Failed to load search debug history", err);
    }
  }

  /**
   * Save history to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(this.searchHistory)
      );
    } catch (err) {
      logger.error('saveToStorage', "Failed to save search debug history", err);
    }
  }
}

// Singleton instance
export const searchDebugService = new SearchDebugService();
