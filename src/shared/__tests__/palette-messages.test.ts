import { describe, it, expect } from 'vitest';
import { formatPaletteDiagnosticToast } from '../palette-messages';

describe('palette-messages', () => {
    it('formats GET_STORAGE_QUOTA', () => {
        const s = formatPaletteDiagnosticToast('GET_STORAGE_QUOTA', {
            status: 'OK',
            data: {
                usedFormatted: '12 MB',
                totalFormatted: '5 GB',
                itemCount: 42,
                percentage: 10,
                total: 5 * 1024 ** 3,
            },
        });
        expect(s).toContain('12 MB');
        expect(s).toContain('42 indexed');
    });

    it('formats GET_HEALTH_STATUS with isHealthy', () => {
        expect(
            formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
                status: 'OK',
                data: { isHealthy: true, indexedItems: 100, issues: [] },
            }),
        ).toContain('Healthy');
    });

    it('formats GET_EMBEDDING_STATS', () => {
        const s = formatPaletteDiagnosticToast('GET_EMBEDDING_STATS', {
            status: 'OK',
            total: 200,
            withEmbeddings: 50,
            embeddingModel: 'nomic-embed-text',
            estimatedBytes: 1024,
        });
        expect(s).toContain('50 / 200');
        expect(s).toContain('nomic-embed-text');
    });

    it('formats GET_SEARCH_ANALYTICS', () => {
        expect(
            formatPaletteDiagnosticToast('GET_SEARCH_ANALYTICS', {
                status: 'OK',
                totalSearches: 3,
                averageResults: 10,
                averageDuration: 25,
            }),
        ).toContain('3 traces');
    });
});
