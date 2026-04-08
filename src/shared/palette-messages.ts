/**
 * Shared formatting and classification for palette → service worker messages
 * (diagnostic readouts, long toasts, overlay stay-open behavior).
 */

export const PALETTE_DIAGNOSTIC_MESSAGE_TYPES: readonly string[] = [
    'GET_STORAGE_QUOTA',
    'GET_HEALTH_STATUS',
    'GET_EMBEDDING_STATS',
    'GET_EMBEDDING_PROGRESS',
    'GET_PERFORMANCE_METRICS',
    'GET_SEARCH_ANALYTICS',
];

export const PALETTE_DIAGNOSTIC_TOAST_MS = 12_000;

export function isPaletteDiagnosticMessageType(messageType: string): boolean {
    return PALETTE_DIAGNOSTIC_MESSAGE_TYPES.includes(messageType);
}

function formatBytesShort(n: number): string {
    if (!Number.isFinite(n) || n <= 0) {return '0 B';}
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
    return `${parseFloat((n / k ** i).toFixed(2))} ${sizes[i]}`;
}

function isOkStatus(resp: Record<string, unknown>): boolean {
    return resp.status === 'OK' || resp.status === 'ok';
}

/**
 * Human-readable one-line (or short multi-line) summary for diagnostic responses.
 * Returns null to let the caller fall back to a generic message.
 */
export function formatPaletteDiagnosticToast(
    messageType: string,
    resp: Record<string, unknown> | null | undefined,
): string | null {
    if (!resp || !isOkStatus(resp)) {return null;}

    switch (messageType) {
        case 'GET_STORAGE_QUOTA': {
            const d = resp.data as
                | {
                      usedFormatted?: string;
                      totalFormatted?: string;
                      itemCount?: number;
                      percentage?: number;
                      total?: number;
                  }
                | undefined;
            if (!d) {return null;}
            const pct =
                typeof d.percentage === 'number' && d.total && d.total > 0
                    ? ` (${d.percentage}% of quota)`
                    : '';
            return `Storage: ${d.usedFormatted ?? '?'} used / ${d.totalFormatted ?? '?'} total · ${d.itemCount ?? 0} indexed items${pct}`;
        }
        case 'GET_HEALTH_STATUS': {
            const d = resp.data as
                | { isHealthy?: boolean; indexedItems?: number; issues?: string[] }
                | undefined;
            if (!d) {return 'Health: OK';}
            const state = d.isHealthy ? 'Healthy' : 'Issues';
            const items =
                typeof d.indexedItems === 'number' ? ` · ${d.indexedItems} indexed items` : '';
            const issueHint =
                !d.isHealthy && d.issues?.length
                    ? ` · ${d.issues.slice(0, 2).join('; ')}${d.issues.length > 2 ? '…' : ''}`
                    : '';
            return `Health: ${state}${items}${issueHint}`;
        }
        case 'GET_EMBEDDING_STATS': {
            const total = resp.total as number | undefined;
            const withEmb = resp.withEmbeddings as number | undefined;
            const model = resp.embeddingModel as string | undefined;
            const est = resp.estimatedBytes as number | undefined;
            if (total === undefined || withEmb === undefined) {return null;}
            const bytes =
                typeof est === 'number' ? ` · ~${formatBytesShort(est)} vector data` : '';
            return `Embeddings: ${withEmb} / ${total} items with vectors${model ? ` · ${model}` : ''}${bytes}`;
        }
        case 'GET_EMBEDDING_PROGRESS': {
            const p = resp.progress as
                | {
                      state?: string;
                      withEmbeddings?: number;
                      total?: number;
                      remaining?: number;
                      estimatedMinutes?: number;
                      lastError?: string;
                  }
                | undefined;
            if (!p) {return null;}
            const eta =
                typeof p.estimatedMinutes === 'number'
                    ? ` · ETA ~${p.estimatedMinutes} min`
                    : '';
            const err = p.lastError ? ` · ${p.lastError.slice(0, 80)}` : '';
            return `Embedding job: ${p.state ?? 'unknown'} · ${p.withEmbeddings ?? 0}/${p.total ?? 0} (${p.remaining ?? 0} left)${eta}${err}`;
        }
        case 'GET_PERFORMANCE_METRICS': {
            const formatted = resp.formatted as Record<string, string> | undefined;
            if (formatted && typeof formatted === 'object') {
                return Object.entries(formatted)
                    .slice(0, 7)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n');
            }
            return null;
        }
        case 'GET_SEARCH_ANALYTICS': {
            const ts = resp.totalSearches as number | undefined;
            if (ts === undefined) {return null;}
            if (ts === 0) {return 'Search analytics: no debug traces yet (enable Search Debug or run searches)';}
            const ar = Number(resp.averageResults);
            const ad = Number(resp.averageDuration);
            return `Search analytics: ${ts} traces · avg ${ar.toFixed(1)} results · avg ${ad.toFixed(0)} ms`;
        }
        default:
            return null;
    }
}
