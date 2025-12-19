import { Router, Request, Response } from 'express';
import { JobManager } from '../../application/JobManager';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler';
import { isJobTerminal } from '../../domain/entities/ReelJob';
import axios from 'axios';

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
            const job = await jobManager.getJob(jobId);

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
            const jobs = await jobManager.getAllJobs();

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

    /**
     * POST /test-webhook
     * 
     * Sends a test callback to Make.com with sample data.
     * Use this to verify the webhook structure in Make.com.
     */
    router.post(
        '/test-webhook',
        asyncHandler(async (req: Request, res: Response) => {
            const { webhookUrl } = req.body;

            if (!webhookUrl) {
                res.status(400).json({
                    error: 'Missing webhookUrl in request body'
                });
                return;
            }

            // Sample payload matching our callback structure
            const samplePayload = {
                jobId: 'test_job_123',
                status: 'completed',
                video_url: 'https://example.com/sample-video.mp4',
                caption: 'This is a test reel caption for Make.com webhook validation...',
                metadata: {
                    duration: 30,
                    createdAt: new Date().toISOString(),
                    completedAt: new Date().toISOString()
                }
            };

            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'x-make-apikey': '4LyPD8E3TVRmh_F'
                };

                console.log('Sending test webhook to:', webhookUrl);
                console.log('Payload:', JSON.stringify(samplePayload, null, 2));

                const response = await axios.post(webhookUrl, samplePayload, { headers });

                res.json({
                    success: true,
                    message: 'Test webhook sent successfully',
                    payload: samplePayload,
                    makeResponse: {
                        status: response.status,
                        data: response.data
                    }
                });
            } catch (error: any) {
                console.error('Test webhook failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    payload: samplePayload
                });
            }
        })
    );

    return router;
}
