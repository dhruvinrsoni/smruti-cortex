// resilience.ts — Self-healing and recovery module for SmrutiCortex
// Ensures the extension can recover from any state and remains functional

import { Logger } from '../core/logger';
import { openDatabase, getAllIndexedItems, clearIndexedDB, getForceRebuildFlag, setForceRebuildFlag } from './database';
import { performFullRebuild, ingestHistory } from './indexing';

const logger = Logger.forComponent('Resilience');

// Health check thresholds
const MIN_EXPECTED_ITEMS = 10; // Minimum items expected for a "healthy" index
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

/**
 * Health status of the extension
 */
export interface HealthStatus {
    isHealthy: boolean;
    indexedItems: number;
    databaseOpen: boolean;
    lastCheck: number;
    issues: string[];
}

let lastHealthStatus: HealthStatus | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Perform a health check on the extension state
 */
export async function checkHealth(): Promise<HealthStatus> {
    const issues: string[] = [];
    let databaseOpen = false;
    let indexedItems = 0;

    logger.debug('checkHealth', '🩺 Running health check...');

    try {
        // Check 1: Database accessible
        await openDatabase();
        databaseOpen = true;
        logger.trace('checkHealth', '✅ Database is accessible');
    } catch (error) {
        issues.push('Database not accessible');
        logger.warn('checkHealth', '❌ Database check failed', error);
    }

    try {
        // Check 2: Index has items
        const items = await getAllIndexedItems();
        indexedItems = items.length;
        
        if (indexedItems === 0) {
            issues.push('Index is empty');
            logger.warn('checkHealth', '❌ Index is empty');
        } else if (indexedItems < MIN_EXPECTED_ITEMS) {
            issues.push(`Index has very few items (${indexedItems})`);
            logger.warn('checkHealth', `⚠️ Index has only ${indexedItems} items`);
        } else {
            logger.trace('checkHealth', `✅ Index has ${indexedItems} items`);
        }
    } catch (error) {
        issues.push('Failed to read index');
        logger.warn('checkHealth', '❌ Index read failed', error);
    }

    const status: HealthStatus = {
        isHealthy: issues.length === 0,
        indexedItems,
        databaseOpen,
        lastCheck: Date.now(),
        issues,
    };

    lastHealthStatus = status;
    
    if (status.isHealthy) {
        logger.debug('checkHealth', '✅ Health check passed', { indexedItems });
    } else {
        logger.warn('checkHealth', '⚠️ Health check found issues', { issues, indexedItems });
    }

    return status;
}

/**
 * Attempt to self-heal the extension
 * Called when health check fails or after data operations
 */
export async function selfHeal(reason: string): Promise<boolean> {
    logger.info('selfHeal', `🔧 Self-healing triggered: ${reason}`);
    
    try {
        // Step 1: Ensure database is open
        logger.info('selfHeal', '📂 Opening database...');
        await openDatabase();
        
        // Step 2: Check if index needs rebuilding
        const items = await getAllIndexedItems();
        
        if (items.length === 0) {
            logger.info('selfHeal', '🔄 Index is empty, performing full rebuild...');
            await performFullRebuild();
            logger.info('selfHeal', '✅ Index rebuilt successfully');
        } else {
            logger.info('selfHeal', `✅ Index has ${items.length} items, no rebuild needed`);
        }
        
        // Step 3: Clear force rebuild flag if set
        const forceFlag = await getForceRebuildFlag();
        if (forceFlag) {
            await setForceRebuildFlag(false);
            logger.debug('selfHeal', '🚩 Cleared force rebuild flag');
        }
        
        // Step 4: Verify health
        const health = await checkHealth();
        
        if (health.isHealthy) {
            logger.info('selfHeal', '✅ Self-healing completed successfully', { 
                indexedItems: health.indexedItems 
            });
            return true;
        } else {
            logger.warn('selfHeal', '⚠️ Self-healing completed but issues remain', { 
                issues: health.issues 
            });
            return false;
        }
    } catch (error) {
        logger.error('selfHeal', '❌ Self-healing failed', error);
        return false;
    }
}

/**
 * Clear all data and immediately rebuild
 * This is the "nuclear option" that clears everything and starts fresh
 */
export async function clearAndRebuild(): Promise<{ success: boolean; message: string; itemCount: number }> {
    logger.info('clearAndRebuild', '🗑️ Starting clear and rebuild operation...');
    
    try {
        // Step 1: Clear IndexedDB
        logger.info('clearAndRebuild', '🗑️ Clearing IndexedDB...');
        await clearIndexedDB();
        logger.info('clearAndRebuild', '✅ IndexedDB cleared');
        
        // Step 2: Immediately rebuild (don't set flag and wait)
        logger.info('clearAndRebuild', '🔄 Starting immediate rebuild...');
        await performFullRebuild();
        
        // Step 3: Verify rebuild succeeded
        const items = await getAllIndexedItems();
        const itemCount = items.length;
        
        if (itemCount > 0) {
            logger.info('clearAndRebuild', `✅ Clear and rebuild completed: ${itemCount} items indexed`);
            return {
                success: true,
                message: `Data cleared and rebuilt successfully. ${itemCount} items indexed.`,
                itemCount,
            };
        } else {
            logger.warn('clearAndRebuild', '⚠️ Rebuild completed but index is still empty');
            return {
                success: true,
                message: 'Data cleared. No browser history found to index.',
                itemCount: 0,
            };
        }
    } catch (error) {
        const errorMessage = (error as Error).message;
        logger.error('clearAndRebuild', '❌ Clear and rebuild failed', error);
        return {
            success: false,
            message: `Operation failed: ${errorMessage}`,
            itemCount: 0,
        };
    }
}

/**
 * Start periodic health monitoring
 */
export function startHealthMonitoring(): void {
    if (healthCheckTimer) {
        logger.debug('startHealthMonitoring', 'Health monitoring already running');
        return;
    }
    
    logger.info('startHealthMonitoring', '🩺 Starting periodic health monitoring');
    
    // Run initial check
    checkHealth().then(status => {
        if (!status.isHealthy) {
            // Auto-heal on startup if issues found
            selfHeal('Startup health check failed');
        }
    });
    
    // Set up periodic checks
    healthCheckTimer = setInterval(async () => {
        const status = await checkHealth();
        
        // Auto-heal if index is empty (critical issue)
        if (status.indexedItems === 0 && status.databaseOpen) {
            logger.warn('startHealthMonitoring', '⚠️ Empty index detected, triggering self-heal');
            await selfHeal('Empty index detected during periodic check');
        }
    }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop health monitoring
 */
export function stopHealthMonitoring(): void {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
        logger.debug('stopHealthMonitoring', 'Health monitoring stopped');
    }
}

/**
 * Get the last health status (cached)
 */
export function getLastHealthStatus(): HealthStatus | null {
    return lastHealthStatus;
}

/**
 * Ensure the extension is ready for use
 * Call this before any critical operation
 */
export async function ensureReady(): Promise<boolean> {
    const health = await checkHealth();
    
    if (!health.isHealthy && health.indexedItems === 0) {
        logger.info('ensureReady', '⚠️ Extension not ready, attempting self-heal');
        return await selfHeal('ensureReady check failed');
    }
    
    return health.isHealthy;
}
