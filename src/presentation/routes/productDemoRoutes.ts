import { Router, Request, Response } from 'express';
import { ProductDemoOrchestrator } from '../../lib/product-demo/application/ProductDemoOrchestrator';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/errorHandler';

/**
 * Creates routes for the Product Demo slice.
 */
export function createProductDemoRoutes(orchestrator: ProductDemoOrchestrator): Router {
    const router = Router();

    /**
     * POST /
     * 
     * Starts a new product demo video generation job.
     */
    router.post(
        '/',
        asyncHandler(async (req: Request, res: Response) => {
            const { productUrl, githubUrl, audienceType, consent, name, email } = req.body;

            if (!productUrl || typeof productUrl !== 'string') {
                throw new BadRequestError('productUrl is required');
            }

            if (consent !== true) {
                throw new BadRequestError('consent must be true');
            }

            const jobId = `demo_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            // Start processing in background
            orchestrator.processJob(jobId, {
                productUrl,
                githubUrl,
                audienceType: audienceType || 'investor',
                consent: true,
                metadata: { name, email }
            }).catch((err: unknown) => {
                console.error(`[ProductDemo] Job ${jobId} failed:`, err);
            });

            res.status(202).json({
                jobId,
                status: 'pending',
                message: 'Product demo generation started'
            });
        })
    );

    /**
     * GET /eligibility
     * 
     * Performs a quick eligibility check for a URL.
     */
    router.get(
        '/eligibility',
        asyncHandler(async (req: Request, res: Response) => {
            const { url } = req.query;

            if (!url || typeof url !== 'string') {
                throw new BadRequestError('url query parameter is required');
            }

            const result = await orchestrator.checkEligibility(url);

            res.status(200).json(result);
        })
    );

    /**
     * GET /status/:jobId
     * 
     * Returns the current status and results (if complete) of a job.
     */
    router.get(
        '/status/:jobId',
        asyncHandler(async (req: Request, res: Response) => {
            const { jobId } = req.params;

            const job = await orchestrator.getJobStatus(jobId);

            if (!job) {
                throw new NotFoundError(`Job ${jobId} not found`);
            }

            res.status(200).json(job);
        })
    );

    return router;
}
