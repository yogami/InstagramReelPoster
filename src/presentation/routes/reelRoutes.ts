import { Router, Request, Response } from 'express';
import { ReelJobInput } from '../../domain/entities/ReelJob';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
import { asyncHandler, BadRequestError } from '../middleware/errorHandler';
import { getConfig } from '../../config';

/**
 * Creates reel routes with dependency injection.
 */
export function createReelRoutes(
    jobManager: JobManager,
    orchestrator: ReelOrchestrator
): Router {
    const config = getConfig();
    const router = Router();

    /**
     * POST /process-reel
     * 
     * Starts a new reel generation job.
     * Returns immediately with job ID for async polling.
     */
    router.post(
        '/process-reel',
        asyncHandler(async (req: Request, res: Response) => {
            const { sourceAudioUrl, targetDurationRange, moodOverrides } = req.body;

            // Validate input
            if (!sourceAudioUrl || typeof sourceAudioUrl !== 'string') {
                throw new BadRequestError('sourceAudioUrl is required and must be a string');
            }

            // Validate URL format
            try {
                new URL(sourceAudioUrl);
            } catch {
                throw new BadRequestError('sourceAudioUrl must be a valid URL');
            }

            // Validate duration range if provided
            if (targetDurationRange) {
                if (typeof targetDurationRange.min !== 'number' || typeof targetDurationRange.max !== 'number') {
                    throw new BadRequestError('targetDurationRange must have min and max as numbers');
                }
                if (targetDurationRange.min > targetDurationRange.max) {
                    throw new BadRequestError('targetDurationRange.min cannot be greater than max');
                }
            }

            // Create job
            const input: ReelJobInput = {
                sourceAudioUrl,
                targetDurationRange,
                moodOverrides,
                callbackUrl: req.body.callbackUrl || config.makeWebhookUrl,
            };
            const job = await jobManager.createJob(input);

            // Start processing in background (don't await)
            orchestrator.processJob(job.id).catch((error) => {
                console.error(`Job ${job.id} failed:`, error);
            });

            // Return immediately
            res.status(202).json({
                jobId: job.id,
                status: job.status,
                message: 'Reel processing started',
            });
        })
    );

    return router;
}
