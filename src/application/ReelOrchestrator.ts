import axios from 'axios';
import {
    ReelJob,
    ReelJobStatus,
    updateJobStatus,
    completeJob,
    failJob,
} from '../domain/entities/ReelJob';
import { Segment, createSegment } from '../domain/entities/Segment';
import { ReelManifest, createReelManifest } from '../domain/entities/ReelManifest';
import {
    estimateSpeakingDuration,
    needsTextAdjustment,
    calculateSpeedAdjustment,
    calculateSegmentTimings,
} from '../domain/services/DurationCalculator';
import {
    ContentMode,
    ParableIntent,
    ParableScriptPlan,
    ParableBeat,
} from '../domain/entities/Parable';
import {
    BusinessCategory,
    WebsiteAnalysis,
    PromoScriptPlan,
    PromoSceneContent,
    WebsitePromoInput,
    ScrapedMedia,
} from '../domain/entities/WebsitePromo';
import { IWebsiteScraperClient } from '../domain/ports/IWebsiteScraperClient';
import { getPromptTemplate, getMusicStyle, detectCategoryFromKeywords, getViralHookName } from '../infrastructure/llm/CategoryPrompts';
import { SemanticAnalyzer } from '../infrastructure/analysis/SemanticAnalyzer';

import { ITranscriptionClient } from '../domain/ports/ITranscriptionClient';
import {
    ILlmClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
} from '../domain/ports/ILlmClient';
import { ITtsClient } from '../domain/ports/ITtsClient';
import { IImageClient } from '../domain/ports/IImageClient';
import { ISubtitlesClient } from '../domain/ports/ISubtitlesClient';
import { IVideoRenderer } from '../domain/ports/IVideoRenderer';
import { INotificationClient } from '../domain/ports/INotificationClient';
import { IAnimatedVideoClient } from '../domain/ports/IAnimatedVideoClient';
import { IHookAndStructureService } from '../domain/ports/IHookAndStructureService';
import { ICaptionService } from '../domain/ports/ICaptionService';
import { IGrowthInsightsService } from '../domain/ports/IGrowthInsightsService';
import { MusicSelector, MusicSource } from './MusicSelector';
import { JobManager } from './JobManager';
import { ApprovalService } from './ApprovalService';
import { MediaStorageClient } from '../infrastructure/storage/MediaStorageClient';
import { TrainingDataCollector } from '../infrastructure/training/TrainingDataCollector';
import { ChatService } from '../presentation/services/ChatService';
import { getConfig } from '../config';

// Pipeline Imports
import { createJobContext, executePipeline } from './pipelines/PipelineInfrastructure';
import { createStandardPipeline, PipelineDependencies } from './pipelines/JobProcessingPipeline';
import { VoiceoverService } from './services/VoiceoverService';
import { ImageGenerationService } from './services/ImageGenerationService';
import { PromoAssetService } from './services/PromoAssetService';
import { OrchestratorErrorService } from './services/OrchestratorErrorService';

export interface OrchestratorDependencies {
    transcriptionClient: ITranscriptionClient;
    llmClient: ILlmClient;
    ttsClient: ITtsClient;
    fallbackTtsClient?: ITtsClient;
    primaryImageClient?: IImageClient; // OpenRouter (optional)
    fallbackImageClient: IImageClient; // DALL-E (required)
    animatedVideoClient?: IAnimatedVideoClient;
    subtitlesClient: ISubtitlesClient;
    videoRenderer: IVideoRenderer;
    musicSelector: MusicSelector;
    jobManager: JobManager;
    hookAndStructureService?: IHookAndStructureService;
    captionService?: ICaptionService;
    growthInsightsService?: IGrowthInsightsService;
    storageClient?: MediaStorageClient;
    websiteScraperClient?: IWebsiteScraperClient;
    callbackToken?: string;
    callbackHeader?: string;
    notificationClient?: INotificationClient;
}

/** Options for preparePromoAssets method. */
interface PreparePromoAssetsOptions {
    jobId: string;
    job: ReelJob;
    segmentContent: SegmentContent[];
    fullCommentary: string;
    targetDuration: number;
    category: BusinessCategory;
    promoScript?: PromoScriptPlan;
    voiceId?: string;
}

