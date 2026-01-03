/**
 * Batch Promo Orchestrator
 * 
 * Processes multiple website promo jobs in parallel with rate limiting.
 * Provides progress tracking and partial failure handling.
 */

import { WebsitePromoOrchestrator, PromoJob } from './WebsitePromoOrchestrator';
import { WebsitePromoInput } from '../domain/entities/WebsitePromo';

export interface BatchPromoInput {
    /** List of websites to process */
    websites: WebsitePromoInput[];
    /** Maximum concurrent jobs (default: 2) */
    parallelism?: number;
    /** Callback for progress updates */
    onProgress?: (completed: number, total: number, current: BatchJobResult) => void;
}

export interface BatchJobResult {
    jobId: string;
    websiteUrl: string;
    status: 'completed' | 'failed';
    videoUrl?: string;
    error?: string;
    durationMs: number;
}

export interface BatchPromoResult {
    batchId: string;
    startedAt: Date;
    completedAt: Date;
    totalJobs: number;
    successCount: number;
    failureCount: number;
    results: BatchJobResult[];
}

/**
 * Simple semaphore for limiting concurrent operations.
 */
class Semaphore {
    private permits: number;
    private waiting: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<void> {
        if (this.permits > 0) {
            this.permits--;
            return;
        }
        return new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }

    release(): void {
        const next = this.waiting.shift();
        if (next) {
            next();
        } else {
            this.permits++;
        }
    }
}

export class BatchPromoOrchestrator {
    constructor(private readonly singleOrchestrator: WebsitePromoOrchestrator) { }

    /**
     * Process multiple websites in parallel with configurable concurrency.
     */
    async processBatch(input: BatchPromoInput): Promise<BatchPromoResult> {
        const batchId = `batch_${Date.now()}`;
        const startedAt = new Date();
        const parallelism = input.parallelism || 2;
        const semaphore = new Semaphore(parallelism);

        console.log(`[BatchPromo] Starting batch ${batchId} with ${input.websites.length} jobs (parallelism: ${parallelism})`);

        const results: BatchJobResult[] = [];
        let completed = 0;

        const processOne = async (websiteInput: WebsitePromoInput, index: number): Promise<BatchJobResult> => {
            await semaphore.acquire();
            const jobId = `${batchId}_${index}`;
            const jobStart = Date.now();

            try {
                console.log(`[BatchPromo] Processing job ${index + 1}/${input.websites.length}: ${websiteInput.websiteUrl}`);
                const job = await this.singleOrchestrator.processJob(jobId, websiteInput);

                const result: BatchJobResult = {
                    jobId,
                    websiteUrl: websiteInput.websiteUrl,
                    status: job.status === 'completed' ? 'completed' : 'failed',
                    videoUrl: job.result?.videoUrl,
                    error: job.error,
                    durationMs: Date.now() - jobStart
                };

                completed++;
                if (input.onProgress) {
                    input.onProgress(completed, input.websites.length, result);
                }

                return result;
            } catch (error: any) {
                const result: BatchJobResult = {
                    jobId,
                    websiteUrl: websiteInput.websiteUrl,
                    status: 'failed',
                    error: error.message,
                    durationMs: Date.now() - jobStart
                };

                completed++;
                if (input.onProgress) {
                    input.onProgress(completed, input.websites.length, result);
                }

                return result;
            } finally {
                semaphore.release();
            }
        };

        // Process all jobs in parallel (limited by semaphore)
        const promises = input.websites.map((website, index) => processOne(website, index));
        const allResults = await Promise.all(promises);
        results.push(...allResults);

        const completedAt = new Date();
        const successCount = results.filter(r => r.status === 'completed').length;
        const failureCount = results.filter(r => r.status === 'failed').length;

        console.log(`[BatchPromo] Batch ${batchId} complete: ${successCount} succeeded, ${failureCount} failed`);

        return {
            batchId,
            startedAt,
            completedAt,
            totalJobs: input.websites.length,
            successCount,
            failureCount,
            results
        };
    }
}
