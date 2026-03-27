/**
 * Product Demo Orchestrator
 * 
 * Entry point for the Product Demo slice.
 * Handles job lifecycle, error handling, and status updates.
 */

import { ProductDemoInput, isProductDemoInput, ProductDemoResult } from '../domain/entities/ProductDemo';
import { ProductDemoUseCase, ProductDemoUseCaseDeps } from './ProductDemoUseCase';

// ============================================================================
// Job Types
// ============================================================================

export interface DemoJob {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    input: ProductDemoInput;
    result?: ProductDemoResult | { error?: string; eligible: false; reason?: string };
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================================
// Orchestrator Dependencies
// ============================================================================

export interface ProductDemoOrchestratorDeps extends ProductDemoUseCaseDeps {
    onStatusChange?: (job: DemoJob) => Promise<void>;
    onComplete?: (job: DemoJob) => Promise<void>;
    onError?: (job: DemoJob, error: Error) => Promise<void>;
}

// ============================================================================
// Orchestrator
// ============================================================================

export class ProductDemoOrchestrator {
    private readonly useCase: ProductDemoUseCase;
    private readonly deps: ProductDemoOrchestratorDeps;
    private readonly jobs = new Map<string, DemoJob>();

    constructor(deps: ProductDemoOrchestratorDeps) {
        this.deps = deps;
        this.useCase = new ProductDemoUseCase(deps);
    }

    /**
     * Processes a demo job from input to final video or rejection.
     */
    async processJob(jobId: string, input: ProductDemoInput): Promise<DemoJob> {
        let job: DemoJob = {
            id: jobId,
            status: 'pending',
            input,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.jobs.set(jobId, job);

        // Validate input
        if (!isProductDemoInput(input)) {
            job.status = 'failed';
            job.error = 'Invalid input: productUrl, audienceType, and consent are required';
            return job;
        }

        if (!input.consent) {
            job.status = 'failed';
            job.error = 'User consent is required to scrape the product URL';
            return job;
        }

        try {
            // Update status to processing
            job.status = 'processing';
            job.updatedAt = new Date();
            await this.deps.onStatusChange?.(job);

            // Execute use case
            const result = await this.useCase.execute(input);

            // Check if eligible
            if ('eligible' in result && result.eligible === false) {
                // Not eligible - this is not a failure, but a valid rejection
                job.status = 'completed';
                job.result = result;
                job.updatedAt = new Date();
                await this.deps.onComplete?.(job);
                return job;
            }

            // Success
            job.status = 'completed';
            job.result = result as ProductDemoResult;
            job.updatedAt = new Date();
            await this.deps.onComplete?.(job);

            return job;

        } catch (error) {
            return await this.handleError(job, error);
        }
    }

    /**
     * Quick eligibility check without generating video.
     */
    async checkEligibility(url: string): Promise<{ eligible: boolean; reason: string }> {
        try {
            const result = await this.deps.eligibilityPort.checkEligibility(url);
            return {
                eligible: result.isEligible,
                reason: result.reason
            };
        } catch (error) {
            return {
                eligible: false,
                reason: `Failed to check eligibility: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Creates a job from raw input (e.g., from API).
     */
    createJob(jobId: string, rawInput: unknown): DemoJob | null {
        if (!isProductDemoInput(rawInput)) {
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

    /**
     * Retrieves the current status and results of a job.
     */
    async getJobStatus(jobId: string): Promise<DemoJob | undefined> {
        return this.jobs.get(jobId);
    }

    private async handleError(job: DemoJob, error: unknown): Promise<DemoJob> {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.updatedAt = new Date();
        await this.deps.onError?.(job, error instanceof Error ? error : new Error(String(error)));
        return job;
    }
}
