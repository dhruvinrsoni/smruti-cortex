// diagnostics.ts — Export diagnostics for bug reporting (Open-Closed Design)

import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { getAllIndexedItems, getStorageQuotaInfo } from './database';
import { checkHealth } from './resilience';

const logger = Logger.forComponent('Diagnostics');

/**
 * Search debug history for tracking queries and results
 */
interface SearchDebugEntry {
    timestamp: number;
    query: string;
    resultCount: number;
    duration: number;
}

// In-memory search history (limited to last 50 searches)
const searchHistory: SearchDebugEntry[] = [];
const MAX_SEARCH_HISTORY = 50;

// Search debug enabled flag (persisted via chrome.storage.local)
let searchDebugEnabled = false;

/**
 * Initialize search debug enabled state from storage
 */
export async function initSearchDebugState(): Promise<void> {
    try {
        const result = await chrome.storage.local.get('searchDebugEnabled');
        searchDebugEnabled = result.searchDebugEnabled ?? false;
        logger.debug('initSearchDebugState', `Search debug initialized: ${searchDebugEnabled}`);
    } catch (error) {
        logger.error('initSearchDebugState', 'Failed to initialize:', error);
        searchDebugEnabled = false;
    }
}

/**
 * Get search debug enabled state
 */
export function isSearchDebugEnabled(): boolean {
    return searchDebugEnabled;
}

/**
 * Set search debug enabled state
 */
