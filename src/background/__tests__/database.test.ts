import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger, makeItem } from '../../__test-utils__';

// ── Mock Logger ────────────────────────────────────────────────────────────
vi.mock('../../core/logger', () => mockLogger());

// ── Mock browserAPI (chrome.storage.local) ─────────────────────────────────
const storageMock = {
  get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
  set: vi.fn((_items: unknown, cb?: () => void) => cb?.()),
};
vi.mock('../../core/helpers', () => ({
  browserAPI: {
    storage: { local: storageMock },
    runtime: { lastError: null },
  },
}));

vi.mock('../../core/constants', () => ({
  DB_NAME: 'test_db',
}));

// ── IndexedDB mock infrastructure ──────────────────────────────────────────

import type { IndexedItem } from '../schema';

type Store = Map<string, IndexedItem>;
let store: Store;

function mockRequest<T>(resultOrError: T | Error) {
  const req: Record<string, unknown> = { result: undefined, error: null };
  queueMicrotask(() => {
    if (resultOrError instanceof Error) {
      req.error = resultOrError;
      (req.onerror as (() => void))?.();
    } else {
      req.result = resultOrError;
      (req.onsuccess as ((e: unknown) => void))?.({ target: req });
    }
  });
  return req;
}

function mockCursorRequest(items: IndexedItem[]) {
  let idx = 0;
  const req: Record<string, unknown> = { result: undefined, error: null };

  function advance() {
    queueMicrotask(() => {
      if (idx < items.length) {
        const item = items[idx++];
        req.result = {
          value: item,
          continue: () => advance(),
        };
      } else {
        req.result = null;
      }
      (req.onsuccess as ((e: unknown) => void))?.({ target: req });
    });
  }

  queueMicrotask(() => advance());
  return req;
}

let mockObjectStore: Record<string, ReturnType<typeof vi.fn>>;
let mockDb: Record<string, unknown>;
let openShouldFail = false;
let openShouldUpgrade = false;

function buildMockObjectStore() {
  return {
    get: vi.fn((key: string) => mockRequest(store.get(key))),
    put: vi.fn((item: IndexedItem) => {
      store.set(item.url, item);
      return mockRequest(undefined);
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
      return mockRequest(undefined);
    }),
    clear: vi.fn(() => {
      store.clear();
      return mockRequest(undefined);
    }),
    getAll: vi.fn(() => mockRequest([...store.values()])),
    count: vi.fn(() => mockRequest(store.size)),
    openCursor: vi.fn(() => mockCursorRequest([...store.values()])),
    index: vi.fn(() => ({
      openCursor: vi.fn((_range: unknown, _dir: string) =>
        mockCursorRequest([...store.values()].sort((a, b) => b.lastVisit - a.lastVisit))
      ),
    })),
    createIndex: vi.fn(),
  };
}

