// diagnostics.ts — Export diagnostics for bug reporting (Open-Closed Design)

import { Logger } from '../core/logger';
import { SettingsManager } from '../core/settings';
import { getAllIndexedItems, getStorageQuotaInfo } from './database';
import { checkHealth } from './resilience';

const logger = Logger.forComponent('Diagnostics');

/**
 * Diagnostic collector interface (Open-Closed Principle)
 * Add new collectors without modifying existing code
 */
export interface IDiagnosticCollector {
    name: string;
    collect(): Promise<Record<string, any>>;
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
    async collect(): Promise<Record<string, any>> {
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
                deviceMemory: (navigator as any).deviceMemory || 'unknown',
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
                    withMetadata: items.filter(i => i.metaDescription || (i.metaKeywords && i.metaKeywords.length > 0)).length,
                    withBookmarks: items.filter(i => (i as any).isBookmark).length,
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
    async collect(): Promise<Record<string, any>> {
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
    async collect(): Promise<Record<string, any>> {
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
    async collect(): Promise<Record<string, any>> {
        const memory = (performance as any).memory;
        
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
    collectors: { [name: string]: Record<string, any> };
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