export async function setSearchDebugEnabled(enabled: boolean): Promise<void> {
    searchDebugEnabled = enabled;
    try {
        await chrome.storage.local.set({ searchDebugEnabled: enabled });
        logger.info('setSearchDebugEnabled', `Search debug ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        logger.error('setSearchDebugEnabled', 'Failed to persist:', error);
    }
}

/**
 * Record a search for debugging
 */
export function recordSearchDebug(query: string, resultCount: number, duration: number): void {
    // Only record if search debug is enabled
    if (!searchDebugEnabled) {
        return;
    }
    
    searchHistory.push({
        timestamp: Date.now(),
        query,
        resultCount,
        duration,
    });
    
    // Keep only last 50
    if (searchHistory.length > MAX_SEARCH_HISTORY) {
        searchHistory.shift();
    }
}

/**
 * Get search history
 */
export function getSearchHistory(): SearchDebugEntry[] {
    return [...searchHistory];
}

/**
 * Get search analytics
 */
export function getSearchAnalytics() {
    if (searchHistory.length === 0) {
        return {
            totalSearches: 0,
            averageResults: 0,
            averageDuration: 0,
            topQueries: [],
        };
    }
    
    const queryCounts = new Map<string, number>();
    let totalResults = 0;
    let totalDuration = 0;
    
    searchHistory.forEach((entry) => {
        const normalized = entry.query.toLowerCase().trim();
        queryCounts.set(normalized, (queryCounts.get(normalized) || 0) + 1);
        totalResults += entry.resultCount;
        totalDuration += entry.duration;
    });
    
    const topQueries = Array.from(queryCounts.entries())
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    return {
        totalSearches: searchHistory.length,
        averageResults: totalResults / searchHistory.length,
        averageDuration: totalDuration / searchHistory.length,
        topQueries,
        recentSearches: searchHistory.slice(-20).reverse(),
    };
}

/**
 * Diagnostic collector interface (Open-Closed Principle)
 * Add new collectors without modifying existing code
 */
export interface IDiagnosticCollector {
    name: string;
    collect(): Promise<Record<string, unknown>>;
}

/**
 * Registry of diagnostic collectors
 */
const collectors: IDiagnosticCollector[] = [];

/**
 * Register a new diagnostic collector
 */
export function registerCollector(collector: IDiagnosticCollector): void {
    collectors.push(collector);
    logger.debug('registerCollector', `Registered diagnostic collector: ${collector.name}`);
}

/**
 * Built-in: System info collector
 */
const systemInfoCollector: IDiagnosticCollector = {
    name: 'system',
    async collect(): Promise<Record<string, unknown>> {
        const manifest = chrome.runtime.getManifest();
        
        return {
            extension: {
                name: manifest.name,
                version: manifest.version,
                manifestVersion: manifest.manifest_version,
            },
            browser: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                languages: navigator.languages,
                onLine: navigator.onLine,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: (navigator as unknown as { deviceMemory?: number }).deviceMemory || 'unknown',
            },
            timestamp: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
    }
};

/**
 * Built-in: Storage collector
 */
const storageCollector: IDiagnosticCollector = {
    name: 'storage',
    async collect(): Promise<Record<string, any>> {
        try {
            const quota = await getStorageQuotaInfo();
            const items = await getAllIndexedItems();
            
            return {
                quota,
                indexStats: {
                    totalItems: items.length,
                    withMetadata: items.filter(i => Boolean(i.metaDescription) || (Array.isArray(i.metaKeywords) && i.metaKeywords.length > 0)).length,
                    withBookmarks: items.filter(i => Boolean(i.isBookmark)).length,
                    uniqueHostnames: new Set(items.map(i => i.hostname)).size,
                },
            };
        } catch (error) {
            return { error: (error as Error).message };
        }
    }
};

/**
 * Built-in: Settings collector
 */
const settingsCollector: IDiagnosticCollector = {
    name: 'settings',
    async collect(): Promise<Record<string, unknown>> {
        try {
            await SettingsManager.init();
            const settings = SettingsManager.getSettings();
            
            // Sanitize sensitive settings
            return {
                ...settings,
                sensitiveUrlBlacklist: settings.sensitiveUrlBlacklist?.length || 0, // Count only, not values
            };
        } catch (error) {
            return { error: (error as Error).message };
        }
    }
};

/**
 * Built-in: Health collector
 */
const healthCollector: IDiagnosticCollector = {
    name: 'health',
    async collect(): Promise<Record<string, unknown>> {
        try {
            const health = await checkHealth();
            return health;
        } catch (error) {
            return { error: (error as Error).message };
        }
    }
};

/**
 * Built-in: Performance collector
 */
const performanceCollector: IDiagnosticCollector = {
    name: 'performance',
    async collect(): Promise<Record<string, unknown>> {
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        
        return {
            timing: {
                timeOrigin: performance.timeOrigin,
                now: performance.now(),
            },
            memory: memory ? {
                usedJSHeapSize: Math.round(memory.usedJSHeapSize / 1024 / 1024) + ' MB',
                totalJSHeapSize: Math.round(memory.totalJSHeapSize / 1024 / 1024) + ' MB',
                jsHeapSizeLimit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + ' MB',
            } : 'Not available',
        };
    }
};

// Register built-in collectors
registerCollector(systemInfoCollector);
registerCollector(storageCollector);
registerCollector(settingsCollector);
registerCollector(healthCollector);
registerCollector(performanceCollector);

/**
 * Full diagnostic report
 */
export interface DiagnosticReport {
    generatedAt: string;
    version: string;
    collectors: { [name: string]: Record<string, unknown> };
}

/**
 * Generate a full diagnostic report
 */
export async function generateDiagnosticReport(): Promise<DiagnosticReport> {
    logger.info('generateDiagnosticReport', '📋 Generating diagnostic report...');
    
    const manifest = chrome.runtime.getManifest();
    const report: DiagnosticReport = {
        generatedAt: new Date().toISOString(),
        version: manifest.version,
        collectors: {},
    };
    
    for (const collector of collectors) {
        try {
            logger.debug('generateDiagnosticReport', `Running collector: ${collector.name}`);
            report.collectors[collector.name] = await collector.collect();
        } catch (error) {
            logger.warn('generateDiagnosticReport', `Collector ${collector.name} failed:`, error);
            report.collectors[collector.name] = { error: (error as Error).message };
        }
    }
    
    logger.info('generateDiagnosticReport', '✅ Diagnostic report generated');
    return report;
}

/**
 * Export diagnostic report as JSON string (for download)
 */
export async function exportDiagnosticsAsJson(): Promise<string> {
    const report = await generateDiagnosticReport();
    return JSON.stringify(report, null, 2);
}

/**
 * Export diagnostic report as formatted text (for copy/paste)
 */
export async function exportDiagnosticsAsText(): Promise<string> {
    const report = await generateDiagnosticReport();
    const lines: string[] = [
        '=== SmrutiCortex Diagnostic Report ===',
        `Generated: ${report.generatedAt}`,
        `Version: ${report.version}`,
        '',
    ];
    
    for (const [name, data] of Object.entries(report.collectors)) {
        lines.push(`--- ${name.toUpperCase()} ---`);
        lines.push(JSON.stringify(data, null, 2));
        lines.push('');
    }
    
    return lines.join('\n');
}
