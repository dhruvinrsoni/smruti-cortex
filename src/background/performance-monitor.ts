// performance-monitor.ts — Real-time performance metrics tracking with persistence

import { Logger, errorMeta } from '../core/logger';
import { browserAPI } from '../core/helpers';

const logger = Logger.forComponent('PerformanceMonitor');

const STORAGE_KEY = 'smruticortex_performance_metrics';
const PERSIST_DEBOUNCE_MS = 5000;
const PERSISTED_SCHEMA_VERSION = 1;

/**
 * Schema for data persisted to chrome.storage.local.
 * Cumulative counters that survive service worker restarts.
 */
export interface PersistedMetrics {
    totalSearchCount: number;
    totalRestarts: number;
    totalSelfHeals: number;
    totalHealthChecks: number;
    totalItemsIndexed: number;
    lastIndexDurationMs: number;
    version: number;
}

/**
 * Performance metrics data structure returned by getMetrics()
 */
export interface PerformanceMetrics {
    // Search performance
    totalSearchCount: number;
    recentSearchCount: number;
    averageSearchTimeMs: number;
    minSearchTimeMs: number;
    maxSearchTimeMs: number;
    lastSearchTimeMs: number;

    // Indexing performance
    lastIndexDurationMs: number;
    totalItemsIndexed: number;

    // Storage (populated externally by the SW handler)
    storageUsed: string;
    storageTotal: string;

    // Service worker stats
    serviceWorkerRestarts: number;
    lastRestartTime: number | null;

    // Uptime (current session)
    startTime: number;
    uptimeMs: number;

    // Health
    healthCheckCount: number;
    selfHealCount: number;
}

function isValidPersistedMetrics(data: unknown): data is PersistedMetrics {
    if (!data || typeof data !== 'object') { return false; }
    const d = data as Record<string, unknown>;
    return typeof d.version === 'number'
        && typeof d.totalSearchCount === 'number'
        && typeof d.totalRestarts === 'number'
        && typeof d.totalSelfHeals === 'number'
        && typeof d.totalHealthChecks === 'number'
        && typeof d.totalItemsIndexed === 'number'
        && typeof d.lastIndexDurationMs === 'number';
}

function defaultPersistedMetrics(): PersistedMetrics {
    return {
        totalSearchCount: 0,
        totalRestarts: 0,
        totalSelfHeals: 0,
        totalHealthChecks: 0,
        totalItemsIndexed: 0,
        lastIndexDurationMs: 0,
        version: PERSISTED_SCHEMA_VERSION,
    };
}

/**
 * Performance tracker with persistence (singleton pattern)
 */
class PerformanceTracker {
    // Session-only state (resets on SW restart — expected)
    private searchTimes: number[] = [];
    private lastRestart: number | null = null;
    private startTime: number = Date.now();

    // Persisted state (survives restarts)
    private persisted: PersistedMetrics = defaultPersistedMetrics();
    private restored = false;
    private persistTimer: ReturnType<typeof setTimeout> | null = null;

    private static instance: PerformanceTracker;

    static getInstance(): PerformanceTracker {
        if (!PerformanceTracker.instance) {
            PerformanceTracker.instance = new PerformanceTracker();
        }
        return PerformanceTracker.instance;
    }

    /**
     * Record a search operation time
     */
    recordSearch(durationMs: number): void {
        this.searchTimes.push(durationMs);
        if (this.searchTimes.length > 100) {
            this.searchTimes.shift();
        }
        this.persisted.totalSearchCount++;
        this.schedulePersist();
        logger.trace('recordSearch', `Search completed in ${durationMs.toFixed(2)}ms`);
    }

    /**
     * Record indexing operation
     */
    recordIndexing(durationMs: number, itemCount: number): void {
        this.persisted.lastIndexDurationMs = durationMs;
        this.persisted.totalItemsIndexed = itemCount;
        this.schedulePersist();
        logger.debug('recordIndexing', `Indexed ${itemCount} items in ${durationMs}ms`);
    }

    /**
     * Record service worker restart
     */
    recordRestart(): void {
        this.persisted.totalRestarts++;
        this.lastRestart = Date.now();
        this.persistNow();
        logger.info('recordRestart', `Service worker restart #${this.persisted.totalRestarts}`);
    }

    /**
     * Record health check
     */
    recordHealthCheck(): void {
        this.persisted.totalHealthChecks++;
        this.schedulePersist();
    }

    /**
     * Record self-heal attempt
     */
    recordSelfHeal(): void {
        this.persisted.totalSelfHeals++;
        this.schedulePersist();
        logger.info('recordSelfHeal', `Self-heal attempt #${this.persisted.totalSelfHeals}`);
    }

