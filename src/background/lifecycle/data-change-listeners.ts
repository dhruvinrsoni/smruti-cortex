import { browserAPI } from '../../core/helpers';
import { Logger, errorMeta } from '../../core/logger';
import { SettingsManager } from '../../core/settings';
import { clearSearchCache } from '../search/search-cache';

const log = Logger.forComponent('DataChangeListeners');

export type DataChangeSource = 'bookmarks';

/** Traverse from a folder ID up to the bookmark bar root, returning folder name segments. */
async function buildFolderPath(folderId: string): Promise<string[]> {
    const parts: string[] = [];
    let parentId: string | undefined = folderId;
    let depth = 0;
    const MAX_DEPTH = 20;
    try {
        while (parentId && parentId !== '0' && depth++ < MAX_DEPTH) {
            const nodes = await browserAPI.bookmarks.get(parentId);
            const node = nodes[0];
            if (!node) {break;}
            if (node.title) {parts.unshift(node.title);}
            parentId = node.parentId;
        }
    } catch {
        // Root node or API error — return what we have so far
    }
    return parts;
}

let broadcastDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedBroadcast(
    source: DataChangeSource,
    broadcast: (source: DataChangeSource) => void,
): void {
    if (broadcastDebounceTimer !== null) {
        clearTimeout(broadcastDebounceTimer);
    }
    broadcastDebounceTimer = setTimeout(() => {
        broadcastDebounceTimer = null;
        clearSearchCache();
        broadcast(source);
        log.debug('broadcast', `DATA_CHANGED broadcast dispatched (source: ${source})`);
    }, 500);
}

/**
 * Register all Chrome API data-change listeners.
 *
 * Must be called synchronously at service-worker startup (MV3 requires event
 * listeners to be registered at module evaluation time, not deferred).
 *
 * To extend the framework for a new data source (e.g. history removals), add
 * a new listener block here and call debouncedBroadcast — no other file changes needed.
 */
