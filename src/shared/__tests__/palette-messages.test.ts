import { describe, it, expect } from 'vitest';
import { isPaletteDiagnosticMessageType, formatPaletteDiagnosticToast } from '../palette-messages';

describe('palette-messages', () => {
    it('identifies diagnostic message types', () => {
        expect(isPaletteDiagnosticMessageType('GET_HEALTH_STATUS')).toBe(true);
        expect(isPaletteDiagnosticMessageType('NOT_A_TYPE')).toBe(false);
    });

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
        expect(s).toContain('(10% of quota)');
    });

    it('formats GET_HEALTH_STATUS with isHealthy and with issues', () => {
        expect(
            formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
                status: 'OK',
                data: { isHealthy: true, indexedItems: 100, issues: [] },
            }),
        ).toContain('Healthy');

        const s2 = formatPaletteDiagnosticToast('GET_HEALTH_STATUS', {
            status: 'OK',
            data: { isHealthy: false, indexedItems: 7, issues: ['a', 'b', 'c'] },
        });
        expect(s2).toContain('Health: Issues');
        expect(s2).toContain('· 7 indexed items');
        expect(s2).toContain('a; b');
        expect(s2).toContain('…');
    });

    it('formats GET_EMBEDDING_STATS', () => {
        const s = formatPaletteDiagnosticToast('GET_EMBEDDING_STATS', {
            status: 'OK',
            total: 200,
            withEmbeddings: 50,
            embeddingModel: 'nomic-embed-text',
            estimatedBytes: 1024,
        } as any);
        expect(s).toContain('50 / 200');
        expect(s).toContain('nomic-embed-text');
    });

    it('formats GET_PERFORMANCE_METRICS with formatted object', () => {
        const resp = { status: 'OK', formatted: { A: '1ms', B: '2ms', C: '3ms' } } as any;
        const s = formatPaletteDiagnosticToast('GET_PERFORMANCE_METRICS', resp);
        expect(s).toContain('A: 1ms');
        expect(s).toContain('\n');
    });

    it('formats GET_SEARCH_ANALYTICS for zero and non-zero', () => {
        expect(formatPaletteDiagnosticToast('GET_SEARCH_ANALYTICS', { status: 'OK', totalSearches: 0 } as any)).toContain(
            'no debug traces yet',
        );
        const resp = { status: 'OK', totalSearches: 3, averageResults: 20.123, averageDuration: 50.6 } as any;
        const s = formatPaletteDiagnosticToast('GET_SEARCH_ANALYTICS', resp);
        expect(s).toContain('3 traces');
        expect(s).toContain('avg 20.1 results');
        expect(s).toContain('avg 51 ms');
    });

    it('formats RUN_TROUBLESHOOTER healthy and non-healthy', () => {
        const respHealthy = { status: 'OK', data: { steps: [{ status: 'pass' }, { status: 'pass' }], overallStatus: 'healthy', totalDurationMs: 123 } } as any;
        expect(formatPaletteDiagnosticToast('RUN_TROUBLESHOOTER', respHealthy)).toContain('All systems healthy');

        const respIssues = { status: 'OK', data: { steps: [{ status: 'pass' }, { status: 'healed' }, { status: 'fail' }], overallStatus: 'healed', totalDurationMs: 200 } } as any;
        expect(formatPaletteDiagnosticToast('RUN_TROUBLESHOOTER', respIssues)).toContain('Auto-repaired');
    });
});