function setupIndexedDB() {
  mockObjectStore = buildMockObjectStore();
  mockDb = {
    objectStoreNames: { contains: vi.fn(() => !openShouldUpgrade) },
    transaction: vi.fn(() => ({ objectStore: vi.fn(() => mockObjectStore) })),
    createObjectStore: vi.fn(() => mockObjectStore),
  };

  vi.stubGlobal('indexedDB', {
    open: vi.fn(() => {
      const req: Record<string, unknown> = {};
      queueMicrotask(() => {
        if (openShouldFail) {
          req.error = new Error('IDB open failed');
          (req.onerror as (() => void))?.();
        } else {
          req.result = mockDb;
          if (openShouldUpgrade && typeof req.onupgradeneeded === 'function') {
            (req.onupgradeneeded as () => void)();
          }
          (req.onsuccess as (() => void))?.();
        }
      });
      return req;
    }),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('database', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    store = new Map();
    openShouldFail = false;
    openShouldUpgrade = false;
    setupIndexedDB();
  });

  async function importModule() {
    vi.doMock('../../core/logger', () => ({
      Logger: {
        debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        forComponent: () => ({
          debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(),
        }),
      },
    }));
    vi.doMock('../../core/helpers', () => ({
      browserAPI: {
        storage: { local: storageMock },
        runtime: { lastError: null },
      },
    }));
    vi.doMock('../../core/constants', () => ({
      DB_NAME: 'test_db',
    }));
    return import('../database');
  }

  // ── openDatabase ────────────────────────────────────────────────────────

  describe('openDatabase', () => {
    it('should open database successfully', async () => {
      const { openDatabase } = await importModule();
      const db = await openDatabase();
      expect(db).toBe(mockDb);
    });

    it('should reject when open fails', async () => {
      openShouldFail = true;
      setupIndexedDB();
      const { openDatabase } = await importModule();
      await expect(openDatabase()).rejects.toThrow('IDB open failed');
    });

    it('should create object store on upgrade', async () => {
      openShouldUpgrade = true;
      setupIndexedDB();
      const { openDatabase } = await importModule();
      await openDatabase();
      expect(mockDb.createObjectStore).toHaveBeenCalledWith('pages', { keyPath: 'url' });
    });

    it('should skip store creation when store already exists', async () => {
      openShouldUpgrade = true;
      setupIndexedDB();
      (mockDb.objectStoreNames as { contains: ReturnType<typeof vi.fn> }).contains = vi.fn(() => true);
      const { openDatabase } = await importModule();
      await openDatabase();
      expect(mockDb.createObjectStore).not.toHaveBeenCalled();
    });
  });

  // ── saveIndexedItem ─────────────────────────────────────────────────────

  describe('saveIndexedItem', () => {
    it('should save an item', async () => {
      const { saveIndexedItem } = await importModule();
      const item = makeItem();
      await saveIndexedItem(item);
      expect(store.has(item.url)).toBe(true);
    });

    it('should invalidate cache on save', async () => {
      const mod = await importModule();
      // Populate cache by calling getAll first
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const items1 = await mod.getAllIndexedItems();
      expect(items1).toHaveLength(1);

      // Save a new item (should invalidate cache)
      await mod.saveIndexedItem(makeItem({ url: 'https://b.com' }));

      // Next getAll should re-read from IDB
      const items2 = await mod.getAllIndexedItems();
      expect(items2).toHaveLength(2);
    });
  });

  // ── getAllIndexedItems ───────────────────────────────────────────────────

  describe('getAllIndexedItems', () => {
    it('should return all items', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      store.set('https://b.com', makeItem({ url: 'https://b.com' }));
      const { getAllIndexedItems } = await importModule();
      const items = await getAllIndexedItems();
      expect(items).toHaveLength(2);
    });

    it('should return empty array when no items', async () => {
      const { getAllIndexedItems } = await importModule();
      const items = await getAllIndexedItems();
      expect(items).toHaveLength(0);
    });

    it('should return cached items on second call', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const { getAllIndexedItems } = await importModule();
      await getAllIndexedItems();
      await getAllIndexedItems(); // second call
      // getAll should only be called once (cached second time)
      expect(mockObjectStore.getAll).toHaveBeenCalledTimes(1);
    });
  });

  // ── getIndexedItem ──────────────────────────────────────────────────────

  describe('getIndexedItem', () => {
    it('should return item when found', async () => {
      const item = makeItem({ url: 'https://found.com' });
      store.set(item.url, item);
      const { getIndexedItem } = await importModule();
      const result = await getIndexedItem('https://found.com');
      expect(result).toEqual(item);
    });

    it('should return null when not found', async () => {
      const { getIndexedItem } = await importModule();
      const result = await getIndexedItem('https://notfound.com');
      expect(result).toBeNull();
    });
  });

  // ── deleteIndexedItem ───────────────────────────────────────────────────

  describe('deleteIndexedItem', () => {
    it('should delete an item', async () => {
      store.set('https://del.com', makeItem({ url: 'https://del.com' }));
      const { deleteIndexedItem } = await importModule();
      await deleteIndexedItem('https://del.com');
      expect(store.has('https://del.com')).toBe(false);
    });

    it('should invalidate cache on delete', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const mod = await importModule();
      await mod.getAllIndexedItems(); // populate cache
      await mod.deleteIndexedItem('https://a.com');
      // Cache should be invalidated, so next call should re-read
      const items = await mod.getAllIndexedItems();
      expect(items).toHaveLength(0);
    });
  });

  // ── clearIndexedDB ──────────────────────────────────────────────────────

  describe('clearIndexedDB', () => {
    it('should clear all items', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      store.set('https://b.com', makeItem({ url: 'https://b.com' }));
      const { clearIndexedDB } = await importModule();
      await clearIndexedDB();
      expect(store.size).toBe(0);
    });
  });

  // ── getIndexedItemsBatches ──────────────────────────────────────────────

  describe('getIndexedItemsBatches', () => {
    it('should return items in batches', async () => {
      for (let i = 0; i < 5; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com` }));
      }
      const { getIndexedItemsBatches } = await importModule();
      const batches = await getIndexedItemsBatches(2);
      expect(batches).toHaveLength(3); // 2, 2, 1
      expect(batches[0]).toHaveLength(2);
      expect(batches[1]).toHaveLength(2);
      expect(batches[2]).toHaveLength(1);
    });

    it('should return single batch when items fit', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const { getIndexedItemsBatches } = await importModule();
      const batches = await getIndexedItemsBatches(100);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(1);
    });

    it('should return empty array when no items', async () => {
      const { getIndexedItemsBatches } = await importModule();
      const batches = await getIndexedItemsBatches();
      expect(batches).toHaveLength(0);
    });
  });

  // ── getIndexedItemsPage ─────────────────────────────────────────────────

  describe('getIndexedItemsPage', () => {
    it('should return paginated items with total', async () => {
      for (let i = 0; i < 5; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com` }));
      }
      const { getIndexedItemsPage } = await importModule();
      const result = await getIndexedItemsPage(0, 3);
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(3);
    });

    it('should handle offset correctly', async () => {
      for (let i = 0; i < 5; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com` }));
      }
      const { getIndexedItemsPage } = await importModule();
      const result = await getIndexedItemsPage(3, 100);
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(2); // 5 - 3 skipped = 2
    });

    it('should return empty items when offset exceeds total', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const { getIndexedItemsPage } = await importModule();
      const result = await getIndexedItemsPage(100, 10);
      expect(result.items).toHaveLength(0);
    });
  });

  // ── getRecentIndexedItems ───────────────────────────────────────────────

  describe('getRecentIndexedItems', () => {
    it('should return items sorted by lastVisit descending', async () => {
      store.set('https://old.com', makeItem({ url: 'https://old.com', lastVisit: 1000 }));
      store.set('https://new.com', makeItem({ url: 'https://new.com', lastVisit: 9000 }));
      const { getRecentIndexedItems } = await importModule();
      const items = await getRecentIndexedItems(10);
      expect(items[0].url).toBe('https://new.com');
      expect(items[1].url).toBe('https://old.com');
    });

    it('should respect the limit', async () => {
      for (let i = 0; i < 10; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com`, lastVisit: i * 1000 }));
      }
      const { getRecentIndexedItems } = await importModule();
      const items = await getRecentIndexedItems(3);
      expect(items).toHaveLength(3);
    });
  });

  // ── countItemsWithoutEmbeddings ─────────────────────────────────────────

  describe('countItemsWithoutEmbeddings', () => {
    it('should count items with and without embeddings', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [0.1, 0.2] }));
      store.set('https://b.com', makeItem({ url: 'https://b.com' })); // no embedding
      store.set('https://c.com', makeItem({ url: 'https://c.com', embedding: [] })); // empty embedding
      const { countItemsWithoutEmbeddings } = await importModule();
      const result = await countItemsWithoutEmbeddings();
      expect(result.total).toBe(3);
      expect(result.withoutEmbeddings).toBe(2);
    });

    it('should return zeroes when no items', async () => {
      const { countItemsWithoutEmbeddings } = await importModule();
      const result = await countItemsWithoutEmbeddings();
      expect(result.total).toBe(0);
      expect(result.withoutEmbeddings).toBe(0);
    });
  });

  // ── getItemsWithoutEmbeddingsBatch ──────────────────────────────────────

  describe('getItemsWithoutEmbeddingsBatch', () => {
    it('should return items without embeddings up to batchSize', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [0.1] }));
      store.set('https://b.com', makeItem({ url: 'https://b.com' }));
      store.set('https://c.com', makeItem({ url: 'https://c.com' }));
      const { getItemsWithoutEmbeddingsBatch } = await importModule();
      const batch = await getItemsWithoutEmbeddingsBatch(1);
      expect(batch).toHaveLength(1);
      expect(batch[0].embedding).toBeUndefined();
    });

    it('should return empty when all items have embeddings', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [0.1] }));
      const { getItemsWithoutEmbeddingsBatch } = await importModule();
      const batch = await getItemsWithoutEmbeddingsBatch(10);
      expect(batch).toHaveLength(0);
    });
  });

  // ── getSetting / setSetting ─────────────────────────────────────────────

  describe('getSetting / setSetting', () => {
    it('should return default value when key not found', async () => {
      const { getSetting } = await importModule();
      const value = await getSetting('missingKey', 'default');
      expect(value).toBe('default');
    });

    it('should return stored value when key exists', async () => {
      storageMock.get.mockImplementation((_keys: unknown, cb: (r: Record<string, unknown>) => void) => {
        cb({ myKey: 'storedValue' });
      });
      const { getSetting } = await importModule();
      const value = await getSetting('myKey', 'default');
      expect(value).toBe('storedValue');
    });

    it('should save a setting', async () => {
      const { setSetting } = await importModule();
      await setSetting('testKey', 42);
      expect(storageMock.set).toHaveBeenCalledWith({ testKey: 42 }, expect.any(Function));
    });
  });

  // ── getStorageQuotaInfo ─────────────────────────────────────────────────

  describe('getStorageQuotaInfo', () => {
    it('should return quota info with navigator.storage.estimate', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn(async () => ({ usage: 524288, quota: 1048576 })),
        },
      });
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      expect(info.used).toBe(524288);
      expect(info.total).toBe(1048576);
      expect(info.usedFormatted).toBe('512 KB');
      expect(info.percentage).toBe(50);
    });

    it('should use item-based estimate when storage API unavailable', async () => {
      vi.stubGlobal('navigator', {});
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      expect(info.itemCount).toBe(1);
      expect(info.used).toBe(1024); // 1 item * 1024
    });

    it('should return fallback on error', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn(async () => { throw new Error('fail'); }),
        },
      });
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      // Should not throw, should return fallback
      expect(info.usedFormatted).toBeDefined();
    });
  });

  // ── setForceRebuildFlag / getForceRebuildFlag ───────────────────────────

  describe('setForceRebuildFlag / getForceRebuildFlag', () => {
    it('should set and get the flag', async () => {
      const { setForceRebuildFlag, getForceRebuildFlag } = await importModule();
      await setForceRebuildFlag(true);
      expect(storageMock.set).toHaveBeenCalledWith(
        { forceRebuildIndex: true },
        expect.any(Function),
      );

      storageMock.get.mockImplementation((_keys: unknown, cb: (r: Record<string, unknown>) => void) => {
        cb({ forceRebuildIndex: true });
      });
      const flag = await getForceRebuildFlag();
      expect(flag).toBe(true);
    });

    it('should default to false when not set', async () => {
      storageMock.get.mockImplementation((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}));
      const { getForceRebuildFlag } = await importModule();
      const flag = await getForceRebuildFlag();
      expect(flag).toBe(false);
    });
  });

  // ── invalidateItemCache ─────────────────────────────────────────────────

  describe('invalidateItemCache', () => {
    it('should cause next getAllIndexedItems to re-read from IDB', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const mod = await importModule();
      await mod.getAllIndexedItems(); // populate cache
      mod.invalidateItemCache();
      await mod.getAllIndexedItems(); // should re-read
      expect(mockObjectStore.getAll).toHaveBeenCalledTimes(2);
    });
  });
});