    /**
     * Get current performance metrics.
     * Triggers lazy restore from storage on first call.
     */
    async getMetrics(): Promise<PerformanceMetrics> {
        if (!this.restored) {
            await this.restore();
        }

        const now = Date.now();
        const recentCount = this.searchTimes.length;
        const avgSearchTime = recentCount > 0
            ? this.searchTimes.reduce((a, b) => a + b, 0) / recentCount
            : 0;
        const minSearchTime = recentCount > 0 ? Math.min(...this.searchTimes) : 0;
        const maxSearchTime = recentCount > 0 ? Math.max(...this.searchTimes) : 0;
        const lastSearchTime = recentCount > 0 ? this.searchTimes[this.searchTimes.length - 1] : 0;

        return {
            totalSearchCount: this.persisted.totalSearchCount,
            recentSearchCount: recentCount,
            averageSearchTimeMs: Math.round(avgSearchTime * 100) / 100,
            minSearchTimeMs: Math.round(minSearchTime * 100) / 100,
            maxSearchTimeMs: Math.round(maxSearchTime * 100) / 100,
            lastSearchTimeMs: Math.round(lastSearchTime * 100) / 100,

            lastIndexDurationMs: this.persisted.lastIndexDurationMs,
            totalItemsIndexed: this.persisted.totalItemsIndexed,

            storageUsed: '',
            storageTotal: '',

            serviceWorkerRestarts: this.persisted.totalRestarts,
            lastRestartTime: this.lastRestart,

            startTime: this.startTime,
            uptimeMs: now - this.startTime,

            healthCheckCount: this.persisted.totalHealthChecks,
            selfHealCount: this.persisted.totalSelfHeals,
        };
    }

    /**
     * Reset all metrics (for testing/debugging) — clears persisted data too
     */
    async reset(): Promise<void> {
        this.searchTimes = [];
        this.lastRestart = null;
        this.startTime = Date.now();
        this.persisted = defaultPersistedMetrics();
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        try {
            await new Promise<void>((resolve) => {
                browserAPI.storage.local.remove(STORAGE_KEY, () => resolve());
            });
        } catch {
            // Non-critical — in-memory state is already cleared
        }
        logger.info('reset', 'Performance metrics reset');
    }

    /**
     * Restore persisted metrics from chrome.storage.local (lazy, called once)
     */
    async restore(): Promise<void> {
        if (this.restored) { return; }
        this.restored = true;
        try {
            const result = await new Promise<Record<string, unknown>>((resolve) => {
                browserAPI.storage.local.get([STORAGE_KEY], (r: Record<string, unknown>) => resolve(r));
            });
            const stored = result[STORAGE_KEY];
            if (isValidPersistedMetrics(stored)) {
                this.persisted = { ...stored };
                logger.info('restore', `Restored persisted metrics (${stored.totalSearchCount} total searches, ${stored.totalRestarts} restarts)`);
            } else if (stored !== undefined) {
                logger.warn('restore', 'Stored metrics failed validation, starting fresh');
            }
        } catch (err) {
            logger.warn('restore', 'Failed to restore metrics, starting fresh', errorMeta(err));
        }
    }

    // --- internal helpers for testing ---
    /** @internal */
    _getRestoredFlag(): boolean { return this.restored; }
    /** @internal */
    _setRestoredFlag(v: boolean): void { this.restored = v; }
    /** @internal */
    _getPersisted(): PersistedMetrics { return this.persisted; }

    private schedulePersist(): void {
        if (this.persistTimer) { return; }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            this.persistNow();
        }, PERSIST_DEBOUNCE_MS);
    }

    private persistNow(): void {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        try {
            browserAPI.storage.local.set({ [STORAGE_KEY]: { ...this.persisted } }, () => {
                if (browserAPI.runtime?.lastError) {
                    logger.warn('persist', 'Storage write failed', { error: browserAPI.runtime.lastError.message });
                }
            });
        } catch (err) {
            logger.warn('persist', 'Failed to persist metrics', errorMeta(err));
        }
    }
}

// Export singleton instance
export const performanceTracker = PerformanceTracker.getInstance();

/**
 * Get current performance metrics (async — triggers lazy restore)
 */
export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
    return performanceTracker.getMetrics();
}

/**
 * Format uptime as human-readable string
 */
export function formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Optional storage info passed from the service worker handler
 */
export interface StorageDisplayInfo {
    usedFormatted: string;
    totalFormatted: string;
}

/**
 * Format metrics as display-friendly object
 */
export function formatMetricsForDisplay(metrics: PerformanceMetrics, storage?: StorageDisplayInfo): Record<string, string> {
    return {
        'Total Searches': metrics.totalSearchCount.toLocaleString(),
        'Avg Search Time': `${metrics.averageSearchTimeMs.toFixed(2)} ms`,
        'Min/Max Search': `${metrics.minSearchTimeMs.toFixed(2)} / ${metrics.maxSearchTimeMs.toFixed(2)} ms`,
        'Last Search': `${metrics.lastSearchTimeMs.toFixed(2)} ms`,
        'Items Indexed': metrics.totalItemsIndexed.toLocaleString(),
        'Last Index Time': `${(metrics.lastIndexDurationMs / 1000).toFixed(1)} s`,
        'Storage Used': storage ? `${storage.usedFormatted} / ${storage.totalFormatted}` : 'N/A',
        'SW Restarts': metrics.serviceWorkerRestarts.toString(),
        'Uptime': formatUptime(metrics.uptimeMs),
        'Health Checks': metrics.healthCheckCount.toString(),
        'Self-Heals': metrics.selfHealCount.toString(),
    };
}