/**
 * ReelOrchestrator coordinates the full reel generation workflow.
 */
export class ReelOrchestrator {
    private readonly deps: OrchestratorDependencies;
    public readonly approvalService: ApprovalService;
    private readonly promoAssetService: PromoAssetService;
    private readonly errorService: OrchestratorErrorService;

    constructor(deps: OrchestratorDependencies) {
        this.deps = deps;

        // Initialize Helper Services
        this.promoAssetService = new PromoAssetService({
            jobManager: deps.jobManager,
            ttsClient: deps.ttsClient,
            fallbackTtsClient: deps.fallbackTtsClient,
            primaryImageClient: deps.primaryImageClient,
            fallbackImageClient: deps.fallbackImageClient,
            storageClient: deps.storageClient,
            musicSelector: deps.musicSelector
        });

        this.errorService = new OrchestratorErrorService(
            deps.jobManager,
            deps.notificationClient
        );

        // Initialize ApprovalService with ChatService if notification client supports it
        const config = getConfig();
        const telegramService = config.telegramBotToken
            ? new ChatService(config.telegramBotToken)
            : null;
        this.approvalService = new ApprovalService(telegramService);
    }

    private logMemoryUsage(step: string) {
        const used = process.memoryUsage().rss / 1024 / 1024;
        console.log(`[Memory] ${step}: ${Math.round(used * 100) / 100} MB`);
    }

    /**
     * Processes a reel job asynchronously.
     * Updates job status at each step.
     */
    async processJob(jobId: string): Promise<ReelJob> {
        this.logMemoryUsage('Start processJob (Pipeline)');
        const job = await this.deps.jobManager.getJob(jobId);
        if (!job) throw new Error(`Job not found: ${jobId}`);

        // Send initial notification
        if (job.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                job.telegramChatId,
                '🎬 *Starting your reel creation!*\n\nI\'ll notify you when it\'s ready. This usually takes 2-5 minutes.'
            );
        }

