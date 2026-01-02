import { Queue, ConnectionOptions } from 'bullmq';
import { IJobQueuePort } from '../ports/IJobQueuePort';
import { WebsitePromoInput } from '../domain/entities/WebsitePromo';

/**
 * BullMQ Job Queue Adapter
 * 
 * Production adapter for background processing using BullMQ and Redis.
 */
export class BullMqJobQueueAdapter implements IJobQueuePort {
    private readonly queue: Queue;
    private static readonly QUEUE_NAME = 'website_promo_queue';

    constructor(redisUrl: string) {
        const connection: ConnectionOptions = {
            url: redisUrl,
            // Proactive cleanup: ensure connection survives network blips
            maxRetriesPerRequest: null, // Critical for BullMQ
            enableReadyCheck: false
        };

        this.queue = new Queue(BullMqJobQueueAdapter.QUEUE_NAME, {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000, // 5s initial delay
                },
                removeOnComplete: true, // Keep it clean
                removeOnFail: false    // Keep failed jobs for debugging
            }
        });

        console.log(`[BullMQ] Initialized queue: ${BullMqJobQueueAdapter.QUEUE_NAME}`);
    }

    async enqueue(jobId: string, input: WebsitePromoInput): Promise<void> {
        await this.queue.add(
            'process_promo',
            { jobId, input },
            { jobId } // Use our jobId as the BullMQ jobId to prevent duplicates
        );
        console.log(`[BullMQ] Enqueued job: ${jobId}`);
    }

    async close(): Promise<void> {
        await this.queue.close();
    }
}
