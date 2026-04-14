// embedding-processor.ts — Background embedding generation with pause/resume and search priority

import { Logger } from '../core/logger';
import { Traced } from '../core/traced';
import { SettingsManager } from '../core/settings';
import { countItemsWithoutEmbeddings, getItemsWithoutEmbeddingsBatch, saveIndexedItem } from './database';
import { generateItemEmbedding } from './indexing';

const logger = Logger.forComponent('EmbeddingProcessor');

export type ProcessorState = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export interface EmbeddingProgress {
    state: ProcessorState;
    processed: number;
    total: number;
    withEmbeddings: number;
    remaining: number;
    speed: number;           // items per minute (rolling average)
    estimatedMinutes: number;
    lastError?: string;
    startedAt?: number;
}

// Rolling window for speed calculation
const SPEED_WINDOW_SIZE = 20;

class EmbeddingProcessorImpl {
    private state: ProcessorState = 'idle';
    private searchActive = false;
    private processed = 0;
    private total = 0;
    private withEmbeddings = 0;
    private startedAt = 0;
    private lastError?: string;
    private loopRunning = false;

    // Speed tracking: timestamps of last N completions
    private completionTimestamps: number[] = [];

    /**
     * Start background embedding generation.
     * If already running, this is a no-op.
     */
    @Traced()
    async start(): Promise<void> {
        if (this.state === 'running' && this.loopRunning) {
            logger.debug('start', 'Already running, ignoring start request');
            return;
        }

        // Fast path: if we already completed, verify nothing new arrived
        if (this.state === 'completed') {
            const counts = await countItemsWithoutEmbeddings();
            if (counts.withoutEmbeddings === 0) {
                logger.debug('start', 'Still completed — no new items to embed');
                return;
            }
            logger.info('start', `${counts.withoutEmbeddings} new items detected, restarting`);
        }

        // Check if embeddings are enabled
        await SettingsManager.init();
        const embeddingsEnabled = SettingsManager.getSetting('embeddingsEnabled') ?? false;
        if (!embeddingsEnabled) {
            logger.info('start', 'Embeddings disabled in settings, staying idle');
            this.state = 'idle';
            return;
        }

        logger.info('start', 'Starting background embedding processor...');
        this.state = 'running';
        this.processed = 0;
        this.startedAt = Date.now();
        this.lastError = undefined;
        this.completionTimestamps = [];

        // Refresh counts
        await this.refreshCounts();

        if (this.total === 0) {
            logger.info('start', 'No items in index, nothing to embed');
            this.state = 'idle';
            return;
        }

        const remaining = this.total - this.withEmbeddings;
        if (remaining === 0) {
            logger.info('start', 'All items already have embeddings');
            this.state = 'completed';
            return;
        }

        logger.info('start', `Starting embedding: ${remaining} items remaining out of ${this.total}`);

        // Run the processing loop (non-blocking)
        this.runLoop();
    }

    /**
     * Pause embedding generation. Can be resumed later.
     */
    @Traced()
    pause(): void {
        if (this.state !== 'running') {
            logger.debug('pause', `Cannot pause in state: ${this.state}`);
            return;
        }
        logger.info('pause', `Pausing embedding processor (${this.processed} processed so far)`);
        this.state = 'paused';
    }

    /**
     * Resume embedding generation after pause.
     */
    @Traced()
    resume(): void {
        if (this.state !== 'paused') {
            logger.debug('resume', `Cannot resume in state: ${this.state}`);
            return;
        }
        logger.info('resume', 'Resuming embedding processor...');
        this.state = 'running';

        // If loop is not running (exited during pause), restart it
        if (!this.loopRunning) {
            this.runLoop();
        }
    }

    /**
     * Stop embedding generation completely. Resets progress.
     */
    @Traced()
    stop(): void {
        logger.info('stop', `Stopping embedding processor (state was: ${this.state})`);
        this.state = 'idle';
        this.processed = 0;
        this.completionTimestamps = [];
        this.lastError = undefined;
    }

    /**
     * Signal from search engine: search is active/inactive.
     * When active, the processor yields to let search use Ollama.
     */
    setSearchActive(active: boolean): void {
        if (this.searchActive !== active) {
            this.searchActive = active;
            if (active) {
                logger.trace('setSearchActive', 'Search started — yielding Ollama slot');
            } else {
                logger.trace('setSearchActive', 'Search ended — resuming processing');
            }
        }
    }

    /**
     * Get current progress for UI display.
     */
    getProgress(): EmbeddingProgress {
        const remaining = Math.max(0, this.total - this.withEmbeddings);
        return {
            state: this.state,
            processed: this.processed,
            total: this.total,
            withEmbeddings: this.withEmbeddings,
            remaining,
            speed: this.calculateSpeed(),
            estimatedMinutes: this.calculateETA(remaining),
            lastError: this.lastError,
            startedAt: this.startedAt || undefined,
        };
    }

    // ---- Internal ----

    private async refreshCounts(): Promise<void> {
        try {
            const counts = await countItemsWithoutEmbeddings();
            this.total = counts.total;
            this.withEmbeddings = counts.total - counts.withoutEmbeddings;
        } catch (error) {
            logger.warn('refreshCounts', 'Failed to count items:', error);
        }
    }

