/**
 * recent-merge.ts — pure helper used by GET_RECENT_HISTORY to merge the
 * IndexedDB top-N rows with a live `chrome.history.search` snapshot of the
 * last hour. Kept in its own module (and free of any DOM / Chrome / IDB
 * imports) so it is trivially unit-testable in isolation.
 *
 * Why a live merge?
 *   The fast-path onVisited upsert (see `database.ts: upsertRecentVisit`)
 *   already keeps IDB current within milliseconds of a visit in the happy
 *   path. The live merge is the safety net for the rare cases where the
 *   fast path loses a write (extension paused, transient IDB error,
 *   service-worker restart racing onVisited). It guarantees the popup's
 *   Recent list cannot fall behind chrome.history for any URL the user
 *   visited in the last hour.
 *
 * Merge rules:
 *   1. IDB rows always win on shared URLs — they carry the rich fields the
 *      bulk indexer produced (embedding, metaKeywords, isBookmark, ...)
 *      that a synthetic live-only row cannot reconstruct.
 *   2. The IDB row's `lastVisit` is bumped to `max(idbRow.lastVisit, liveRow.lastVisit)`
 *      so a fresher live timestamp still moves the row up in the sort.
 *   3. URLs that appear only in live get a minimal IndexedItem-shaped object
 *      tagged `_source: 'live'` so callers (or future diagnostics) can tell
 *      they were not enriched by the bulk indexer.
 *   4. Final list is sorted by `lastVisit` descending and capped at `limit`.
 */

import type { IndexedItem } from '../schema';

/** A live history row as returned by `chrome.history.search`. */
export interface LiveHistoryItem {
    url?: string;
    title?: string;
    lastVisitTime?: number;
    visitCount?: number;
    typedCount?: number;
}

/** An IndexedItem that may carry a diagnostic `_source` tag. */
export type MergedRecentItem = IndexedItem & { _source?: 'idb' | 'live' };

/**
 * Merge IDB-backed recent items with a live chrome.history snapshot.
 * Pure function — no side effects, no Chrome API access.
 *
 * @param idbItems - rows from `getRecentIndexedItems(limit)`. Assumed
 *                    already sorted by `lastVisit` desc but the merge
 *                    re-sorts defensively.
 * @param liveItems - raw `chrome.history.HistoryItem`-like rows. Items
 *                     without a `url` are dropped.
 * @param limit    - maximum length of the returned list. Defaults to 50.
 */
export function mergeRecentSources(
    idbItems: ReadonlyArray<IndexedItem>,
    liveItems: ReadonlyArray<LiveHistoryItem>,
    limit = 50,
): MergedRecentItem[] {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;

    const byUrl = new Map<string, MergedRecentItem>();

    // Seed with IDB rows first so they always win on URL conflicts.
    for (const row of idbItems) {
        if (!row || typeof row.url !== 'string' || !row.url) {continue;}
        byUrl.set(row.url, { ...row, _source: 'idb' });
    }

    // Walk live rows. Either bump an existing IDB row's lastVisit or insert
    // a synthetic live-only row.
    for (const live of liveItems) {
        if (!live || typeof live.url !== 'string' || !live.url) {continue;}

        const liveLastVisit = typeof live.lastVisitTime === 'number' && Number.isFinite(live.lastVisitTime)
            ? live.lastVisitTime
            : 0;

        const existing = byUrl.get(live.url);
        if (existing) {
            // IDB row wins on every field except lastVisit, which advances
            // monotonically. A fresher live timestamp still moves the row
            // up in the final sort.
            const merged: MergedRecentItem = {
                ...existing,
                lastVisit: Math.max(existing.lastVisit ?? 0, liveLastVisit),
            };
            byUrl.set(live.url, merged);
            continue;
        }

        // Live-only row. Synthesise a minimal IndexedItem-shaped object so
        // downstream renderers don't need to special-case the source.
        let hostname = '';
        try { hostname = new URL(live.url).hostname; }
        catch { /* keep hostname empty rather than drop the row */ }

        byUrl.set(live.url, {
            url: live.url,
            title: typeof live.title === 'string' ? live.title : '',
            hostname,
            visitCount: typeof live.visitCount === 'number' && live.visitCount > 0 ? live.visitCount : 1,
            lastVisit: liveLastVisit,
            tokens: [],
            _source: 'live',
        });
    }

    // Sort desc by lastVisit, then by URL for deterministic ties.
    const merged = Array.from(byUrl.values()).sort((a, b) => {
        const dt = (b.lastVisit ?? 0) - (a.lastVisit ?? 0);
        if (dt !== 0) {return dt;}
        return a.url.localeCompare(b.url);
    });

    return merged.slice(0, safeLimit);
}
