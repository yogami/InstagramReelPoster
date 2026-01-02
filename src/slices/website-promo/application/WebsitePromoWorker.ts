import { Worker, Job, ConnectionOptions } from 'bullmq';
import { WebsitePromoOrchestrator, PromoJob } from './WebsitePromoOrchestrator';
import { WebsitePromoInput } from '../domain/entities/WebsitePromo';

/**
 * Website Promo Worker
 * 
 * Background worker that consumes jobs from the BullMQ queue.
 * Integrates with the Orchestrator to execute the full promo generation logic.
 */
export class WebsitePromoWorker {
    private worker: Worker;
    private static readonly QUEUE_NAME = 'website_promo_queue';

    constructor(
        private readonly orchestrator: WebsitePromoOrchestrator,
        redisUrl: string,
        concurrency: number = 2 // Default to 2 for safe multi-tasking
    ) {
        const connection: ConnectionOptions = {
            url: redisUrl,
            maxRetriesPerRequest: null, // Required by BullMQ
        };

        this.worker = new Worker(
            WebsitePromoWorker.QUEUE_NAME,
            async (job: Job<{ jobId: string; input: WebsitePromoInput }>) => {
                const { jobId, input } = job.data;
                console.log(`[Worker] Starting job: ${jobId}`);

                // Construct a synthetic PromoJob to pass to the orchestrator
                // Since the orchestrator already knows the input, this is mainly for state tracking
                const promoJob: PromoJob = {
                    id: jobId,
                    status: 'processing',
                    input,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                try {
                    await this.orchestrator.executeQueuedJob(promoJob);
                    console.log(`[Worker] Successfully completed job: ${jobId}`);
                } catch (error: any) {
                    console.error(`[Worker] Job ${jobId} failed:`, error.message);
                    throw error; // Re-throw to trigger BullMQ's automatic retry
                }
            },
            {
                connection,
                concurrency,
                lockDuration: 600000 // 10 minutes - jobs can be long
            }
        );

        this.setupListeners();
    }

    private setupListeners() {
        this.worker.on('completed', (job) => {
            console.log(`[Worker] Job ${job.id} marked as completed in queue`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`[Worker] Job ${job?.id} failed permanent:`, err.message);
        });

        this.worker.on('error', (err) => {
            console.error('[Worker] Fatal error in BullMQ worker:', err);
        });
    }

    /**
     * Gracefully shutdown the worker.
     */
    async close() {
        await this.worker.close();
    }
}
