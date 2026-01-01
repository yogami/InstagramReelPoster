/**
 * Website Promo Orchestrator
 * 
 * Entry point for the Website Promo slice.
 * Handles job lifecycle, error handling, and status updates.
 */

import { WebsitePromoInput, isWebsitePromoInput } from '../domain/entities/WebsitePromo';
import { WebsitePromoUseCase, WebsitePromoResult, WebsitePromoUseCaseDeps } from './WebsitePromoUseCase';

export interface PromoJob {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    input: WebsitePromoInput;
    result?: WebsitePromoResult;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface WebsitePromoOrchestratorDeps extends WebsitePromoUseCaseDeps {
    onStatusChange?: (job: PromoJob) => Promise<void>;
    onComplete?: (job: PromoJob) => Promise<void>;
    onError?: (job: PromoJob, error: Error) => Promise<void>;
}

export class WebsitePromoOrchestrator {
    private readonly useCase: WebsitePromoUseCase;
    private readonly deps: WebsitePromoOrchestratorDeps;

    constructor(deps: WebsitePromoOrchestratorDeps) {
        this.deps = deps;
        this.useCase = new WebsitePromoUseCase(deps);
    }

    /**
     * Processes a promo job from input to final video.
     */
    async processJob(jobId: string, input: WebsitePromoInput): Promise<PromoJob> {
        const job: PromoJob = {
            id: jobId,
            status: 'pending',
            input,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Validate input
        if (!isWebsitePromoInput(input)) {
            job.status = 'failed';
            job.error = 'Invalid input: websiteUrl and consent are required';
            return job;
        }

        if (!input.consent) {
            job.status = 'failed';
            job.error = 'User consent is required to scrape the website';
            return job;
        }

        try {
            // Update status
            job.status = 'processing';
            job.updatedAt = new Date();
            await this.deps.onStatusChange?.(job);

            // Execute use case
            const result = await this.useCase.execute(input);

            // Complete
            job.status = 'completed';
            job.result = result;
            job.updatedAt = new Date();
            await this.deps.onComplete?.(job);

            return job;
        } catch (error) {
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : 'Unknown error';
            job.updatedAt = new Date();
            await this.deps.onError?.(job, error instanceof Error ? error : new Error(String(error)));
            return job;
        }
    }

    /**
     * Creates a job from raw input (e.g., from API).
     */
    createJob(jobId: string, rawInput: unknown): PromoJob | null {
        if (!isWebsitePromoInput(rawInput)) {
            return null;
        }
        return {
            id: jobId,
            status: 'pending',
            input: rawInput,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }
}
