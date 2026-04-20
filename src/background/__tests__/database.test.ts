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
      errorMeta: (err: unknown) => err instanceof Error
        ? { name: err.name, message: err.message }
        : { name: 'non-Error', message: String(err) },
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

  // ── resetDbInstance ──────────────────────────────────────────────────────

  describe('resetDbInstance', () => {
    it('should force re-open on next DB operation', async () => {
      const mod = await importModule();
      await mod.openDatabase(); // first open
      mod.resetDbInstance();
      await mod.openDatabase(); // should open again
      expect(indexedDB.open).toHaveBeenCalledTimes(2);
    });

    it('should invalidate item cache', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const mod = await importModule();
      await mod.getAllIndexedItems(); // populate cache
      mod.resetDbInstance();
      await mod.getAllIndexedItems(); // should re-read
      expect(mockObjectStore.getAll).toHaveBeenCalledTimes(2);
    });
  });

  // ── loadEmbeddingsInto ─────────────────────────────────────────────────

  describe('loadEmbeddingsInto', () => {
    it('should load embeddings into matching items', async () => {
      const embedding = [0.1, 0.2, 0.3];
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding }));
      store.set('https://b.com', makeItem({ url: 'https://b.com' }));

      const { loadEmbeddingsInto } = await importModule();
      const items = [
        makeItem({ url: 'https://a.com' }),
        makeItem({ url: 'https://b.com' }),
      ];

      const loaded = await loadEmbeddingsInto(items);
      expect(loaded).toBe(1);
      expect(items[0].embedding).toEqual(embedding);
      expect(items[1].embedding).toBeUndefined();
    });

    it('should skip DB rows not present in the provided items array', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [0.5] }));
      store.set('https://orphan.com', makeItem({ url: 'https://orphan.com', embedding: [0.9] }));

      const { loadEmbeddingsInto } = await importModule();
      const items = [makeItem({ url: 'https://a.com' })];
      const loaded = await loadEmbeddingsInto(items);
      expect(loaded).toBe(1);
    });

    it('should return 0 when no items have embeddings', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const { loadEmbeddingsInto } = await importModule();
      const items = [makeItem({ url: 'https://a.com' })];
      const loaded = await loadEmbeddingsInto(items);
      expect(loaded).toBe(0);
    });

    it('should return 0 for empty items array', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [0.1] }));
      const { loadEmbeddingsInto } = await importModule();
      const loaded = await loadEmbeddingsInto([]);
      expect(loaded).toBe(0);
    });

    it('should return 0 when DB is empty', async () => {
      const { loadEmbeddingsInto } = await importModule();
      const items = [makeItem({ url: 'https://a.com' })];
      const loaded = await loadEmbeddingsInto(items);
      expect(loaded).toBe(0);
    });

    it('should skip items with empty embedding arrays', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [] }));
      const { loadEmbeddingsInto } = await importModule();
      const items = [makeItem({ url: 'https://a.com' })];
      const loaded = await loadEmbeddingsInto(items);
      expect(loaded).toBe(0);
    });
  });

  // ── db.onclose / db.onversionchange handlers ──────────────────────────

  describe('database connection event handlers', () => {
    it('should clear dbInstance and cache when db.onclose fires', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const mod = await importModule();
      await mod.getAllIndexedItems(); // populate cache + set dbInstance

      // Trigger onclose handler
      (mockDb.onclose as () => void)();

      // Next operation should re-open DB
      await mod.getAllIndexedItems();
      expect(indexedDB.open).toHaveBeenCalledTimes(2);
      expect(mockObjectStore.getAll).toHaveBeenCalledTimes(2);
    });

    it('should close db and clear state when db.onversionchange fires', async () => {
      mockDb.close = vi.fn();
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const mod = await importModule();
      await mod.getAllIndexedItems(); // populate cache + set dbInstance

      // Trigger onversionchange handler
      (mockDb.onversionchange as () => void)();

      expect(mockDb.close).toHaveBeenCalled();

      // Next operation should re-open DB
      await mod.getAllIndexedItems();
      expect(indexedDB.open).toHaveBeenCalledTimes(2);
    });
  });

  // ── getAllIndexedItems — embedding stripping ───────────────────────────

  describe('getAllIndexedItems — embedding stripping', () => {
    it('should strip embedding arrays from cached items', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [0.1, 0.2] }));
      const { getAllIndexedItems } = await importModule();
      const items = await getAllIndexedItems();
      expect(items[0].embedding).toBeUndefined();
    });
  });

  // ── IDB error paths ───────────────────────────────────────────────────

  describe('IDB error paths', () => {
    function setupErrorStore(method: string) {
      const errStore = buildMockObjectStore();
      (errStore as Record<string, unknown>)[method] = vi.fn(() => mockRequest(new Error(`${method} failed`)));
      mockDb.transaction = vi.fn(() => ({ objectStore: vi.fn(() => errStore) }));
    }

    it('saveIndexedItem should reject on put error', async () => {
      setupErrorStore('put');
      const { saveIndexedItem } = await importModule();
      await expect(saveIndexedItem(makeItem())).rejects.toThrow('put failed');
    });

    it('getAllIndexedItems should reject on getAll error', async () => {
      setupErrorStore('getAll');
      const { getAllIndexedItems } = await importModule();
      await expect(getAllIndexedItems()).rejects.toThrow('getAll failed');
    });

    it('getIndexedItem should reject on get error', async () => {
      setupErrorStore('get');
      const { getIndexedItem } = await importModule();
      await expect(getIndexedItem('https://x.com')).rejects.toThrow('get failed');
    });

    it('deleteIndexedItem should reject on delete error', async () => {
      setupErrorStore('delete');
      const { deleteIndexedItem } = await importModule();
      await expect(deleteIndexedItem('https://x.com')).rejects.toThrow('delete failed');
    });

    it('clearIndexedDB should reject on clear error', async () => {
      setupErrorStore('clear');
      const { clearIndexedDB } = await importModule();
      await expect(clearIndexedDB()).rejects.toThrow('clear failed');
    });

    it('getIndexedItemsPage should reject on count error', async () => {
      setupErrorStore('count');
      const { getIndexedItemsPage } = await importModule();
      await expect(getIndexedItemsPage()).rejects.toThrow('count failed');
    });

    it('getRecentIndexedItems should reject on cursor error', async () => {
      const errIndex = {
        openCursor: vi.fn(() => mockRequest(new Error('cursor failed'))),
      };
      const errStore = buildMockObjectStore();
      errStore.index = vi.fn(() => errIndex);
      mockDb.transaction = vi.fn(() => ({ objectStore: vi.fn(() => errStore) }));

      const { getRecentIndexedItems } = await importModule();
      await expect(getRecentIndexedItems()).rejects.toThrow('cursor failed');
    });

    it('loadEmbeddingsInto should reject on cursor error', async () => {
      setupErrorStore('openCursor');
      const { loadEmbeddingsInto } = await importModule();
      await expect(loadEmbeddingsInto([makeItem()])).rejects.toThrow('openCursor failed');
    });

    it('getIndexedItemsBatches should reject on cursor error', async () => {
      setupErrorStore('openCursor');
      const { getIndexedItemsBatches } = await importModule();
      await expect(getIndexedItemsBatches()).rejects.toThrow('openCursor failed');
    });

    it('countItemsWithoutEmbeddings should reject on cursor error', async () => {
      setupErrorStore('openCursor');
      const { countItemsWithoutEmbeddings } = await importModule();
      await expect(countItemsWithoutEmbeddings()).rejects.toThrow('openCursor failed');
    });

    it('getItemsWithoutEmbeddingsBatch should reject on cursor error', async () => {
      setupErrorStore('openCursor');
      const { getItemsWithoutEmbeddingsBatch } = await importModule();
      await expect(getItemsWithoutEmbeddingsBatch(10)).rejects.toThrow('openCursor failed');
    });
  });

  // ── clearIndexedDB — cache invalidation ───────────────────────────────

  describe('clearIndexedDB — cache invalidation', () => {
    it('should invalidate cache so next getAll re-reads from IDB', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const mod = await importModule();
      await mod.getAllIndexedItems(); // populate cache
      await mod.clearIndexedDB();
      await mod.getAllIndexedItems(); // should re-read
      expect(mockObjectStore.getAll).toHaveBeenCalledTimes(2);
    });
  });

  // ── getIndexedItemsPage — edge cases ──────────────────────────────────

  describe('getIndexedItemsPage — edge cases', () => {
    it('should use default offset=0 and limit=100', async () => {
      for (let i = 0; i < 3; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com` }));
      }
      const { getIndexedItemsPage } = await importModule();
      const result = await getIndexedItemsPage();
      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(3);
    });

    it('should stop at limit when more items available', async () => {
      for (let i = 0; i < 10; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com` }));
      }
      const { getIndexedItemsPage } = await importModule();
      const result = await getIndexedItemsPage(0, 5);
      expect(result.total).toBe(10);
      expect(result.items).toHaveLength(5);
    });

    it('should return empty when DB is empty', async () => {
      const { getIndexedItemsPage } = await importModule();
      const result = await getIndexedItemsPage();
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  // ── getRecentIndexedItems — edge cases ────────────────────────────────

  describe('getRecentIndexedItems — edge cases', () => {
    it('should use default limit of 50', async () => {
      for (let i = 0; i < 3; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com`, lastVisit: i }));
      }
      const { getRecentIndexedItems } = await importModule();
      const items = await getRecentIndexedItems();
      expect(items).toHaveLength(3);
    });

    it('should return empty when DB is empty', async () => {
      const { getRecentIndexedItems } = await importModule();
      const items = await getRecentIndexedItems();
      expect(items).toHaveLength(0);
    });
  });

  // ── getIndexedItemsBatches — edge cases ───────────────────────────────

  describe('getIndexedItemsBatches — edge cases', () => {
    it('should use default batch size of 1000', async () => {
      for (let i = 0; i < 3; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com` }));
      }
      const { getIndexedItemsBatches } = await importModule();
      const batches = await getIndexedItemsBatches();
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
    });

    it('should produce exact batch when items equal batchSize', async () => {
      for (let i = 0; i < 4; i++) {
        store.set(`https://${i}.com`, makeItem({ url: `https://${i}.com` }));
      }
      const { getIndexedItemsBatches } = await importModule();
      const batches = await getIndexedItemsBatches(4);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(4);
    });
  });

  // ── getStorageQuotaInfo — additional branches ─────────────────────────

  describe('getStorageQuotaInfo — additional branches', () => {
    it('should return percentage 0 when total is 0', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn(async () => ({ usage: 100, quota: 0 })),
        },
      });
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      expect(info.percentage).toBe(0);
      expect(info.totalFormatted).toBe('Unlimited');
    });

    it('should return fallback with zeroes when DB open fails', async () => {
      openShouldFail = true;
      setupIndexedDB();
      vi.stubGlobal('navigator', {});
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      expect(info.used).toBe(0);
      expect(info.total).toBe(0);
      expect(info.usedFormatted).toBe('Unknown');
      expect(info.totalFormatted).toBe('Unknown');
      expect(info.percentage).toBe(0);
      expect(info.itemCount).toBe(0);
    });

    it('should handle navigator.storage.estimate returning undefined usage/quota', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn(async () => ({})),
        },
      });
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      // Falls back to item-based estimate: 1 item * 1024
      expect(info.used).toBe(1024);
      expect(info.itemCount).toBe(1);
    });

    it('should format bytes as 0 B when used is 0 and no items', async () => {
      vi.stubGlobal('navigator', {});
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      expect(info.usedFormatted).toBe('0 B');
    });

    it('should format large values correctly (MB range)', async () => {
      const usageMB = 5 * 1024 * 1024; // 5 MB
      const quotaGB = 2 * 1024 * 1024 * 1024; // 2 GB
      vi.stubGlobal('navigator', {
        storage: {
          estimate: vi.fn(async () => ({ usage: usageMB, quota: quotaGB })),
        },
      });
      const { getStorageQuotaInfo } = await importModule();
      const info = await getStorageQuotaInfo();
      expect(info.usedFormatted).toBe('5 MB');
      expect(info.totalFormatted).toBe('2 GB');
    });
  });

  // ── getItemsWithoutEmbeddingsBatch — edge cases ───────────────────────

  describe('getItemsWithoutEmbeddingsBatch — edge cases', () => {
    it('should return all items without embeddings when batchSize exceeds count', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      store.set('https://b.com', makeItem({ url: 'https://b.com' }));
      const { getItemsWithoutEmbeddingsBatch } = await importModule();
      const batch = await getItemsWithoutEmbeddingsBatch(100);
      expect(batch).toHaveLength(2);
    });

    it('should return empty when DB is empty', async () => {
      const { getItemsWithoutEmbeddingsBatch } = await importModule();
      const batch = await getItemsWithoutEmbeddingsBatch(10);
      expect(batch).toHaveLength(0);
    });

    it('should skip items with empty embedding arrays', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [] }));
      store.set('https://b.com', makeItem({ url: 'https://b.com', embedding: [0.5] }));
      const { getItemsWithoutEmbeddingsBatch } = await importModule();
      const batch = await getItemsWithoutEmbeddingsBatch(10);
      expect(batch).toHaveLength(1);
      expect(batch[0].url).toBe('https://a.com');
    });
  });

  // ── countItemsWithoutEmbeddings — edge cases ──────────────────────────

  describe('countItemsWithoutEmbeddings — edge cases', () => {
    it('should count all items as without embeddings when none have them', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      store.set('https://b.com', makeItem({ url: 'https://b.com' }));
      const { countItemsWithoutEmbeddings } = await importModule();
      const result = await countItemsWithoutEmbeddings();
      expect(result.total).toBe(2);
      expect(result.withoutEmbeddings).toBe(2);
    });

    it('should count zero without embeddings when all have them', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com', embedding: [0.1] }));
      store.set('https://b.com', makeItem({ url: 'https://b.com', embedding: [0.2] }));
      const { countItemsWithoutEmbeddings } = await importModule();
      const result = await countItemsWithoutEmbeddings();
      expect(result.total).toBe(2);
      expect(result.withoutEmbeddings).toBe(0);
    });
  });

  // ── setForceRebuildFlag — clearing the flag ───────────────────────────

  describe('setForceRebuildFlag — clearing', () => {
    it('should set flag to false', async () => {
      const { setForceRebuildFlag } = await importModule();
      await setForceRebuildFlag(false);
      expect(storageMock.set).toHaveBeenCalledWith(
        { forceRebuildIndex: false },
        expect.any(Function),
      );
    });
  });

  // ── saveIndexedItem — re-opens DB when dbInstance is null ──────────────

  describe('saveIndexedItem — DB re-open', () => {
    it('should re-open DB when dbInstance was reset', async () => {
      const mod = await importModule();
      await mod.openDatabase();
      mod.resetDbInstance();
      await mod.saveIndexedItem(makeItem({ url: 'https://new.com' }));
      expect(indexedDB.open).toHaveBeenCalledTimes(2);
      expect(store.has('https://new.com')).toBe(true);
    });
  });

  // ── getIndexedItemsPage — cursor error path ───────────────────────────

  describe('getIndexedItemsPage — cursor error during pagination', () => {
    it('should reject when cursor request fails during pagination', async () => {
      store.set('https://a.com', makeItem({ url: 'https://a.com' }));
      const mod = await importModule();

      // Override openCursor after initial count succeeds
      const errStore = buildMockObjectStore();
      errStore.openCursor = vi.fn(() => mockRequest(new Error('pagination cursor error')));
      let callCount = 0;
      mockDb.transaction = vi.fn(() => ({
        objectStore: vi.fn(() => {
          callCount++;
          // First transaction is for count(), second is for cursor pagination
          if (callCount <= 1) {return mockObjectStore;}
          return errStore;
        }),
      }));

      await expect(mod.getIndexedItemsPage(0, 10)).rejects.toThrow('pagination cursor error');
    });
  });
});
