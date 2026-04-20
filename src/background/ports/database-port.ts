import type { IndexedItem } from '../schema';

export interface StorageQuotaInfo {
  used: number;
  total: number;
  usedFormatted: string;
  totalFormatted: string;
  percentage: number;
  itemCount: number;
}

/**
 * Port for all IndexedDB persistence operations.
 * Production adapter: database.ts functions wrapped in a class.
 * Test adapter: in-memory fake.
 */
export interface IDatabasePort {
  openDatabase(): Promise<IDBDatabase>;
  saveIndexedItem(item: IndexedItem): Promise<void>;
  getAllIndexedItems(): Promise<IndexedItem[]>;
  loadEmbeddingsInto(items: IndexedItem[]): Promise<number>;
  getRecentIndexedItems(limit?: number): Promise<IndexedItem[]>;
  getIndexedItem(url: string): Promise<IndexedItem | null>;
  deleteIndexedItem(url: string): Promise<void>;
  clearIndexedDB(): Promise<void>;
  countItemsWithoutEmbeddings(): Promise<{ total: number; withoutEmbeddings: number }>;
  getItemsWithoutEmbeddingsBatch(batchSize: number): Promise<IndexedItem[]>;
  getStorageQuotaInfo(): Promise<StorageQuotaInfo>;
  setForceRebuildFlag(value: boolean): Promise<void>;
  getForceRebuildFlag(): Promise<boolean>;
  invalidateItemCache(): void;
  resetDbInstance(): void;
}
