import { WebsitePromoInput } from '../domain/entities/WebsitePromo';

/**
 * Job Queue Port
 * 
 * Defines the contract for background job queuing systems.
 * Allows decoupling the application logic from specific queue providers like BullMQ.
 */
export interface IJobQueuePort {
    /**
     * Enqueue a new website promo job for processing.
     * @param jobId - Unique job identifier
     * @param input - The website promo configuration
     */
    enqueue(jobId: string, input: WebsitePromoInput): Promise<void>;

    /**
     * Clean up or close connection if necessary.
     */
    close(): Promise<void>;
}
