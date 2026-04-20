/**
 * Port for extension key-value storage (chrome.storage.local).
 * Production adapter: wraps browserAPI.storage.local.
 * Test adapter: in-memory Map.
 */
export interface IStoragePort {
  get<T>(key: string, defaultValue: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
