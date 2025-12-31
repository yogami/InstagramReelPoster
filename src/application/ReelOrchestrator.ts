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
import { YouTubeSceneAnalyzer } from '../infrastructure/youtube/YouTubeSceneAnalyzer';
import { PageNormalizer } from '../domain/services/PageNormalizer';
import { SmartSiteClassifier } from '../domain/services/SmartSiteClassifier';
import { BlueprintFactory } from '../domain/services/BlueprintFactory';

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
            // YouTube Short Mode Branch
            if (job.forceMode === 'youtube-short' || job.youtubeShortInput) {
                console.log(`[${jobId}] 🎬 Using YOUTUBE SHORT pipeline (forceMode: ${job.forceMode})`);
                return await this.processYouTubeShortJob(jobId, job);
            }

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
                    // Update the job status for progress tracking
                    await this.updateJobStatus(jobId, ctx.job.status, `Executing ${stepName}...`);
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
                } catch (e: any) {
                    console.error(`Upload failed: ${e.message || 'Unknown error'}`);
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
        } catch (error: any) {
            console.error(`[${job.id}] Failed to notify callback: ${error.message || 'Unknown error'}`);
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

            // Step 2: Detect business category (skip for personal sites)
            const siteType = websiteAnalysis.siteType || 'business';
            let category: BusinessCategory | undefined = undefined;

            if (siteType === 'business') {
                category = await this.detectCategoryForPromo(jobId, websiteInput, websiteAnalysis);
            } else {
                console.log(`[${jobId}] Personal site detected, skipping category detection`);
            }

            // Step 3: Generate promo script (routing happens inside)
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
        category?: BusinessCategory
    ): Promise<{ promoScript: PromoScriptPlan; businessName: string }> {
        if (!websiteAnalysis) {
            throw new Error('Website analysis is required for promo content generation');
        }

        console.log('🧠 Running Intelligence Layer (Normalize -> Classify -> Blueprint)...');

        // 1. Normalize
        const normalizer = new PageNormalizer();
        const normalizedPage = normalizer.normalize(websiteAnalysis);

        // 2. Classify
        const classifier = new SmartSiteClassifier();
        const classification = await classifier.classify(normalizedPage);
        console.log('🔍 Site Classification:', JSON.stringify(classification, null, 2));

        // 3. Blueprint
        const blueprintFactory = new BlueprintFactory();
        const blueprint = blueprintFactory.create(normalizedPage, classification);
        console.log('📐 Video Blueprint Beats:', JSON.stringify(blueprint.beats.map(b => b.kind), null, 2));

        // 4. Generate Script via LLM
        if (!this.deps.llmClient.generateScriptFromBlueprint) {
            throw new Error('LLM Client does not support generateScriptFromBlueprint');
        }
        const promoScript = await this.deps.llmClient.generateScriptFromBlueprint(blueprint, websiteInput.language);

        // Enrich with business name
        // Priority: Input > Analysis > LLM > Default
        let businessName = websiteInput.businessName || websiteAnalysis.detectedBusinessName || promoScript.businessName;

        if (!businessName || businessName === 'Brand') {
            businessName = 'My Business';
        }

        // Enrich script object
        promoScript.businessName = businessName;

        // Include logo from input if present
        if (websiteInput.logoUrl) {
            promoScript.logoUrl = websiteInput.logoUrl;
            promoScript.logoPosition = websiteInput.logoPosition || 'end';
        }

        await this.deps.jobManager.updateJob(jobId, { promoScriptPlan: promoScript });
        console.log(`[${jobId}] Script generated: "${promoScript.coreMessage}" via Blueprint`);

        return {
            promoScript,
            businessName
        };
    }

    /**
     * Renders the promo reel through TTS → Music → Images → Video pipeline.
     */
    private async renderPromoReel(
        jobId: string,
        job: ReelJob,
        promoScript: PromoScriptPlan,
        category: BusinessCategory | undefined,
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
            category: category || 'service', // Default to 'service' for personal sites
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
        return await this.finalizePromoJob(jobId, job, manifest, category || 'service', businessName);
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
            const template = getPromptTemplate(category);
            const isPersonalSite = websiteAnalysis.siteType === 'personal';

            // For personal sites: use social links, portfolio URL
            // For business sites: use business contact info
            if (isPersonalSite) {
                const socialText = [];
                if (websiteAnalysis.socialLinks?.linkedin) socialText.push(`LinkedIn: ${websiteAnalysis.socialLinks.linkedin}`);
                if (websiteAnalysis.socialLinks?.github) socialText.push(`GitHub: ${websiteAnalysis.socialLinks.github}`);
                if (websiteAnalysis.socialLinks?.twitter) socialText.push(`Twitter: ${websiteAnalysis.socialLinks.twitter}`);

                manifest.branding = {
                    logoUrl: websiteAnalysis.personalInfo?.headshotUrl || websiteAnalysis.logoUrl || manifest.logoUrl || '',
                    businessName: businessName,
                    address: websiteAnalysis.address, // Include if detected
                    hours: websiteAnalysis.openingHours, // Include if detected
                    phone: websiteAnalysis.phone, // Include if detected
                    email: websiteAnalysis.email, // Keep email if available
                    ctaText: 'View Portfolio', // Personal CTA
                    qrCodeUrl: websiteAnalysis.sourceUrl, // Main portfolio URL, not reservation
                };

                console.log(`[PersonalPromo] Branding configured for personal site: email=${websiteAnalysis.email}, socials=${socialText.join(', ')}`);
            } else {
                // Business site: use existing logic
                manifest.branding = {
                    logoUrl: websiteAnalysis.logoUrl || manifest.logoUrl || '',
                    businessName: businessName,
                    address: websiteAnalysis.address,
                    hours: websiteAnalysis.openingHours,
                    phone: websiteAnalysis.phone,
                    email: websiteAnalysis.email,
                    ctaText: template?.cta || 'Mehr erfahren',
                    qrCodeUrl: websiteAnalysis.reservationLink || job.websitePromoInput?.websiteUrl,
                };
            }
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
            currentStep: logMessage,
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
            caption: scene.subtitle,
            visualStyle: scene.visualStyle // Propagate style
        }));
    }

    /**
     * Processes a YouTube Short job.
     * Generates TTS for narration, creates VIDEO clips via Kie.ai, renders final video.
     * This is a separate slice from Instagram reels - uses VIDEO generation, not images.
     */
    private async processYouTubeShortJob(jobId: string, job: ReelJob): Promise<ReelJob> {
        const youtubeInput = job.youtubeShortInput;
        if (!youtubeInput) {
            throw new Error('YouTube Short input is required');
        }

        if (!this.deps.animatedVideoClient) {
            throw new Error('AnimatedVideoClient is required for YouTube Shorts (Kie.ai integration)');
        }

        this.logMemoryUsage('Start YouTube Short Pipeline');

        // 1. Generate TTS for full narration (with speed adjustment if needed)
        const fullNarration = youtubeInput.scenes.map(s => s.narration).join(' ');
        await this.updateJobStatus(jobId, 'synthesizing_voiceover', 'Generating voiceover...');

        const voiceId = job.voiceId || getConfig().ttsCloningVoiceId;
        const targetDuration = youtubeInput.totalDurationSeconds;

        // First pass: synthesize at normal speed to measure duration
        let ttsResult = await this.deps.ttsClient.synthesize(fullNarration, { voiceId });
        let voiceoverUrl = ttsResult.audioUrl;
        let actualTtsDuration = ttsResult.durationSeconds || targetDuration;

        // If TTS exceeds target by >10%, re-synthesize with calculated speed
        const durationOverrun = actualTtsDuration / targetDuration;
        if (durationOverrun > 1.1) {
            // Cap speed at 1.8x to maintain quality (Fish Audio supports up to 2.0)
            const requiredSpeed = Math.min(durationOverrun, 1.8);
            console.log(`[${jobId}] TTS overrun: ${actualTtsDuration.toFixed(1)}s vs target ${targetDuration}s. Re-synthesizing at ${requiredSpeed.toFixed(2)}x speed...`);

            await this.updateJobStatus(jobId, 'synthesizing_voiceover', `Adjusting narration speed (${requiredSpeed.toFixed(1)}x)...`);
            ttsResult = await this.deps.ttsClient.synthesize(fullNarration, { voiceId, speed: requiredSpeed });
            voiceoverUrl = ttsResult.audioUrl;
            actualTtsDuration = ttsResult.durationSeconds || (targetDuration / requiredSpeed);
        }

        await this.deps.jobManager.updateJob(jobId, {
            voiceoverUrl,
            voiceoverDurationSeconds: actualTtsDuration,
        });

        console.log(`[${jobId}] TTS finalized: ${actualTtsDuration.toFixed(1)}s (target: ${targetDuration}s)`);

        // 2. Analyze scenes using LLM for accurate prompt enhancement
        await this.updateJobStatus(jobId, 'analyzing_scenes', 'Analyzing scenes for visual accuracy...');
        const sceneAnalyzer = new YouTubeSceneAnalyzer();

        // Build full script text for context
        const fullScriptText = youtubeInput.scenes.map(s =>
            `[${s.title}]\nVisual: ${s.visualPrompt}\nNarration: ${s.narration}`
        ).join('\n\n');

        const scriptAnalysis = await sceneAnalyzer.analyzeScript(
            youtubeInput.title,
            youtubeInput.scenes,
            youtubeInput.tone || 'epic',
            fullScriptText
        );

        // Log analysis results
        for (const analyzed of scriptAnalysis.scenes) {
            console.log(`[${jobId}] Scene "${analyzed.original.title}" → ${analyzed.assetType.toUpperCase()}`);
            console.log(`[${jobId}]   Enhanced: ${analyzed.enhancedPrompt.substring(0, 100)}...`);
        }
        if (scriptAnalysis.warnings.length > 0) {
            console.warn(`[${jobId}] Analysis warnings:`, scriptAnalysis.warnings);
        }

        // 3. Calculate proportional scene durations based on actual TTS length
        const durationRatio = actualTtsDuration / targetDuration;

        // 4. Generate VIDEO or IMAGE for each scene based on analysis
        await this.updateJobStatus(jobId, 'generating_animated_video', 'Creating scene visuals...');
        const segments: Segment[] = [];
        const videoClipUrls: string[] = [];
        let currentTime = 0;

        const primaryImage = this.deps.primaryImageClient || this.deps.fallbackImageClient;

        for (let i = 0; i < scriptAnalysis.scenes.length; i++) {
            const analyzed = scriptAnalysis.scenes[i];
            const originalScene = analyzed.original;
            const sceneDuration = (originalScene.durationSeconds || 10) * durationRatio;

            console.log(`[${jobId}] Scene ${i + 1}/${scriptAnalysis.scenes.length}: ${sceneDuration.toFixed(1)}s (${analyzed.assetType})`);

            if (analyzed.assetType === 'video') {
                // Generate VIDEO clips via Kie.ai
                const clipsNeeded = Math.ceil(sceneDuration / 10);
                const clipDuration = clipsNeeded > 1 ? 10 : (sceneDuration <= 5 ? 5 : 10);

                for (let clipIdx = 0; clipIdx < clipsNeeded; clipIdx++) {
                    try {
                        const clipPrompt = clipIdx === 0
                            ? analyzed.enhancedPrompt
                            : `${analyzed.enhancedPrompt} (continuation, part ${clipIdx + 1})`;

                        const videoResult = await this.deps.animatedVideoClient!.generateAnimatedVideo({
                            durationSeconds: clipDuration,
                            theme: clipPrompt,
                            storyline: originalScene.narration,
                            mood: analyzed.visualSpec.mood || youtubeInput.tone || 'epic',
                        });

                        let videoUrl = videoResult.videoUrl;

                        // Upload to Cloudinary for persistent storage
                        if (this.deps.storageClient && videoUrl && !videoUrl.includes('cloudinary')) {
                            const uploaded = await this.deps.storageClient.uploadVideo(videoUrl, {
                                folder: 'youtube-shorts/scene-clips',
                                publicId: `youtube_${jobId}_scene${i}_clip${clipIdx}`,
                            });
                            videoUrl = uploaded.url;
                        }

                        videoClipUrls.push(videoUrl);
                        console.log(`[${jobId}] Clip ${videoClipUrls.length} generated: ${videoUrl.substring(0, 60)}...`);

                    } catch (error) {
                        console.error(`[${jobId}] Failed to generate video for scene ${i}, clip ${clipIdx}:`, error);
                        // Use fallback placeholder video
                        videoClipUrls.push('https://res.cloudinary.com/djol0rpn5/video/upload/v1734612999/samples/elephants.mp4');
                    }
                }

                // Create segment for this scene using actual clip duration
                const segmentDuration = clipsNeeded * clipDuration;
                segments.push(createSegment({
                    index: i,
                    commentary: originalScene.narration,
                    imagePrompt: originalScene.visualPrompt,
                    // Store first clip URL as "imageUrl" for compatibility, but mark as video
                    imageUrl: videoClipUrls[videoClipUrls.length - clipsNeeded] || '',
                    startSeconds: currentTime,
                    endSeconds: currentTime + segmentDuration,
                    caption: originalScene.title,
                }));

                currentTime += segmentDuration;
            } else {
                // Generate IMAGE via Flux and apply Ken Burns motion
                try {
                    const imageResult = await primaryImage.generateImage(analyzed.enhancedPrompt);
                    let imageUrl = imageResult.imageUrl;

                    // Upload to Cloudinary
                    if (this.deps.storageClient && imageUrl && !imageUrl.includes('cloudinary')) {
                        const uploaded = await this.deps.storageClient.uploadImage(imageUrl, {
                            folder: 'youtube-shorts/scene-images',
                            publicId: `youtube_${jobId}_scene${i}_image`,
                        });
                        imageUrl = uploaded.url;
                    }

                    // For images, we still need video clips for the renderer
                    // Use Ken Burns effect by marking with turbo: prefix
                    videoClipUrls.push(`turbo:${imageUrl}`);
                    console.log(`[${jobId}] Image generated for scene ${i + 1}: ${imageUrl.substring(0, 60)}...`);

                } catch (error) {
                    console.error(`[${jobId}] Failed to generate image for scene ${i}:`, error);
                    videoClipUrls.push('turbo:https://res.cloudinary.com/djol0rpn5/image/upload/v1734612999/samples/landscapes/nature-mountains.jpg');
                }

                segments.push(createSegment({
                    index: i,
                    commentary: originalScene.narration,
                    imagePrompt: originalScene.visualPrompt,
                    imageUrl: videoClipUrls[videoClipUrls.length - 1].replace('turbo:', '') || '',
                    startSeconds: currentTime,
                    endSeconds: currentTime + sceneDuration,
                    caption: originalScene.title,
                }));

                currentTime += sceneDuration;
            }
        }

        // Mark job as using animated video mode
        await this.deps.jobManager.updateJob(jobId, {
            segments,
            isAnimatedVideoMode: true,
            animatedVideoUrls: videoClipUrls,
        });

        // 5. Select music (epic/cinematic for YouTube Shorts)
        await this.updateJobStatus(jobId, 'selecting_music', 'Selecting background music...');
        const musicResult = await this.deps.musicSelector.selectMusic(
            ['epic', 'cinematic', 'ambient'],
            actualTtsDuration,
            youtubeInput.tone || 'epic'
        );

        if (musicResult) {
            await this.deps.jobManager.updateJob(jobId, {
                musicUrl: musicResult.track.audioUrl,
                musicDurationSeconds: musicResult.track.durationSeconds,
                musicSource: musicResult.source as 'catalog' | 'internal' | 'ai',
            });
        }

        // 6. Build manifest with VIDEO clips instead of images
        await this.updateJobStatus(jobId, 'building_manifest', 'Preparing video manifest...');
        const manifest = createReelManifest({
            durationSeconds: actualTtsDuration,
            voiceoverUrl,
            musicUrl: musicResult?.track.audioUrl,
            segments,
            subtitlesUrl: '',
        });

        // Mark manifest as video-based for renderer
        (manifest as any).isVideoMode = true;
        (manifest as any).videoClipUrls = videoClipUrls;

        await this.deps.jobManager.updateJob(jobId, { manifest });

        // 7. Render final video (concatenate clips + audio)
        await this.updateJobStatus(jobId, 'rendering', 'Rendering final video...');
        const renderResult = await this.deps.videoRenderer.render(manifest);
        let finalVideoUrl = renderResult.videoUrl;

        // 8. Upload to permanent storage
        if (this.deps.storageClient && finalVideoUrl && !finalVideoUrl.includes('cloudinary')) {
            try {
                await this.updateJobStatus(jobId, 'uploading', 'Saving to permanent storage...');
                const uploadResult = await this.deps.storageClient.uploadVideo(finalVideoUrl, {
                    folder: 'youtube-shorts/final-videos',
                    publicId: `youtube_${jobId}_${Date.now()}`,
                    resourceType: 'video',
                });
                finalVideoUrl = uploadResult.url;
            } catch (e) {
                console.error('[YouTube] Permanent upload failed:', e);
            }
        }

        // 9. Complete job
        const completedJob = completeJob(
            await this.deps.jobManager.getJob(jobId) as ReelJob,
            finalVideoUrl,
            manifest
        );
        await this.deps.jobManager.updateJob(jobId, {
            status: 'completed',
            finalVideoUrl,
            manifest,
        });

        // 10. Notify user
        if (completedJob.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                completedJob.telegramChatId,
                `✅ *Your YouTube Short is ready!*\n\n🎬 ${youtubeInput.title}\n⏱️ ${actualTtsDuration.toFixed(1)}s\n🎞️ ${videoClipUrls.length} video clips\n\n${finalVideoUrl}`
            );
        }

        // 11. Callback
        await this.notifyCallback(completedJob);

        return completedJob;
    }
}