        try {
            // Website Promo Mode Branch
            const forceModeCheck = (job as any)?.forceMode || (job as any)?.websitePromoInput?.forceMode;
            if (forceModeCheck === 'website-promo' || job.websitePromoInput) {
                console.log(`[${jobId}] 🚀 Using WEBSITE PROMO pipeline (forceMode: ${forceModeCheck})`);
                return await this.processWebsitePromoJob(jobId, job);
            }

            // STANDARD PIPELINE
            console.log(`[${jobId}] 🚀 Initializing STANDARD pipeline execution...`);

            // 1. Construct Services
            const voiceoverService = new VoiceoverService(
                this.deps.ttsClient,
                this.deps.fallbackTtsClient,
                this.deps.storageClient
            );

            const primaryImage = this.deps.primaryImageClient || this.deps.fallbackImageClient;
            const imageGenerationService = new ImageGenerationService(
                primaryImage,
                this.deps.fallbackImageClient,
                this.deps.storageClient,
                this.deps.jobManager
            );

            // 2. Prepare Pipeline Dependencies
            const pipelineDeps: PipelineDependencies = {
                ...this.deps,
                voiceoverService,
                imageGenerationService
            };

            // 3. Create Pipeline
            const steps = createStandardPipeline(pipelineDeps);

            // 4. Create Initial Context
            const initialContext = createJobContext(jobId, job);

            // 5. Execute Pipeline
            const finalContext = await executePipeline(
                initialContext,
                steps,
                async (stepName, ctx) => {
                    this.logMemoryUsage(stepName);
                }
            );

            // 6. Post-Pipeline Finalization
            let finalVideoUrl = finalContext.finalVideoUrl;
            let finalJob = await this.deps.jobManager.getJob(jobId);
            if (!finalJob) throw new Error('Job disappeared after pipeline completion');

            // Persistence
            if (finalVideoUrl && this.deps.storageClient && !finalVideoUrl.includes('cloudinary')) {
                try {
                    await this.updateJobStatus(jobId, 'uploading', 'Uploading to permanent storage...');
                    const uploadResult = await this.deps.storageClient.uploadVideo(finalVideoUrl, {
                        folder: 'instagram-reels/final-videos',
                        publicId: `reel_${jobId}_${Date.now()}`,
                        resourceType: 'video'
                    });
                    finalVideoUrl = uploadResult.url;
                    finalJob = await this.deps.jobManager.updateJob(jobId, { finalVideoUrl, status: 'completed' });
                } catch (e) {
                    console.error('Upload failed', e);
                }
            }

            if (!finalJob) throw new Error('Job disappeared during finalization');

            // Notifications
            if (finalJob.telegramChatId && this.deps.notificationClient && finalJob.status === 'completed') {
                const processingTime = Math.round((Date.now() - finalJob.createdAt.getTime()) / 1000);
                await this.deps.notificationClient.sendNotification(
                    finalJob.telegramChatId,
                    `✅ *Your reel is ready!*\n\nProcessing took ${processingTime}s.`
                );
            }

            // Callbacks
            if (finalJob.callbackUrl && finalJob.status === 'completed') {
                await this.notifyCallback(finalJob);
            }

            // Analytics
            if (this.deps.growthInsightsService && finalJob.status === 'completed') {
                try {
                    await this.deps.growthInsightsService.recordAnalytics({
                        reelId: jobId,
                        hookUsed: finalJob.hookPlan?.chosenHook || 'None',
                        targetDurationSeconds: finalJob.targetDurationSeconds || 0,
                        actualDurationSeconds: finalJob.voiceoverDurationSeconds || 0,
                        postedAt: new Date().toISOString()
                    });
                    console.log(`[${jobId}] Post-run analytics recorded.`);
                } catch (err) {
                    console.warn(`[${jobId}] Failed to record post-run analytics:`, err);
                }
            }

            return finalJob;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await this.deps.jobManager.failJob(jobId, errorMessage);
            if (job.telegramChatId && this.deps.notificationClient) {
                // Determine friendly error
                let friendly = errorMessage;
                if (errorMessage.includes('insufficient credits')) friendly = 'Service credits exhausted. Please contact admin.';

                await this.deps.notificationClient.sendNotification(job.telegramChatId, `❌ Error: ${friendly}`);
            }
            throw error;
        }
    }

    private async notifyCallback(job: ReelJob): Promise<void> {
        if (!job.callbackUrl) return;
        if (!this.shouldSendCallback(job)) return;

        try {
            console.log(`[${job.id}] Notifying callback: ${job.callbackUrl}`);
            const payload = this.buildCallbackPayload(job);
            const headers = this.getCallbackHeaders();

            console.log(`[${job.id}] Sending callback payload:`, JSON.stringify(payload, null, 2));
            await axios.post(job.callbackUrl, payload, { headers });
            console.log(`[${job.id}] Callback notification sent successfully`);
        } catch (error) {
            console.error(`[${job.id}] Failed to notify callback:`, error);
        }
    }

    /** Determines if callback should be sent based on job state. */
    private shouldSendCallback(job: ReelJob): boolean {
        if (job.status === 'completed' && !job.finalVideoUrl) {
            console.warn(`[${job.id}] Skipping callback - job completed but no video URL available`);
            return false;
        }
        return true;
    }

    /** Builds the callback headers for Make.com. */
    private getCallbackHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'x-make-apikey': '4LyPD8E3TVRmh_F'
        };
    }

    /** Resolves the caption using fallback chain: mainCaption → segment → transcript → commentary. */
    private resolveCaption(job: ReelJob): string {
        if (job.mainCaption) return job.mainCaption;
        if (job.segments?.length && job.segments[0].caption) return job.segments[0].caption;
        if (job.transcript) {
            console.warn(`[${job.id}] ⚠️ Missing main caption, falling back to transcript summary.`);
            return job.transcript.substring(0, 150) + '...';
        }
        if (job.fullCommentary) {
            console.warn(`[${job.id}] ⚠️ Missing caption, falling back to commentary.`);
            return job.fullCommentary.substring(0, 150) + '...';
        }
        return 'New reel ready!';
    }

    /** Builds the full callback payload for webhook. */
    private buildCallbackPayload(job: ReelJob): Record<string, any> {
        const caption = this.resolveCaption(job);
        const hashtagString = job.hashtags ? job.hashtags.join(' ') : '';
        const fullCaption = job.captionBody
            ? `${job.captionBody}\n\n${hashtagString}`.trim()
            : `${caption}\n\n${hashtagString}`.trim();

        const payload: Record<string, any> = {
            jobId: job.id,
            status: job.status,
            caption: fullCaption,
            hashtags: hashtagString,
            captionBody: job.captionBody,
            originalHashtags: job.hashtags,
            metadata: this.buildCallbackMetadata(job),
        };

        if (job.finalVideoUrl) {
            payload.video_url = job.finalVideoUrl;
            payload.url = job.finalVideoUrl;
            payload.videoUrl = job.finalVideoUrl;
        }

        if (job.error) {
            payload.error = job.error;
        }

        return payload;
    }

    /** Builds metadata for callback payload. */
    private buildCallbackMetadata(job: ReelJob): Record<string, any> {
        return {
            duration: job.voiceoverDurationSeconds,
            createdAt: job.createdAt,
            completedAt: job.updatedAt,
            mainCaption: job.mainCaption,
            hook: job.hookPlan?.chosenHook,
            contentMode: job.contentMode,
            parableTheme: job.parableIntent?.coreTheme,
            parableCulture: job.parableScriptPlan?.sourceChoice?.culture,
        };
    }

    /**
     * Processes a website promo reel job.
     * Orchestrates: scrape → detect category → generate script → render.
     */
    public async processWebsitePromoJob(jobId: string, job: ReelJob): Promise<ReelJob> {
        const websiteInput = job.websitePromoInput!;
        console.log(`[${jobId}] Website Promo: Scraping ${websiteInput.websiteUrl}`);

        try {
            // Step 1: Scrape and analyze website
            const websiteAnalysis = await this.scrapeWebsiteForPromo(jobId, websiteInput.websiteUrl);

            // Step 2: Detect business category
            const category = await this.detectCategoryForPromo(jobId, websiteInput, websiteAnalysis);

            // Step 3: Generate promo script
            const { promoScript, businessName } = await this.generatePromoContent(
                jobId, websiteInput, websiteAnalysis, category
            );

            // Step 4: Render the promo reel (TTS → Music → Images → Video)
            return await this.renderPromoReel(jobId, job, promoScript, category, businessName);

        } catch (error) {
            return await this.errorService.handlePromoJobError(jobId, job, error);
        }
    }

    /**
     * Scrapes website for promo content.
     */
    private async scrapeWebsiteForPromo(jobId: string, websiteUrl: string): Promise<WebsiteAnalysis> {
        await this.updateJobStatus(jobId, 'planning', 'Analyzing business website...');

        if (!this.deps.websiteScraperClient) {
            throw new Error('WebsiteScraperClient is required for website promo mode');
        }

        // Enable multi-page scraping for richer Site DNA
        const websiteAnalysis = await this.deps.websiteScraperClient.scrapeWebsite(websiteUrl, {
            includeSubpages: true,
        });

        // Perform Semantic DNA analysis
        const semanticAnalyzer = new SemanticAnalyzer();
        websiteAnalysis.siteDNA = semanticAnalyzer.analyzeSiteDNA(websiteAnalysis);

        await this.deps.jobManager.updateJob(jobId, { websiteAnalysis });
        console.log(`[${jobId}] Website scraped: hero="${websiteAnalysis.heroText}", painScore=${websiteAnalysis.siteDNA?.painScore}, trustSignals=${websiteAnalysis.siteDNA?.trustSignals.length}`);

        return websiteAnalysis;
    }

    /**
     * Detects business category from website or user input.
     */
    private async detectCategoryForPromo(
        jobId: string,
        websiteInput: WebsitePromoInput,
        websiteAnalysis: WebsiteAnalysis
    ): Promise<BusinessCategory> {
        if (websiteInput.category) {
            console.log(`[${jobId}] Category provided by user: ${websiteInput.category}`);
            await this.deps.jobManager.updateJob(jobId, { businessCategory: websiteInput.category });
            return websiteInput.category;
        }

        let category: BusinessCategory = 'service';

        if (this.deps.llmClient.detectBusinessCategory) {
            try {
                category = await this.deps.llmClient.detectBusinessCategory(websiteAnalysis);
                console.log(`[${jobId}] Category detected via LLM: ${category}`);
            } catch (err) {
                console.warn(`[${jobId}] LLM category detection failed, using keyword fallback:`, err);
                const keywordResult = detectCategoryFromKeywords(websiteAnalysis.keywords);
                category = keywordResult.category;
                console.log(`[${jobId}] Category detected via keywords: ${category} (confidence: ${keywordResult.confidence.toFixed(2)})`);
            }
        } else {
            // Fallback to keyword detection
            const keywordResult = detectCategoryFromKeywords(websiteAnalysis.keywords);
            category = keywordResult.category;
            console.log(`[${jobId}] Category detected via keywords: ${category}`);
        }

        await this.deps.jobManager.updateJob(jobId, { businessCategory: category });
        return category;
    }

    /**
     * Generates promo script content from website analysis.
     */
    private async generatePromoContent(
        jobId: string,
        websiteInput: WebsitePromoInput,
        websiteAnalysis: WebsiteAnalysis,
        category: BusinessCategory
    ): Promise<{ promoScript: PromoScriptPlan; businessName: string }> {
        await this.updateJobStatus(jobId, 'generating_commentary', 'Creating promotional script...');

        const businessName = websiteInput.businessName || websiteAnalysis.detectedBusinessName || 'Local Business';
        const template = getPromptTemplate(category);

        if (!this.deps.llmClient.generatePromoScript) {
            throw new Error('LlmClient.generatePromoScript is required for website promo mode');
        }

        const promoScript = await this.deps.llmClient.generatePromoScript(
            websiteAnalysis, category, template, businessName, websiteInput.language || 'en'
        );

        // Include logo from input if present
        if (websiteInput.logoUrl) {
            promoScript.logoUrl = websiteInput.logoUrl;
            promoScript.logoPosition = websiteInput.logoPosition || 'end';
        }

        await this.deps.jobManager.updateJob(jobId, { promoScriptPlan: promoScript });
        console.log(`[${jobId}] Promo script generated: "${promoScript.coreMessage}" with ${promoScript.scenes.length} scenes`);

        return { promoScript, businessName };
    }

    /**
     * Renders the promo reel through TTS → Music → Images → Video pipeline.
     */
    private async renderPromoReel(
        jobId: string,
        job: ReelJob,
        promoScript: PromoScriptPlan,
        category: BusinessCategory,
        businessName: string
    ): Promise<ReelJob> {
        const segmentContent = this.convertPromoScenesToSegments(promoScript);
        const targetDuration = promoScript.scenes.reduce((sum, scene) => sum + scene.duration, 0);
        const fullCommentary = segmentContent.map(s => s.commentary).join(' ');

        await this.deps.jobManager.updateJob(jobId, {
            targetDurationSeconds: targetDuration,
            mainCaption: promoScript.caption,
            transcript: `Website Promo: ${promoScript.coreMessage}`,
        });

        // Prepare all assets (voiceover, music, images)
        const config = getConfig();
        const promoVoiceId = job.voiceId || config.ttsCloningPromoVoiceId || config.ttsCloningVoiceId;
        const assets = await this.promoAssetService.preparePromoAssets({
            jobId,
            job,
            segmentContent,
            fullCommentary,
            targetDuration,
            category,
            promoScript,
            voiceId: promoVoiceId
        });

        // Build manifest
        const manifest = createReelManifest({
            durationSeconds: assets.voiceoverDuration,
            voiceoverUrl: assets.voiceoverUrl,
            musicUrl: assets.musicUrl,
            musicDurationSeconds: assets.musicDurationSeconds || assets.voiceoverDuration,
            segments: assets.segmentsWithImages,
            subtitlesUrl: '', // No subtitles for promo
        });

        // Finalize (Render + Notify)
        return await this.finalizePromoJob(jobId, job, manifest, category, businessName);
    }

    /**
     * Finalizes promo job: render video, complete job, send notifications.
     */
    private async finalizePromoJob(
        jobId: string,
        job: ReelJob,
        manifest: ReelManifest,
        category: BusinessCategory,
        businessName: string
    ): Promise<ReelJob> {
        await this.deps.jobManager.updateStatus(jobId, 'building_manifest', 'Preparing final video...');
        // Re-fetch job to ensure we have the latest websiteAnalysis (e.g. updated logo URL or contact info from subpages)
        const updatedJob = await this.deps.jobManager.getJob(jobId);
        const websiteAnalysis = updatedJob?.websiteAnalysis || job.websiteAnalysis;

        // Populate branding for Info Slides if we have data
        if (websiteAnalysis) {
            manifest.branding = {
                logoUrl: websiteAnalysis.logoUrl || manifest.logoUrl || '',
                businessName: businessName,
                address: websiteAnalysis.address,
                hours: websiteAnalysis.openingHours,
                phone: websiteAnalysis.phone,
                email: websiteAnalysis.email,
                qrCodeUrl: websiteAnalysis.reservationLink || job.websitePromoInput?.websiteUrl,
            };
        };

        // Populate Overlays for Restaurant Pivot (Rating + QR)
        if (category === 'restaurant' && websiteAnalysis) {
            manifest.overlays = [];

            // We assume strict 3-scene structure: Hook, Showcase, CTA
            if (manifest.segments && manifest.segments.length >= 3) {
                const showcaseScene = manifest.segments[1]; // Scene 2
                const ctaScene = manifest.segments[2];      // Scene 3

                // Rating Badge (during Showcase)
                if (websiteAnalysis.rating) {
                    manifest.overlays.push({
                        type: 'rating_badge',
                        content: websiteAnalysis.rating,
                        start: showcaseScene.start + 0.5,
                        end: showcaseScene.end - 0.5,
                        position: 'top_right'
                    });
                }

                // QR Code removed as per user feedback (focus on contact info in branding)
            }
        }

        await this.deps.jobManager.updateJob(jobId, { manifest });

        console.log('[Manifest] Before rendering:', {
            duration: manifest.durationSeconds,
            segmentCount: manifest.segments?.length || 0,
            segments: manifest.segments?.map(s => ({ start: s.start, end: s.end })),
            hasBranding: !!manifest.branding,
            branding: manifest.branding
        });

        await this.deps.jobManager.updateStatus(jobId, 'rendering', 'Rendering final video...');
        const renderResult = await this.deps.videoRenderer.render(manifest);
        let finalVideoUrl = renderResult.videoUrl;

        // Persist to Cloudinary if available
        if (this.deps.storageClient && finalVideoUrl && !finalVideoUrl.includes('cloudinary')) {
            try {
                await this.deps.jobManager.updateStatus(jobId, 'uploading', 'Saving to permanent storage...');
                const uploadResult = await this.deps.storageClient.uploadVideo(finalVideoUrl, {
                    folder: 'instagram-reels/final-videos',
                    publicId: `promo_${jobId}_${Date.now()}`,
                    resourceType: 'video'
                });
                finalVideoUrl = uploadResult.url;
            } catch (e) {
                console.error('[Promo] Permanent upload failed, using transient URL:', e);
            }
        }

        const completedJob = completeJob(await this.deps.jobManager.getJob(jobId) as ReelJob, finalVideoUrl, manifest);
        await this.deps.jobManager.updateJob(jobId, { status: 'completed', finalVideoUrl, manifest });

        const hookName = getViralHookName(job.hookPlan?.chosenHook || job.promoScriptPlan?.hookType);

        if (completedJob.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                completedJob.telegramChatId,
                `🎉 *Your website promo reel is ready!*\n\n🏪 ${businessName}\n📁 Category: ${category}\n🪝 Strategy: ${hookName}\n\n${finalVideoUrl}`
            );
        }
        await this.notifyCallback(completedJob);
        return completedJob;
    }

    /**
     * Updates job status and logs progress.
     */
    private async updateJobStatus(jobId: string, status: ReelJobStatus, logMessage: string): Promise<void> {
        console.log(`[${jobId}] ${status}: ${logMessage}`);
        await this.deps.jobManager.updateJob(jobId, {
            currentStep: status,
            status: status
        });
    }

    /**
     * Converts promo script scenes into pipeline-consumable segments.
     */
    private convertPromoScenesToSegments(promoScript: PromoScriptPlan): SegmentContent[] {
        return promoScript.scenes.map(scene => ({
            commentary: scene.narration,
            imagePrompt: scene.imagePrompt,
            caption: scene.subtitle || scene.narration.substring(0, 100),
        }));
    }
}
