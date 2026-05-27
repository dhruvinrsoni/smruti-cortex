import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted state ─────────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
    onCreatedAdd:  vi.fn(),
    onRemovedAdd:  vi.fn(),
    onMovedAdd:    vi.fn(),
    onChangedAdd:  vi.fn(),
    onImportEndedAdd:  vi.fn(),
    bookmarksGet:  vi.fn(),
    getSetting:    vi.fn(),
    getIndexedItem:  vi.fn(),
    saveIndexedItem: vi.fn(),
    clearSearchCache: vi.fn(),
    performBookmarksIndex: vi.fn(),
    tokenize: vi.fn((s: string) => s.split(/\s+/).filter(Boolean)),
}));

vi.mock('../../../core/logger', () => ({
    Logger: {
        forComponent: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() }),
    },
    errorMeta: (e: unknown) => ({ error: String(e) }),
}));

vi.mock('../../../core/settings', () => ({
    SettingsManager: { getSetting: (key: string) => state.getSetting(key) },
}));

vi.mock('../../../core/helpers', () => ({
    browserAPI: {
        bookmarks: {
            onCreated:  { addListener: (...a: unknown[]) => state.onCreatedAdd(...a) },
            onRemoved:  { addListener: (...a: unknown[]) => state.onRemovedAdd(...a) },
            onMoved:    { addListener: (...a: unknown[]) => state.onMovedAdd(...a) },
            onChanged:  { addListener: (...a: unknown[]) => state.onChangedAdd(...a) },
            onImportEnded: { addListener: (...a: unknown[]) => state.onImportEndedAdd(...a) },
            get: (...a: unknown[]) => state.bookmarksGet(...a),
        },
    },
}));

vi.mock('../../database', () => ({
    getIndexedItem:  (...a: unknown[]) => state.getIndexedItem(...a),
    saveIndexedItem: (...a: unknown[]) => state.saveIndexedItem(...a),
}));

vi.mock('../../search/search-cache', () => ({
    clearSearchCache: (...a: unknown[]) => state.clearSearchCache(...a),
}));

vi.mock('../../search/tokenizer', () => ({
    tokenize: (s: string) => state.tokenize(s),
}));

vi.mock('../../indexing', () => ({
    performBookmarksIndex: (...a: unknown[]) => state.performBookmarksIndex(...a),
    clearBookmarkFlags: vi.fn(),
}));

import { setupDataChangeListeners } from '../data-change-listeners';

// ── Helpers ───────────────────────────────────────────────────────────────

function captureListener(addFn: ReturnType<typeof vi.fn>): (...args: unknown[]) => Promise<void> {
    return addFn.mock.calls[0][0] as (...args: unknown[]) => Promise<void>;
}

