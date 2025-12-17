import { Router, Request, Response } from 'express';
import { JobManager } from '../../application/JobManager';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler';
import { isJobTerminal } from '../../domain/entities/ReelJob';

/**
 * Creates job status routes with dependency injection.
 */
export function createJobRoutes(jobManager: JobManager): Router {
    const router = Router();

    /**
     * GET /jobs/:jobId
     * 
     * Returns the current status and results of a job.
     */
    router.get(
        '/jobs/:jobId',
        asyncHandler(async (req: Request, res: Response) => {
            const { jobId } = req.params;
            const job = jobManager.getJob(jobId);

            if (!job) {
                throw new NotFoundError(`Job not found: ${jobId}`);
            }

            // Build response based on job status
            const response: Record<string, unknown> = {
                jobId: job.id,
                status: job.status,
                createdAt: job.createdAt.toISOString(),
                updatedAt: job.updatedAt.toISOString(),
            };

            // Add current step for in-progress jobs
            if (job.currentStep) {
                response.step = job.currentStep;
            }

            // Add error for failed jobs
            if (job.status === 'failed' && job.error) {
                response.error = job.error;
            }

            // Add full results for completed jobs
            if (job.status === 'completed') {
                response.finalVideoUrl = job.finalVideoUrl;
                response.reelDurationSeconds = job.voiceoverDurationSeconds;
                response.voiceoverUrl = job.voiceoverUrl;
                response.musicUrl = job.musicUrl;
                response.subtitlesUrl = job.subtitlesUrl;
                response.manifest = job.manifest;
                response.metadata = {
                    musicSource: job.musicSource,
                    segmentCount: job.segments?.length,
                    targetDurationSeconds: job.targetDurationSeconds,
                };
            }

            res.json(response);
        })
    );

    /**
     * GET /jobs
     * 
     * Lists all jobs (for debugging/monitoring).
     */
    router.get(
        '/jobs',
        asyncHandler(async (req: Request, res: Response) => {
            const jobs = jobManager.getAllJobs();

            const summaries = jobs.map((job) => ({
                jobId: job.id,
                status: job.status,
                currentStep: job.currentStep,
                createdAt: job.createdAt.toISOString(),
                updatedAt: job.updatedAt.toISOString(),
                hasVideo: !!job.finalVideoUrl,
            }));

            res.json({
                total: summaries.length,
                jobs: summaries,
            });
        })
    );

    return router;
}
