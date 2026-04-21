// embedding-processor.ts — Background embedding generation with pause/resume and search priority

import { Logger, errorMeta } from '../core/logger';
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

// Availability-gated backoff: when Ollama/model is unavailable, the loop
// pauses for this many ms and then doubles up to the cap on each repeat.
// Initial value matches `OllamaService.CHECK_INTERVAL` so we never probe the
// network faster than the availability cache allows.
const INITIAL_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 2 * 60_000;

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

    // Availability backoff state. `currentBackoffMs` grows from INITIAL_BACKOFF_MS
    // up to MAX_BACKOFF_MS while Ollama is unreachable, then resets on recovery.
    // `lastAvailabilityKey` encodes the previous availability outcome so we only
    // emit INFO logs on transitions (available <-> unavailable) and downgrade
    // repeats to DEBUG/TRACE.
    private currentBackoffMs = INITIAL_BACKOFF_MS;
    private lastAvailabilityKey: string | null = null;

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
        this.currentBackoffMs = INITIAL_BACKOFF_MS;
        this.lastAvailabilityKey = null;

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
        // `currentBackoffMs` and `lastAvailabilityKey` are intentionally NOT
        // reset here — `start()` reinitialises them on the next run, and
        // clobbering them mid-loop (e.g. from within an availability-check
        // mock in tests) would erase the transition state that INFO/DEBUG
        // logging depends on.
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
            logger.warn('refreshCounts', 'Failed to count items:', errorMeta(error));
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
     * Checks Ollama/model availability and, when unavailable, sleeps for the
     * current backoff window then asks the caller to `continue` the outer loop.
     *
     * Returns `true` when the caller should `continue` (we slept / are waiting);
     * `false` when the system is available and the loop should proceed.
     *
     * Log-level discipline:
     * - INFO once on transition to unavailable ("Pausing — …") and once on
     *   transition back to available ("Resuming — …").
     * - DEBUG for repeat backoff extensions during sustained outages.
     * - TRACE is reserved for `OllamaService`'s own "status unchanged" repeats.
     */
    private async handleAvailabilityGate(
        getOllamaService: typeof import('./ollama-service').getOllamaService,
        getOllamaConfigFromSettings: typeof import('./ollama-service').getOllamaConfigFromSettings,
    ): Promise<boolean> {
        let availability: { available: boolean; model: string | null; error?: string };
        try {
            const embConfig = await getOllamaConfigFromSettings(true);
            const svc = getOllamaService(embConfig);
            availability = await svc.checkAvailability();
        } catch (error) {
            // Defensive: treat any availability-check failure as unavailable so
            // we back off rather than spin. Don't promote this to WARN — the
            // underlying OllamaService already surfaces fetch errors at the
            // appropriate level.
            const errMsg = error instanceof Error ? error.message : String(error);
            availability = { available: false, model: null, error: errMsg };
        }

        const availabilityKey = availability.available
            ? `ok:${availability.model || 'unknown'}`
            : `err:${availability.error || 'unknown'}`;

        if (!availability.available) {
            const sleepMs = this.currentBackoffMs;
            const sleepSeconds = Math.round(sleepMs / 1000);
            const reason = availability.error || 'unknown';
            const transitioningIntoOutage =
                this.lastAvailabilityKey === null || this.lastAvailabilityKey.startsWith('ok:');

            if (transitioningIntoOutage) {
                logger.info('runLoop',
                    `Pausing — Ollama/model unavailable: ${reason}. Will retry in ${sleepSeconds}s`);
            } else {
                logger.debug('runLoop',
                    `Still unavailable (${reason}), next retry in ${sleepSeconds}s`);
            }

            this.lastAvailabilityKey = availabilityKey;
            await this.sleep(sleepMs);
            this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, MAX_BACKOFF_MS);
            return true;
        }

        // Available path — log a single INFO on the unavailable→available
        // transition and reset the backoff so the next outage starts fresh.
        if (this.lastAvailabilityKey && this.lastAvailabilityKey.startsWith('err:')) {
            logger.info('runLoop',
                `Resuming — Ollama available with model '${availability.model || 'unknown'}'`);
            this.currentBackoffMs = INITIAL_BACKOFF_MS;
        }
        this.lastAvailabilityKey = availabilityKey;
        return false;
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
            const {
                isCircuitBreakerOpen,
                checkMemoryPressure,
                getOllamaService,
                getOllamaConfigFromSettings,
            } = await import('./ollama-service');

            while (this.state === 'running') {
                // --- Guard: Circuit breaker tripped → wait ---
                if (isCircuitBreakerOpen()) {
                    logger.debug('runLoop', 'Circuit breaker open, waiting 60s...');
                    await this.sleep(60_000);
                    continue;
                }

                // --- Guard: Memory pressure → wait or stop ---
                const mem = checkMemoryPressure();
                if (!mem.ok) {
                    if (mem.permanent) {
                        logger.info('runLoop',
                            `Session embedding cap reached — processed ${this.processed} items this session. ` +
                            'Remaining items will be processed next session.');
                        this.state = 'completed';
                        break;
                    }
                    logger.debug('runLoop', `Memory pressure (${mem.usedMB}MB), waiting 30s...`);
                    await this.sleep(30_000);
                    continue;
                }

                // --- Guard: Ollama/model availability → back off exponentially ---
                // The OllamaService cache (30s) keeps this essentially free on
                // repeat hits. When unavailable we sleep and continue without
                // touching the DB or generating embeddings — stops the
                // laptop-fan scenario where the loop spun forever on failed
                // items while Ollama was down or the model was missing.
                const shouldContinueLoop = await this.handleAvailabilityGate(
                    getOllamaService,
                    getOllamaConfigFromSettings,
                );
                if (shouldContinueLoop) {continue;}

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
