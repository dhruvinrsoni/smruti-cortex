// performance-monitor.ts — Real-time performance metrics tracking

import { Logger } from '../core/logger';

const logger = Logger.forComponent('PerformanceMonitor');

/**
 * Performance metrics data structure
 */
export interface PerformanceMetrics {
    // Search performance
    searchCount: number;
    averageSearchTimeMs: number;
    minSearchTimeMs: number;
    maxSearchTimeMs: number;
    lastSearchTimeMs: number;
    
    // Indexing performance
    lastIndexDurationMs: number;
    totalItemsIndexed: number;
    
    // Memory usage
    memoryUsedMB: number;
    memoryTotalMB: number;
    
    // Service worker stats
    serviceWorkerRestarts: number;
    lastRestartTime: number | null;
    
    // Uptime
    startTime: number;
    uptimeMs: number;
    
    // Health
    healthCheckCount: number;
    selfHealCount: number;
}

/**
 * Performance tracker (singleton pattern)
 */
class PerformanceTracker {
    private searchTimes: number[] = [];
    private indexDuration: number = 0;
    private itemsIndexed: number = 0;
    private restartCount: number = 0;
    private lastRestart: number | null = null;
    private startTime: number = Date.now();
    private healthChecks: number = 0;
    private selfHeals: number = 0;
    
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
        // Keep only last 100 searches for averaging
        if (this.searchTimes.length > 100) {
            this.searchTimes.shift();
        }
        logger.trace('recordSearch', `Search completed in ${durationMs.toFixed(2)}ms`);
    }
    
    /**
     * Record indexing operation
     */
    recordIndexing(durationMs: number, itemCount: number): void {
        this.indexDuration = durationMs;
        this.itemsIndexed = itemCount;
        logger.debug('recordIndexing', `Indexed ${itemCount} items in ${durationMs}ms`);
    }
    
    /**
     * Record service worker restart
     */
    recordRestart(): void {
        this.restartCount++;
        this.lastRestart = Date.now();
        logger.info('recordRestart', `Service worker restart #${this.restartCount}`);
    }
    
    /**
     * Record health check
     */
    recordHealthCheck(): void {
        this.healthChecks++;
    }
    
    /**
     * Record self-heal attempt
     */
    recordSelfHeal(): void {
        this.selfHeals++;
        logger.info('recordSelfHeal', `Self-heal attempt #${this.selfHeals}`);
    }
    
    /**
     * Get current performance metrics
     */
    getMetrics(): PerformanceMetrics {
        const memory = (performance as any).memory;
        const now = Date.now();
        
        // Calculate search statistics
        const searchCount = this.searchTimes.length;
        const avgSearchTime = searchCount > 0 
            ? this.searchTimes.reduce((a, b) => a + b, 0) / searchCount 
            : 0;
        const minSearchTime = searchCount > 0 ? Math.min(...this.searchTimes) : 0;
        const maxSearchTime = searchCount > 0 ? Math.max(...this.searchTimes) : 0;
        const lastSearchTime = searchCount > 0 ? this.searchTimes[this.searchTimes.length - 1] : 0;
        
        return {
            // Search metrics
            searchCount,
            averageSearchTimeMs: Math.round(avgSearchTime * 100) / 100,
            minSearchTimeMs: Math.round(minSearchTime * 100) / 100,
            maxSearchTimeMs: Math.round(maxSearchTime * 100) / 100,
            lastSearchTimeMs: Math.round(lastSearchTime * 100) / 100,
            
            // Indexing metrics
            lastIndexDurationMs: this.indexDuration,
            totalItemsIndexed: this.itemsIndexed,
            
            // Memory metrics
            memoryUsedMB: memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024 * 10) / 10 : 0,
            memoryTotalMB: memory ? Math.round(memory.totalJSHeapSize / 1024 / 1024 * 10) / 10 : 0,
            
            // Service worker metrics
            serviceWorkerRestarts: this.restartCount,
            lastRestartTime: this.lastRestart,
            
            // Uptime
            startTime: this.startTime,
            uptimeMs: now - this.startTime,
            
            // Health metrics
            healthCheckCount: this.healthChecks,
            selfHealCount: this.selfHeals,
        };
    }
    
    /**
     * Reset all metrics (for testing/debugging)
     */
    reset(): void {
        this.searchTimes = [];
        this.indexDuration = 0;
        this.itemsIndexed = 0;
        this.restartCount = 0;
        this.lastRestart = null;
        this.startTime = Date.now();
        this.healthChecks = 0;
        this.selfHeals = 0;
        logger.info('reset', 'Performance metrics reset');
    }
}

// Export singleton instance
export const performanceTracker = PerformanceTracker.getInstance();

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
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
 * Format metrics as display-friendly object
 */
export function formatMetricsForDisplay(metrics: PerformanceMetrics): Record<string, string> {
    return {
        'Search Count': metrics.searchCount.toString(),
        'Avg Search Time': `${metrics.averageSearchTimeMs.toFixed(2)} ms`,
        'Min/Max Search': `${metrics.minSearchTimeMs.toFixed(2)} / ${metrics.maxSearchTimeMs.toFixed(2)} ms`,
        'Last Search': `${metrics.lastSearchTimeMs.toFixed(2)} ms`,
        'Items Indexed': metrics.totalItemsIndexed.toLocaleString(),
        'Last Index Time': `${(metrics.lastIndexDurationMs / 1000).toFixed(1)} s`,
        'Memory Used': `${metrics.memoryUsedMB} / ${metrics.memoryTotalMB} MB`,
        'SW Restarts': metrics.serviceWorkerRestarts.toString(),
        'Uptime': formatUptime(metrics.uptimeMs),
        'Health Checks': metrics.healthCheckCount.toString(),
        'Self-Heals': metrics.selfHealCount.toString(),
    };
}
