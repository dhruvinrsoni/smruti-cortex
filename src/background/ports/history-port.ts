/**
 * Port for browser history queries.
 * Production adapter: wraps browserAPI.history.search.
 * Test adapter: returns canned history items.
 */
export interface IHistoryPort {
  search(params: HistorySearchParams): Promise<HistoryItem[]>;
}

export interface HistorySearchParams {
  text: string;
  startTime?: number;
  endTime?: number;
  maxResults?: number;
}

export interface HistoryItem {
  id?: string;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
}