function makeItem(overrides: Record<string, unknown> = {}) {
    return {
        url: 'https://github.com',
        title: 'GitHub',
        hostname: 'github.com',
        visitCount: 5,
        lastVisit: Date.now(),
        tokens: ['github'],
        isBookmark: true,
        bookmarkFolders: ['Work'],
        metaDescription: '',
        ...overrides,
    };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('setupDataChangeListeners', () => {
    let broadcast: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllTimers();
        vi.resetAllMocks();

        // Default: indexBookmarks enabled, get() returns empty, DB no-ops
        state.getSetting.mockReturnValue(true);
        state.bookmarksGet.mockResolvedValue([] as chrome.bookmarks.BookmarkTreeNode[]);
        state.getIndexedItem.mockResolvedValue(null);
        state.saveIndexedItem.mockResolvedValue(undefined);
        state.performBookmarksIndex.mockResolvedValue({ indexed: 0, updated: 0 });
        state.tokenize.mockImplementation((s: string) => s.split(/\s+/).filter(Boolean));

        broadcast = vi.fn();
        setupDataChangeListeners(broadcast);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('registers all 5 bookmark event listeners', () => {
        expect(state.onCreatedAdd).toHaveBeenCalledTimes(1);
        expect(state.onRemovedAdd).toHaveBeenCalledTimes(1);
        expect(state.onMovedAdd).toHaveBeenCalledTimes(1);
        expect(state.onChangedAdd).toHaveBeenCalledTimes(1);
        expect(state.onImportEndedAdd).toHaveBeenCalledTimes(1);
    });

    // ── onCreated ─────────────────────────────────────────────────────────

    describe('onCreated', () => {
        it('upserts new item when URL is not in index yet', async () => {
            state.bookmarksGet.mockResolvedValueOnce([{ id: '2', title: 'Work', parentId: '0' }]);
            state.getIndexedItem.mockResolvedValueOnce(null);

            const handler = captureListener(state.onCreatedAdd);
            await handler('1', { id: '1', url: 'https://github.com', title: 'GitHub', parentId: '2' });

            expect(state.saveIndexedItem).toHaveBeenCalledWith(
                expect.objectContaining({ url: 'https://github.com', isBookmark: true, bookmarkFolders: ['Work'] }),
            );
        });

        it('updates existing item to mark as bookmark', async () => {
            state.bookmarksGet.mockResolvedValueOnce([{ id: '2', title: 'Dev', parentId: '0' }]);
            state.getIndexedItem.mockResolvedValueOnce(makeItem({ isBookmark: false, bookmarkFolders: undefined }));

            const handler = captureListener(state.onCreatedAdd);
            await handler('1', { id: '1', url: 'https://github.com', title: 'GitHub', parentId: '2' });

            expect(state.saveIndexedItem).toHaveBeenCalledWith(
                expect.objectContaining({ isBookmark: true, bookmarkFolders: ['Dev'] }),
            );
        });

        it('skips folders (no url on node)', async () => {
            const handler = captureListener(state.onCreatedAdd);
            await handler('1', { id: '1', title: 'My Folder', parentId: '0' });

            expect(state.saveIndexedItem).not.toHaveBeenCalled();
        });

        it('triggers broadcast after debounce', async () => {
            const handler = captureListener(state.onCreatedAdd);
            await handler('1', { id: '1', url: 'https://a.com', title: 'A', parentId: '0' });

            vi.advanceTimersByTime(600);
            expect(state.clearSearchCache).toHaveBeenCalled();
            expect(broadcast).toHaveBeenCalledWith('bookmarks');
        });

        it('skips everything when indexBookmarks is false', async () => {
            state.getSetting.mockReturnValue(false);
            const handler = captureListener(state.onCreatedAdd);
            await handler('1', { id: '1', url: 'https://github.com', title: 'GitHub', parentId: '2' });

            expect(state.saveIndexedItem).not.toHaveBeenCalled();
            await vi.runAllTimersAsync();
            expect(broadcast).not.toHaveBeenCalled();
        });
    });

    // ── onRemoved ─────────────────────────────────────────────────────────

    describe('onRemoved', () => {
        it('clears isBookmark flag when bookmark is deleted', async () => {
            const item = makeItem({ isBookmark: true, bookmarkFolders: ['Work'] });
            state.getIndexedItem.mockResolvedValueOnce(item);

            const handler = captureListener(state.onRemovedAdd);
            await handler('1', {
                index: 0, parentId: '2',
                node: { id: '1', url: 'https://github.com', title: 'GitHub', index: 0 },
            });

            expect(state.saveIndexedItem).toHaveBeenCalledWith(
                expect.objectContaining({ isBookmark: false, bookmarkFolders: undefined }),
            );
        });

        it('triggers broadcast after removal', async () => {
            state.getIndexedItem.mockResolvedValueOnce(makeItem());
            const handler = captureListener(state.onRemovedAdd);
            await handler('1', {
                index: 0, parentId: '2',
                node: { id: '1', url: 'https://github.com', title: 'GitHub', index: 0 },
            });

            vi.advanceTimersByTime(600);
            expect(broadcast).toHaveBeenCalledWith('bookmarks');
        });

        it('no-op when item is not in index', async () => {
            state.getIndexedItem.mockResolvedValueOnce(null);
            const handler = captureListener(state.onRemovedAdd);
            await handler('1', {
                index: 0, parentId: '2',
                node: { id: '1', url: 'https://github.com', title: 'GitHub', index: 0 },
            });

            expect(state.saveIndexedItem).not.toHaveBeenCalled();
        });

        it('skips folder removals (node has no url)', async () => {
            const handler = captureListener(state.onRemovedAdd);
            await handler('1', {
                index: 0, parentId: '2',
                node: { id: '1', title: 'Work', index: 0 },
            });

            expect(state.saveIndexedItem).not.toHaveBeenCalled();
        });
    });

    // ── onMoved ───────────────────────────────────────────────────────────

    describe('onMoved', () => {
        it('patches bookmarkFolders to reflect new location', async () => {
            const item = makeItem({ bookmarkFolders: ['OldFolder'] });
            // get(id) to find the bookmark URL
            state.bookmarksGet.mockResolvedValueOnce([
                { id: '1', url: 'https://github.com', title: 'GitHub', parentId: '3' },
            ]);
            // buildFolderPath traversal: folderId='3' → 'NewFolder', parentId='0' → stop
            state.bookmarksGet.mockResolvedValueOnce([{ id: '3', title: 'NewFolder', parentId: '0' }]);
            state.getIndexedItem.mockResolvedValueOnce(item);

            const handler = captureListener(state.onMovedAdd);
            await handler('1', { oldParentId: '2', parentId: '3', index: 0, oldIndex: 0 });

            expect(state.saveIndexedItem).toHaveBeenCalledWith(
                expect.objectContaining({ bookmarkFolders: ['NewFolder'] }),
            );
        });

        it('triggers broadcast after move', async () => {
            state.bookmarksGet
                .mockResolvedValueOnce([{ id: '1', url: 'https://github.com', title: 'GitHub', parentId: '3' }])
                .mockResolvedValueOnce([{ id: '3', title: 'NewFolder', parentId: '0' }]);
            state.getIndexedItem.mockResolvedValueOnce(makeItem());

            const handler = captureListener(state.onMovedAdd);
            await handler('1', { oldParentId: '2', parentId: '3', index: 0, oldIndex: 0 });

            vi.advanceTimersByTime(600);
            expect(broadcast).toHaveBeenCalledWith('bookmarks');
        });

        it('skips when moved node is a folder (no url)', async () => {
            state.bookmarksGet.mockResolvedValueOnce([{ id: '1', title: 'Some Folder', parentId: '2' }]);

            const handler = captureListener(state.onMovedAdd);
            await handler('1', { oldParentId: '2', parentId: '3', index: 0, oldIndex: 0 });

            expect(state.getIndexedItem).not.toHaveBeenCalled();
        });
    });

    // ── onChanged ─────────────────────────────────────────────────────────

    describe('onChanged', () => {
        it('updates bookmarkTitle on title change', async () => {
            const item = makeItem({ bookmarkTitle: 'Old GitHub' });
            state.bookmarksGet.mockResolvedValueOnce([
                { id: '1', url: 'https://github.com', title: 'GitHub', parentId: '2' },
            ]);
            state.getIndexedItem.mockResolvedValueOnce(item);

            const handler = captureListener(state.onChangedAdd);
            await handler('1', { title: 'GitHub Rebranded' });

            expect(state.saveIndexedItem).toHaveBeenCalledWith(
                expect.objectContaining({ bookmarkTitle: 'GitHub Rebranded' }),
            );
        });

        it('triggers broadcast after change', async () => {
            state.bookmarksGet.mockResolvedValueOnce([
                { id: '1', url: 'https://github.com', title: 'GitHub', parentId: '2' },
            ]);
            state.getIndexedItem.mockResolvedValueOnce(makeItem());

            const handler = captureListener(state.onChangedAdd);
            await handler('1', { title: 'New Title' });

            vi.advanceTimersByTime(600);
            expect(broadcast).toHaveBeenCalledWith('bookmarks');
        });
    });

    // ── onImported ────────────────────────────────────────────────────────

    describe('onImported', () => {
        it('runs full performBookmarksIndex and triggers broadcast', async () => {
            const handler = captureListener(state.onImportEndedAdd);
            await handler(); // handler is async — awaits import + performBookmarksIndex
            expect(state.performBookmarksIndex).toHaveBeenCalledWith(true);
            vi.advanceTimersByTime(600);
            expect(broadcast).toHaveBeenCalledWith('bookmarks');
        });

        it('skips when indexBookmarks is false', async () => {
            state.getSetting.mockReturnValue(false);
            const handler = captureListener(state.onImportEndedAdd);
            await handler();
            expect(state.performBookmarksIndex).not.toHaveBeenCalled();
            vi.advanceTimersByTime(600);
            expect(broadcast).not.toHaveBeenCalled();
        });
    });

    // ── Debounce ──────────────────────────────────────────────────────────

    describe('debounce', () => {
        it('coalesces rapid changes into a single broadcast', async () => {
            const handler = captureListener(state.onCreatedAdd);
            const node = (url: string) => ({ id: '1', url, title: 'T', parentId: '0' });

            await handler('1', node('https://a.com'));
            await handler('2', node('https://b.com'));
            await handler('3', node('https://c.com'));

            vi.advanceTimersByTime(600);
            await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
            expect(broadcast).toHaveBeenCalledTimes(1);
        });
    });
});