    private calculateSpeed(): number {
        if (this.completionTimestamps.length < 2) {return 0;}
        const oldest = this.completionTimestamps[0];
        const newest = this.completionTimestamps[this.completionTimestamps.length - 1];
        const elapsedMinutes = (newest - oldest) / 60_000;
        if (elapsedMinutes <= 0) {return 0;}
        return Math.round((this.completionTimestamps.length - 1) / elapsedMinutes);
    }

    private calculateETA(remaining: number): number {
        const speed = this.calculateSpeed();
        if (speed <= 0 || remaining <= 0) {return 0;}
        return Math.round(remaining / speed);
    }

    private recordCompletion(): void {
        this.completionTimestamps.push(Date.now());
        // Keep only the last N timestamps
        if (this.completionTimestamps.length > SPEED_WINDOW_SIZE) {
            this.completionTimestamps.shift();
        }
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Main processing loop. Runs asynchronously until paused, stopped, or all items are embedded.
     * Fetches items in batches to avoid retrying the same failed item endlessly.
     */
    @Traced()
    private async runLoop(): Promise<void> {
        if (this.loopRunning) {
            logger.debug('runLoop', 'Loop already running, skipping');
            return;
        }
        this.loopRunning = true;
        logger.info('runLoop', 'Processing loop started');

        const BATCH_SIZE = 50; // Fetch 50 items per DB query to avoid cursor restart issues

        try {
            // Import guards lazily to avoid circular deps
            const { isCircuitBreakerOpen, checkMemoryPressure } = await import('./ollama-service');

            while (this.state === 'running') {
                // --- Guard: Circuit breaker tripped → wait ---
                if (isCircuitBreakerOpen()) {
                    logger.info('runLoop', 'Circuit breaker open, waiting 60s...');
                    await this.sleep(60_000);
                    continue;
                }

                // --- Guard: Memory pressure → wait ---
                const mem = checkMemoryPressure();
                if (!mem.ok) {
                    logger.info('runLoop', `Memory pressure (${mem.usedMB}MB), waiting 30s...`);
                    await this.sleep(30_000);
                    continue;
                }

                // --- Get batch of items without embeddings ---
                const batch = await getItemsWithoutEmbeddingsBatch(BATCH_SIZE);

                if (batch.length === 0) {
                    logger.info('runLoop', `All items embedded! Total processed this session: ${this.processed}`);
                    this.state = 'completed';
                    await this.refreshCounts();
                    break;
                }

                logger.debug('runLoop', `Fetched batch of ${batch.length} items to embed`);

                // Process each item in the batch
                for (const item of batch) {
                    if (this.state !== 'running') {break;}

                    // Yield to search when active
                    while (this.searchActive && this.state === 'running') {
                        await this.sleep(300);
                    }
                    if (this.state !== 'running') {break;}

                    // Re-check circuit breaker between items
                    if (isCircuitBreakerOpen()) {break;}

                    try {
                        const embedding = await generateItemEmbedding(item);

                        if (embedding && embedding.length > 0) {
                            item.embedding = embedding;
                            await saveIndexedItem(item);
                            item.embedding = undefined; // release the array now that it's persisted
                            this.processed++;
                            this.withEmbeddings++;
                            this.recordCompletion();

                            // Log progress every 10 items
                            if (this.processed % 10 === 0) {
                                const progress = this.getProgress();
                                logger.info('runLoop',
                                    `Progress: ${this.withEmbeddings}/${this.total} ` +
                                    `(${Math.round(this.withEmbeddings / this.total * 100)}%) ` +
                                    `| Speed: ${progress.speed} items/min ` +
                                    `| ETA: ${progress.estimatedMinutes} min`
                                );
                            }

                            // Minimal delay between successful items — let Ollama breathe
                            await this.sleep(50);
                        } else {
                            // Embedding failed (semaphore busy, model issue, etc.) — skip this item, move to next
                            logger.debug('runLoop', `Skipping "${item.title?.substring(0, 40)}..." (embedding failed), moving to next`);
                            await this.sleep(200);
                        }
                    } catch (error) {
                        const errMsg = error instanceof Error ? error.message : String(error);
                        logger.warn('runLoop', `Error embedding item: ${errMsg}`);
                        this.lastError = errMsg;

                        // Network/CORS errors are fatal — stop the processor
                        if (errMsg.includes('CORS') || errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
                            logger.info('runLoop', 'Network/CORS error detected, stopping processor');
                            this.state = 'error';
                            this.lastError = errMsg;
                            break;
                        }

                        await this.sleep(500);
                    }
                }
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error('runLoop', 'Fatal error in processing loop:', errMsg);
            this.state = 'error';
            this.lastError = errMsg;
        } finally {
            this.loopRunning = false;
            logger.info('runLoop', `Processing loop exited (state: ${this.state}, processed: ${this.processed})`);
        }
    }
}

// Singleton instance
export const embeddingProcessor = new EmbeddingProcessorImpl();
