import { Router, Request, Response } from 'express';
import { ReelJobInput } from '../../domain/entities/ReelJob';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
import { IGrowthInsightsService } from '../../domain/ports/IGrowthInsightsService';
import { asyncHandler, BadRequestError } from '../middleware/errorHandler';
import { getConfig } from '../../config';

/**
 * Creates reel routes with dependency injection.
 */
export function createReelRoutes(
    jobManager: JobManager,
    orchestrator: ReelOrchestrator,
    growthInsightsService: IGrowthInsightsService
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
            const { sourceAudioUrl, targetDurationRange, moodOverrides, forceMode } = req.body;

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

            // Validate forceMode if provided
            if (forceMode && !['direct', 'parable', 'website-promo'].includes(forceMode)) {
                throw new BadRequestError('forceMode must be "direct", "parable", or "website-promo"');
            }

            // Create job
            const input: ReelJobInput = {
                sourceAudioUrl,
                targetDurationRange,
                moodOverrides,
                callbackUrl: req.body.callbackUrl || config.makeWebhookUrl,
                forceMode,
            };
            const job = await jobManager.createJob(input);

            // Log content mode configuration
            if (forceMode) {
                console.log(`[${job.id}] Content mode forced to: ${forceMode}`);
            }

            // Start processing in background (don't await)
            orchestrator.processJob(job.id).catch((error) => {
                console.error(`Job ${job.id} failed:`, error);
            });

            // Return immediately
            res.status(202).json({
                jobId: job.id,
                status: job.status,
                message: 'Reel processing started',
                contentMode: forceMode || 'auto-detect',
            });
        })
    );

    /**
     * POST /website
     * 
     * Starts a new website promo reel generation job.
     * Scrapes the business website and generates a category-aware promotional reel.
     */
    router.post(
        '/website',
        asyncHandler(async (req: Request, res: Response) => {
            const { website, businessName, category, consent, callbackUrl, language, media } = req.body;

            // Validate website URL
            if (!website || typeof website !== 'string') {
                throw new BadRequestError('website URL is required');
            }

            // Validate URL format
            try {
                new URL(website);
            } catch {
                throw new BadRequestError('website must be a valid URL');
            }

            // CRITICAL: Validate consent for legal compliance
            if (consent !== true) {
                throw new BadRequestError('consent must be true to scrape website (legal requirement for GDPR compliance)');
            }

            // Validate category if provided
            const validCategories = ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio'];
            if (category && !validCategories.includes(category)) {
                throw new BadRequestError(`category must be one of: ${validCategories.join(', ')}`);
            }

            // Validate media if provided (must be array of strings)
            let providedMedia: string[] | undefined;
            if (media && Array.isArray(media)) {
                providedMedia = media.filter((m: unknown) => typeof m === 'string').slice(0, 5);
                console.log(`[website] Received ${providedMedia.length} user-provided media files`);
            }

            // Create job with website promo input
            const input: ReelJobInput = {
                websitePromoInput: {
                    websiteUrl: website,
                    businessName,
                    category,
                    consent: true,
                    language,
                    providedMedia,
                },
                callbackUrl: callbackUrl || config.makeWebhookUrl,
                forceMode: 'website-promo',
            };
            const job = await jobManager.createJob(input);

            console.log(`[${job.id}] Website promo reel started for: ${website}`);

            // Start processing in background (don't await)
            orchestrator.processJob(job.id).catch((error) => {
                console.error(`Job ${job.id} failed:`, error);
            });

            // Return immediately
            res.status(202).json({
                jobId: job.id,
                status: job.status,
                message: 'Website promo reel generation started',
                website,
                category: category || 'auto-detect',
            });
        })
    );

    /**
     * POST /retry-last
     * 
     * Retries the last job for a specific user (Telegram Chat ID).
     */
    router.post(
        '/retry-last',
        asyncHandler(async (req: Request, res: Response) => {
            const { telegramChatId } = req.body;

            if (!telegramChatId) {
                throw new BadRequestError('telegramChatId is required');
            }

            const chatId = Number(telegramChatId);
            if (isNaN(chatId)) {
                throw new BadRequestError('telegramChatId must be a number');
            }

            const lastJob = await jobManager.getLastJobForUser(chatId);
            if (!lastJob) {
                throw new BadRequestError('No previous job found for this user to retry');
            }

            console.log(`[Retry] Retrying job for user ${chatId}. Previous Job: ${lastJob.id}`);

            // Create new job with same inputs
            const input: ReelJobInput = {
                sourceAudioUrl: lastJob.sourceAudioUrl,
                targetDurationRange: lastJob.targetDurationRange,
                moodOverrides: lastJob.moodOverrides,
                callbackUrl: lastJob.callbackUrl || config.makeWebhookUrl,
                telegramChatId: chatId
            };

            const job = await jobManager.createJob(input);

            // Start processing in background
            orchestrator.processJob(job.id).catch((error) => {
                console.error(`Retry Job ${job.id} failed:`, error);
            });

            res.status(202).json({
                jobId: job.id,
                status: job.status,
                message: 'Retry processing started',
                originalJobId: lastJob.id
            });
        })
    );

    /**
     * POST /reels/:id/analytics
     * 
     * Ingests performance metrics for a specific reel.
     */
    router.post(
        '/reels/:id/analytics',
        asyncHandler(async (req: Request, res: Response) => {
            const { id } = req.params;
            const analytics = req.body;

            if (!analytics) {
                throw new BadRequestError('Analytics data is required');
            }

            await growthInsightsService.recordAnalytics({
                ...analytics,
                reelId: id,
            });

            res.status(200).json({
                message: 'Analytics recorded successfully',
                reelId: id
            });
        })
    );

    /**
     * GET /jobs/:id/salvage?videoUrl=url1,url2
     * 
     * Manually triggers a salvage operation for a job using provided video URLs.
     * Useful when Kie.ai dashboard shows completed videos but polling failed.
     */
    router.get(
        '/jobs/:id/salvage',
        asyncHandler(async (req: Request, res: Response) => {
            const { id } = req.params;
            const videoUrlRaw = req.query.videoUrl as string;

            if (!videoUrlRaw) {
                throw new BadRequestError('videoUrl query parameter is required (comma-separated for multi-clip)');
            }

            const videoUrls = videoUrlRaw.includes(',') ? videoUrlRaw.split(',') : [videoUrlRaw];

            console.log(`[Salvage] Manually salvaging job ${id} with ${videoUrls.length} urls via API`);

            const job = await jobManager.getJob(id);
            if (!job) {
                throw new BadRequestError(`Job ${id} not found`);
            }

            // Update job status and URLs
            const updates: any = {
                status: 'generating_subtitles'
            };

            if (videoUrls.length > 1) {
                updates.animatedVideoUrls = videoUrls;
                updates.animatedVideoUrl = videoUrls[0];
            } else {
                updates.animatedVideoUrl = videoUrls[0];
            }

            await jobManager.updateJob(id, updates);

            // Trigger orchestrator (async)
            orchestrator.processJob(id).catch(err => {
                console.error(`[Salvage] Salvage of job ${id} failed in background:`, err);
            });

            res.status(202).json({
                message: 'Salvage operation started successfully',
                jobId: id,
                videoUrls
            });
        })
    );

    return router;
}
