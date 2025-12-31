// diversity-filter.test.ts — Tests for URL diversity filter
// SmrutiCortex v4.0

import { describe, it, expect } from 'vitest';
import { IndexedItem } from '../../background/schema';

// ============================================================================
// INLINE IMPLEMENTATIONS FOR TESTING (avoids browser API dependency)
// These mirror the functions in diversity-filter.ts
// ============================================================================

/**
 * Normalizes a URL by removing query parameters, fragments, and trailing slashes.
 */
function normalizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        if (normalized.endsWith('/') && normalized.length > parsed.protocol.length + 2 + parsed.host.length + 1) {
            normalized = normalized.slice(0, -1);
        }
        return normalized.toLowerCase();
    } catch {
        return url.toLowerCase().split('?')[0].split('#')[0].replace(/\/$/, '');
    }
}

interface ScoredItem {
    item: IndexedItem;
    finalScore: number;
}

/**
 * Filters duplicate URLs from search results.
 */
function applyDiversityFilter<T extends ScoredItem>(
    results: T[],
    enableDiversity: boolean
): T[] {
    if (!enableDiversity) return results;

    const seenUrls = new Map<string, T>();
    for (const result of results) {
        const normalizedUrl = normalizeUrl(result.item.url);
        if (!seenUrls.has(normalizedUrl)) {
            seenUrls.set(normalizedUrl, result);
        }
    }
    return Array.from(seenUrls.values());
}

// Helper to create a mock IndexedItem
function createMockItem(url: string, title: string, score: number): ScoredItem {
    const item: IndexedItem = {
        url,
        title,
        hostname: new URL(url).hostname,
        metaDescription: '',
        metaKeywords: [],
        visitCount: 1,
        lastVisit: Date.now(),
        tokens: []
    };
    return { item, finalScore: score };
}

describe('normalizeUrl', () => {
    it('should strip query parameters', () => {
        expect(normalizeUrl('https://example.com/page?foo=bar&baz=qux'))
            .toBe('https://example.com/page');
    });

    it('should strip fragment/hash', () => {
        expect(normalizeUrl('https://example.com/page#section'))
            .toBe('https://example.com/page');
    });

    it('should strip both query params and fragment', () => {
        expect(normalizeUrl('https://example.com/page?foo=bar#section'))
            .toBe('https://example.com/page');
    });

    it('should remove trailing slash (except for root)', () => {
        expect(normalizeUrl('https://example.com/page/'))
            .toBe('https://example.com/page');
    });

    it('should keep trailing slash for root path', () => {
        expect(normalizeUrl('https://example.com/'))
            .toBe('https://example.com/');
    });

    it('should convert to lowercase', () => {
        expect(normalizeUrl('https://Example.COM/Page'))
            .toBe('https://example.com/page');
    });

    it('should handle complex Notion URLs with pvs param', () => {
        const base = 'https://notion.so/dhruvinrsoni/Stop-Fighting-Git-2c997971458a8055b289e363c4664746';
        expect(normalizeUrl(base + '?pvs=12')).toBe(base.toLowerCase());
        expect(normalizeUrl(base + '?pvs=25')).toBe(base.toLowerCase());
        expect(normalizeUrl(base)).toBe(base.toLowerCase());
    });

    it('should handle UTM tracking parameters', () => {
        expect(normalizeUrl('https://example.com/page?utm_source=twitter&utm_medium=social'))
            .toBe('https://example.com/page');
    });

    it('should handle malformed URLs gracefully', () => {
        const malformed = 'not-a-valid-url?param=value#hash';
        const result = normalizeUrl(malformed);
        expect(result).toBe('not-a-valid-url');
    });

    it('should handle localhost URLs', () => {
        expect(normalizeUrl('http://localhost:3000/path?debug=true'))
            .toBe('http://localhost:3000/path');
    });

    it('should normalize different subdomains separately', () => {
        const url1 = normalizeUrl('https://www.example.com/page');
        const url2 = normalizeUrl('https://api.example.com/page');
        expect(url1).not.toBe(url2);
    });
});

describe('applyDiversityFilter', () => {
    it('should return all results when diversity is disabled', () => {
        const results: ScoredItem[] = [
            createMockItem('https://example.com/page?v=1', 'Page 1', 10),
            createMockItem('https://example.com/page?v=2', 'Page 2', 8),
        ];

        const filtered = applyDiversityFilter(results, false);
        expect(filtered).toHaveLength(2);
    });

    it('should filter duplicates when diversity is enabled', () => {
        const results: ScoredItem[] = [
            createMockItem('https://example.com/page?v=1', 'Page 1', 10),
            createMockItem('https://example.com/page?v=2', 'Page 2', 8),
        ];

        const filtered = applyDiversityFilter(results, true);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].finalScore).toBe(10); // Keep highest score
    });

    it('should keep unique URLs intact', () => {
        const results: ScoredItem[] = [
            createMockItem('https://example.com/page1', 'Page 1', 10),
            createMockItem('https://example.com/page2', 'Page 2', 8),
            createMockItem('https://other.com/page', 'Other', 6),
        ];

        const filtered = applyDiversityFilter(results, true);
        expect(filtered).toHaveLength(3);
    });

    it('should handle Notion-style duplicates correctly', () => {
        const base = 'https://notion.so/dhruvinrsoni/Stop-Fighting-Git-2c997971458a8055b289e363c4664746';
        const results: ScoredItem[] = [
            createMockItem(base, 'Stop Fighting Git', 10),
            createMockItem(base + '?pvs=12', 'Stop Fighting Git', 9),
            createMockItem(base + '?pvs=25', 'Stop Fighting Git', 8),
            createMockItem('https://dhruvinrsoni.notion.site/Stop-Fighting-Git-2c997971458a8055b289e363c4664746', 'Stop Fighting Git', 7),
        ];

        const filtered = applyDiversityFilter(results, true);
        expect(filtered).toHaveLength(2); // notion.so and dhruvinrsoni.notion.site are different hosts
        expect(filtered[0].finalScore).toBe(10);
    });

    it('should handle empty results', () => {
        const filtered = applyDiversityFilter([], true);
        expect(filtered).toHaveLength(0);
    });

    it('should preserve order (highest score first)', () => {
        const results: ScoredItem[] = [
            createMockItem('https://example.com/a?v=1', 'A', 100),
            createMockItem('https://example.com/b', 'B', 50),
            createMockItem('https://example.com/a?v=2', 'A', 25), // Duplicate of first
        ];

        const filtered = applyDiversityFilter(results, true);
        expect(filtered).toHaveLength(2);
        expect(filtered[0].item.url).toBe('https://example.com/a?v=1');
        expect(filtered[1].item.url).toBe('https://example.com/b');
    });

    it('should filter duplicates with different protocols correctly', () => {
        const results: ScoredItem[] = [
            createMockItem('https://example.com/page', 'HTTPS', 10),
            createMockItem('http://example.com/page', 'HTTP', 8),
        ];

        const filtered = applyDiversityFilter(results, true);
        expect(filtered).toHaveLength(2); // Different protocols = different URLs
    });

    it('should handle source_copy_link style params', () => {
        const results: ScoredItem[] = [
            createMockItem('https://example.com/page', 'Page', 10),
            createMockItem('https://example.com/page?source=copy_link', 'Page', 8),
        ];

        const filtered = applyDiversityFilter(results, true);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].finalScore).toBe(10);
    });
});