export function setupDataChangeListeners(
    broadcast: (source: DataChangeSource) => void,
): void {
    // ── Bookmark created ──────────────────────────────────────────────────────
    browserAPI.bookmarks.onCreated.addListener(async (id, bookmark) => {
        log.debug('onCreated', `Bookmark created: ${bookmark.url ?? '(folder)'}`);
        if (!SettingsManager.getSetting('indexBookmarks')) {return;}
        if (!bookmark.url) {return;} // folder, not a bookmark

        try {
            const { getIndexedItem, saveIndexedItem } = await import('../database');
            const { tokenize } = await import('../search/tokenizer');
            const folderPath = await buildFolderPath(bookmark.parentId ?? '');
            const existing = await getIndexedItem(bookmark.url);
            if (existing) {
                existing.isBookmark = true;
                existing.bookmarkFolders = folderPath;
                if (bookmark.title && bookmark.title !== existing.title) {
                    existing.bookmarkTitle = bookmark.title;
                }
                const searchTitle = existing.bookmarkTitle || existing.title;
                existing.tokens = tokenize(`${searchTitle} ${existing.metaDescription ?? ''} ${folderPath.join(' ')} ${existing.url}`);
                await saveIndexedItem(existing);
            } else {
                await saveIndexedItem({
                    url: bookmark.url,
                    title: bookmark.title || '',
                    hostname: new URL(bookmark.url).hostname,
                    visitCount: 1,
                    lastVisit: Date.now(),
                    tokens: tokenize(`${bookmark.title || ''} ${folderPath.join(' ')} ${bookmark.url}`),
                    isBookmark: true,
                    bookmarkFolders: folderPath,
                    bookmarkTitle: bookmark.title,
                });
            }
        } catch (err) {
            log.warn('onCreated', 'Failed to upsert created bookmark', errorMeta(err));
        }

        debouncedBroadcast('bookmarks', broadcast);
    });

    // ── Bookmark removed ──────────────────────────────────────────────────────
    browserAPI.bookmarks.onRemoved.addListener(async (_id, removeInfo) => {
        const url = removeInfo.node?.url;
        log.debug('onRemoved', `Bookmark removed: ${url ?? '(folder)'}`);
        if (!SettingsManager.getSetting('indexBookmarks')) {return;}
        if (!url) {return;} // folder removed

        try {
            const { getIndexedItem, saveIndexedItem } = await import('../database');
            const item = await getIndexedItem(url);
            if (item?.isBookmark) {
                item.isBookmark = false;
                item.bookmarkFolders = undefined;
                item.bookmarkTitle = undefined;
                await saveIndexedItem(item);
            }
        } catch (err) {
            log.warn('onRemoved', 'Failed to clear bookmark flag on removal', errorMeta(err));
        }

        debouncedBroadcast('bookmarks', broadcast);
    });

    // ── Bookmark moved ────────────────────────────────────────────────────────
    browserAPI.bookmarks.onMoved.addListener(async (id, moveInfo) => {
        log.debug('onMoved', `Bookmark moved: id=${id} → parentId=${moveInfo.parentId}`);
        if (!SettingsManager.getSetting('indexBookmarks')) {return;}

        try {
            const nodes = await browserAPI.bookmarks.get(id);
            const bookmark = nodes[0];
            if (!bookmark?.url) {return;} // folder move — not tracked per-item

            const { getIndexedItem, saveIndexedItem } = await import('../database');
            const { tokenize } = await import('../search/tokenizer');
            const newFolderPath = await buildFolderPath(moveInfo.parentId);
            const item = await getIndexedItem(bookmark.url);
            if (item) {
                item.bookmarkFolders = newFolderPath;
                const searchTitle = item.bookmarkTitle || item.title;
                item.tokens = tokenize(`${searchTitle} ${item.metaDescription ?? ''} ${newFolderPath.join(' ')} ${item.url}`);
                await saveIndexedItem(item);
            }
        } catch (err) {
            log.warn('onMoved', 'Failed to patch bookmark folders on move', errorMeta(err));
        }

        debouncedBroadcast('bookmarks', broadcast);
    });

    // ── Bookmark changed (title / URL edit) ───────────────────────────────────
    browserAPI.bookmarks.onChanged.addListener(async (id, changeInfo) => {
        log.debug('onChanged', `Bookmark changed: id=${id}`);
        if (!SettingsManager.getSetting('indexBookmarks')) {return;}

        try {
            const nodes = await browserAPI.bookmarks.get(id);
            const bookmark = nodes[0];
            if (!bookmark?.url) {return;}

            const { getIndexedItem, saveIndexedItem } = await import('../database');
            const { tokenize } = await import('../search/tokenizer');
            const item = await getIndexedItem(bookmark.url);
            if (item) {
                if (changeInfo.title !== undefined) {
                    item.bookmarkTitle = changeInfo.title !== item.title ? changeInfo.title : undefined;
                }
                const searchTitle = item.bookmarkTitle || item.title;
                item.tokens = tokenize(`${searchTitle} ${item.metaDescription ?? ''} ${(item.bookmarkFolders ?? []).join(' ')} ${item.url}`);
                await saveIndexedItem(item);
            }
        } catch (err) {
            log.warn('onChanged', 'Failed to patch bookmark title on change', errorMeta(err));
        }

        debouncedBroadcast('bookmarks', broadcast);
    });

    // ── Bulk import ───────────────────────────────────────────────────────────
    browserAPI.bookmarks.onImportEnded.addListener(async () => {
        log.info('onImportEnded', 'Bookmark import detected — scheduling full re-index');
        if (!SettingsManager.getSetting('indexBookmarks')) {return;}

        try {
            const { performBookmarksIndex } = await import('../indexing');
            await performBookmarksIndex(true);
        } catch (err) {
            log.warn('onImportEnded', 'Full bookmark re-index after import failed', errorMeta(err));
        }
        debouncedBroadcast('bookmarks', broadcast);
    });

    log.info('setup', '✅ Data-change listeners registered (bookmarks: onCreated/onRemoved/onMoved/onChanged/onImportEnded)');

}
