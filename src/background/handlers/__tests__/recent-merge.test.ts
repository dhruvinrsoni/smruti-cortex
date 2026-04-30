/**
 * Unit tests for the pure mergeRecentSources helper used by
 * GET_RECENT_HISTORY. Pure function — no Chrome / IDB / DOM mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { mergeRecentSources, type LiveHistoryItem } from '../recent-merge';
import type { IndexedItem } from '../../schema';

function idb(overrides: Partial<IndexedItem> & { url: string; lastVisit: number }): IndexedItem {
  return {
    title: 'idb',
    hostname: 'example.com',
    visitCount: 1,
    tokens: ['idb'],
    ...overrides,
  } as IndexedItem;
}

function live(url: string, lastVisitTime: number, title = 'live'): LiveHistoryItem {
  return { url, title, lastVisitTime, visitCount: 1 };
}

describe('mergeRecentSources', () => {
  it('returns [] when both sources are empty', () => {
    expect(mergeRecentSources([], [])).toEqual([]);
  });

  it('returns IDB rows untouched when live is empty', () => {
    const rows: IndexedItem[] = [
      idb({ url: 'https://a.example', lastVisit: 100 }),
      idb({ url: 'https://b.example', lastVisit: 50 }),
    ];
    const out = mergeRecentSources(rows, []);
    expect(out.map(r => r.url)).toEqual(['https://a.example', 'https://b.example']);
    expect(out.every(r => r._source === 'idb')).toBe(true);
  });

  it('synthesises live-only rows when IDB is empty and tags them _source: "live"', () => {
    const out = mergeRecentSources([], [live('https://x.example/p', 200), live('https://y.example/p', 100)]);
    expect(out.map(r => r.url)).toEqual(['https://x.example/p', 'https://y.example/p']);
    expect(out.every(r => r._source === 'live')).toBe(true);
    expect(out[0].hostname).toBe('x.example');
    expect(out[0].visitCount).toBe(1);
    expect(out[0].tokens).toEqual([]);
  });

  it('IDB wins on URL conflict but lastVisit advances to max(idb, live)', () => {
    // The exact bug case the live merge defends against: IDB has the
    // enriched row but its lastVisit is stale because the fast-path
    // upsert lost the most recent write. The live row has the fresh
    // lastVisit. We must keep IDB's rich fields AND surface the new
    // timestamp so the row sorts to the top.
    const idbRow = idb({
      url: 'https://shared.example/p',
      lastVisit: 100,
      title: 'IDB Title',
      visitCount: 5,
      tokens: ['shared', 'idb'],
      embedding: [0.1, 0.2, 0.3],
      metaKeywords: ['kept'],
    } as Partial<IndexedItem> & { url: string; lastVisit: number });
    const out = mergeRecentSources([idbRow], [live('https://shared.example/p', 500, 'Live Title')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      url: 'https://shared.example/p',
      title: 'IDB Title',
      visitCount: 5,
      embedding: [0.1, 0.2, 0.3],
      metaKeywords: ['kept'],
      lastVisit: 500,
      _source: 'idb',
    });
    expect(out[0].tokens).toEqual(['shared', 'idb']);
  });

  it('never moves lastVisit backwards when the live row is older than the IDB row', () => {
    const idbRow = idb({ url: 'https://mono.example/p', lastVisit: 1_000 });
    const out = mergeRecentSources([idbRow], [live('https://mono.example/p', 100)]);
    expect(out[0].lastVisit).toBe(1_000);
  });

  it('sorts the merged set by lastVisit descending and breaks ties by URL', () => {
    const out = mergeRecentSources(
      [
        idb({ url: 'https://b.example', lastVisit: 100 }),
        idb({ url: 'https://a.example', lastVisit: 100 }), // tie with b
      ],
      [
        live('https://c.example', 300),
        live('https://d.example', 200),
      ],
    );
    expect(out.map(r => r.url)).toEqual([
      'https://c.example',
      'https://d.example',
      'https://a.example', // tie-break: 'a' < 'b'
      'https://b.example',
    ]);
  });

  it('respects the limit and returns the freshest entries', () => {
    const out = mergeRecentSources(
      [idb({ url: 'https://a.example', lastVisit: 50 })],
      [live('https://b.example', 200), live('https://c.example', 100)],
      2,
    );
    expect(out.map(r => r.url)).toEqual(['https://b.example', 'https://c.example']);
  });

  it('falls back to a default limit when given a non-positive or non-finite value', () => {
    // Edge case: a buggy caller passing 0 / NaN should not produce an
    // empty list. We default to 50 (matches getRecentIndexedItems).
    const idbRows: IndexedItem[] = Array.from({ length: 60 }, (_, i) =>
      idb({ url: `https://r${i}.example`, lastVisit: 1000 - i }));
    const out = mergeRecentSources(idbRows, [], 0);
    expect(out).toHaveLength(50);
  });

  it('drops entries with missing or empty url from both sources', () => {
    const out = mergeRecentSources(
      [
        idb({ url: '', lastVisit: 100 }),
        idb({ url: 'https://kept.example', lastVisit: 200 }),
      ],
      [
        { lastVisitTime: 300 } as LiveHistoryItem, // no url
        { url: '', lastVisitTime: 400 } as LiveHistoryItem,
        live('https://also-kept.example', 500),
      ],
    );
    expect(out.map(r => r.url).sort()).toEqual(['https://also-kept.example', 'https://kept.example']);
  });

  it('keeps a live row with an unparseable URL string instead of dropping it', () => {
    // We never want to silently lose a recent visit just because the URL
    // string fails the URL constructor. The merge keeps the row and
    // leaves hostname blank — the renderer can still show the URL.
    const unparseable = 'not a url at all !!';
    const out = mergeRecentSources(
      [],
      [{ url: unparseable, lastVisitTime: 100, title: 'broken' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe(unparseable);
    expect(out[0].hostname).toBe('');
  });

  it('treats non-finite lastVisitTime on live rows as 0 (sorts to bottom)', () => {
    const out = mergeRecentSources(
      [],
      [
        live('https://has-time.example', 500),
        { url: 'https://no-time.example', title: 'x' } as LiveHistoryItem,
      ],
    );
    expect(out.map(r => r.url)).toEqual(['https://has-time.example', 'https://no-time.example']);
    expect(out[1].lastVisit).toBe(0);
  });
});
