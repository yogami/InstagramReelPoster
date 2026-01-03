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
import { WebsiteIntelligenceService } from '../domain/services/WebsiteIntelligenceService';
import { GptService } from '../infrastructure/llm/GptService';

// Pipeline Imports
import { createJobContext, executePipeline } from './pipelines/PipelineInfrastructure';
import { createStandardPipeline, PipelineDependencies } from './pipelines/JobProcessingPipeline';
import { VoiceoverService } from './services/VoiceoverService';
import { ImageGenerationService } from './services/ImageGenerationService';
import { PromoAssetService } from './services/PromoAssetService';
import { OrchestratorErrorService } from './services/OrchestratorErrorService';
import { IComplianceClient } from '../infrastructure/compliance/GuardianClient';
import { WebsitePromoSlice } from '../lib/website-promo';

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
    complianceClient?: IComplianceClient;
    /** Optional: Independent Website Promo slice for decoupled processing */
    websitePromoSlice?: WebsitePromoSlice;
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

        await this.sendInitialNotification(job);

        try {
            // Route to appropriate pipeline
            const finalJob = await this.routeJobToPipeline(jobId, job);
            return finalJob;
        } catch (error) {
            await this.handleJobError(jobId, job, error);
            throw error;
        }
    }

    /** Sends initial Telegram notification if configured. */
    private async sendInitialNotification(job: ReelJob): Promise<void> {
        if (job.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                job.telegramChatId,
                '🎬 *Starting your reel creation!*\n\nI\'ll notify you when it\'s ready. This usually takes 2-5 minutes.'
            );
        }
    }

    /** Routes job to the appropriate pipeline based on mode. */
    private async routeJobToPipeline(jobId: string, job: ReelJob): Promise<ReelJob> {
        // YouTube Short Mode
        if (job.forceMode === 'youtube-short' || job.youtubeShortInput) {
            console.log(`[${jobId}] 🎬 Using YOUTUBE SHORT pipeline`);
            return await this.processYouTubeShortJob(jobId, job);
        }

        // Website Promo Mode
        const forceModeCheck = (job as any)?.forceMode || (job as any)?.websitePromoInput?.forceMode;
        if (forceModeCheck === 'website-promo' || job.websitePromoInput) {
            console.log(`[${jobId}] 🚀 Using WEBSITE PROMO pipeline`);
            return await this.processWebsitePromoJob(jobId, job);
        }

        // Standard Pipeline
        console.log(`[${jobId}] 🚀 Initializing STANDARD pipeline execution...`);
        return await this.executeStandardPipeline(jobId, job);
    }

    /** Executes the standard reel pipeline and finalizes. */
    private async executeStandardPipeline(jobId: string, job: ReelJob): Promise<ReelJob> {
        const pipelineDeps = this.createPipelineDependencies();
        const steps = createStandardPipeline(pipelineDeps);
        const initialContext = createJobContext(jobId, job);

        const finalContext = await executePipeline(
            initialContext,
            steps,
            async (stepName, ctx) => {
                this.logMemoryUsage(stepName);
                await this.updateJobStatus(jobId, ctx.job.status, `Executing ${stepName}...`);
            }
        );

        return await this.finalizeStandardJob(jobId, finalContext.finalVideoUrl);
    }

    /** Creates pipeline dependencies with services. */
    private createPipelineDependencies(): PipelineDependencies {
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

        return { ...this.deps, voiceoverService, imageGenerationService };
    }

    /** Finalizes standard job: upload, notify, analytics. */
    private async finalizeStandardJob(jobId: string, videoUrl: string | undefined): Promise<ReelJob> {
        let finalJob = await this.deps.jobManager.getJob(jobId);
        if (!finalJob) throw new Error('Job disappeared after pipeline completion');

        let finalVideoUrl = videoUrl;
        finalVideoUrl = await this.persistVideoIfNeeded(jobId, finalVideoUrl);

        if (finalVideoUrl && finalVideoUrl !== videoUrl) {
            finalJob = await this.deps.jobManager.updateJob(jobId, { finalVideoUrl, status: 'completed' });
        }

        if (!finalJob) throw new Error('Job disappeared during finalization');

        await this.sendCompletionNotification(finalJob);
        await this.triggerCallbackIfNeeded(finalJob);
        await this.recordAnalyticsIfEnabled(jobId, finalJob);

        return finalJob;
    }

    /** Uploads video to permanent storage if needed. */
    private async persistVideoIfNeeded(jobId: string, videoUrl: string | undefined): Promise<string | undefined> {
        if (!videoUrl || !this.deps.storageClient || videoUrl.includes('cloudinary')) {
            return videoUrl;
        }

        try {
            await this.updateJobStatus(jobId, 'uploading', 'Uploading to permanent storage...');
            const uploadResult = await this.deps.storageClient.uploadVideo(videoUrl, {
                folder: 'instagram-reels/final-videos',
                publicId: `reel_${jobId}_${Date.now()}`
            });
            return uploadResult.url;
        } catch (e: any) {
            console.error(`Upload failed: ${e.message || 'Unknown error'}`);
            return videoUrl;
        }
    }

    /** Sends completion notification via Telegram. */
    private async sendCompletionNotification(job: ReelJob): Promise<void> {
        if (!job.telegramChatId || !this.deps.notificationClient || job.status !== 'completed') {
            return;
        }
        const processingTime = Math.round((Date.now() - job.createdAt.getTime()) / 1000);
        await this.deps.notificationClient.sendNotification(
            job.telegramChatId,
            `✅ *Your reel is ready!*\n\nProcessing took ${processingTime}s.`
        );
    }

    /** Triggers callback webhook if configured. */
    private async triggerCallbackIfNeeded(job: ReelJob): Promise<void> {
        if (job.callbackUrl && job.status === 'completed') {
            await this.notifyCallback(job);
        }
    }

    /** Records analytics if growth insights service is enabled. */
    private async recordAnalyticsIfEnabled(jobId: string, job: ReelJob): Promise<void> {
        if (!this.deps.growthInsightsService || job.status !== 'completed') {
            return;
        }
        try {
            await this.deps.growthInsightsService.recordAnalytics({
                reelId: jobId,
                hookUsed: job.hookPlan?.chosenHook || 'None',
                targetDurationSeconds: job.targetDurationSeconds || 0,
                actualDurationSeconds: job.voiceoverDurationSeconds || 0,
                postedAt: new Date().toISOString()
            });
            console.log(`[${jobId}] Post-run analytics recorded.`);
        } catch (err) {
            console.warn(`[${jobId}] Failed to record post-run analytics:`, err);
        }
    }

    /** Handles job errors with notifications. */
    private async handleJobError(jobId: string, job: ReelJob, error: unknown): Promise<void> {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.deps.jobManager.failJob(jobId, errorMessage);

        if (job.telegramChatId && this.deps.notificationClient) {
            const friendly = errorMessage.includes('insufficient credits')
                ? 'Service credits exhausted. Please contact admin.'
                : errorMessage;
            await this.deps.notificationClient.sendNotification(job.telegramChatId, `❌ Error: ${friendly}`);
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

        // DELEGATION: If independent slice is configured, delegate to it
        if (this.deps.websitePromoSlice) {
            console.log(`[${jobId}] Delegating to independent WebsitePromoSlice...`);
            try {
                const config = getConfig();
                const promoVoiceId = websiteInput.voiceId; // Let slice resolve if user didn't provide one

                const sliceResult = await this.deps.websitePromoSlice.orchestrator.processJob(jobId, {
                    websiteUrl: websiteInput.websiteUrl,
                    businessName: websiteInput.businessName,
                    category: websiteInput.category,
                    consent: websiteInput.consent,
                    language: websiteInput.language,
                    providedMedia: websiteInput.providedMedia,
                    logoUrl: websiteInput.logoUrl,
                    logoPosition: websiteInput.logoPosition,
                    voiceId: promoVoiceId,
                    voiceStyle: websiteInput.voiceStyle,
                    motionStyle: websiteInput.motionStyle,
                    subtitleStyle: websiteInput.subtitleStyle
                });

                if (sliceResult.status === 'completed' && sliceResult.result) {
                    // Create minimal manifest for slice result
                    const sliceManifest: ReelManifest = {
                        voiceoverUrl: '',
                        subtitlesUrl: '',
                        durationSeconds: sliceResult.result.durationSeconds,
                        segments: []
                    };
                    return completeJob(job, sliceResult.result.videoUrl, sliceManifest);
                } else if (sliceResult.status === 'failed') {
                    return failJob(job, sliceResult.error || 'Slice processing failed');
                }
            } catch (sliceError) {
                console.error(`[${jobId}] Slice delegation failed, falling back to legacy:`, sliceError);
                // Fall through to legacy implementation
            }
        }

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

        console.log('🧠 Running Intelligence Layer (Extract -> Normalize -> Classify -> Blueprint)...');

        // 1. Sophisticated Extraction (LLM-based)
        await this.enrichAnalysisWithLlmExtraction(jobId, websiteAnalysis);

        // 2. Generate script via Blueprint pipeline
        const promoScript = await this.generateScriptFromBlueprint(websiteAnalysis, websiteInput.language);

        // 3. Enrich with business name and logo
        const businessName = this.resolveBusinessName(websiteInput, websiteAnalysis, promoScript);
        promoScript.businessName = businessName;
        this.applyLogoSettings(promoScript, websiteInput);

        await this.deps.jobManager.updateJob(jobId, { promoScriptPlan: promoScript });
        console.log(`[${jobId}] Script generated: "${promoScript.coreMessage}" via Blueprint`);

        // 4. Compliance Check
        await this.runComplianceCheck(jobId, promoScript, websiteInput.language);

        return { promoScript, businessName };
    }

    /** Enriches website analysis with sophisticated LLM extraction. */
    private async enrichAnalysisWithLlmExtraction(jobId: string, analysis: WebsiteAnalysis): Promise<void> {
        if (!analysis.rawText) return;

        try {
            const config = getConfig();
            const gptService = new GptService(config.openRouterApiKey || config.llmApiKey, 'gpt-4o');
            const intelService = new WebsiteIntelligenceService(gptService);
            const extraIntel = await intelService.extractSophisticatedContactInfo(analysis.rawText);

            this.mergeExtractedInfo(analysis, extraIntel);
            console.log(`[${jobId}] Sophisticated extraction complete:`, {
                phone: !!analysis.phone,
                hours: !!analysis.openingHours,
                address: !!analysis.address
            });
        } catch (err) {
            console.warn(`[${jobId}] Sophisticated extraction failed, continuing with scraped info:`, err);
        }
    }

    /** Merges extracted LLM info into website analysis. */
    private mergeExtractedInfo(analysis: WebsiteAnalysis, extraIntel: any): void {
        if (extraIntel.detectedBusinessName) analysis.detectedBusinessName = extraIntel.detectedBusinessName;
        if (extraIntel.phone) analysis.phone = extraIntel.phone;
        if (extraIntel.email) analysis.email = extraIntel.email;
        if (extraIntel.address) analysis.address = extraIntel.address;
        if (extraIntel.openingHours) analysis.openingHours = extraIntel.openingHours;
        if (extraIntel.socialLinks) {
            analysis.socialLinks = analysis.socialLinks
                ? { ...analysis.socialLinks, ...extraIntel.socialLinks }
                : extraIntel.socialLinks;
        }
    }

    /** Generates promo script using the Blueprint pipeline. */
    private async generateScriptFromBlueprint(analysis: WebsiteAnalysis, language?: string): Promise<PromoScriptPlan> {
        const normalizer = new PageNormalizer();
        const normalizedPage = normalizer.normalize(analysis);

        const classifier = new SmartSiteClassifier();
        const classification = await classifier.classify(normalizedPage);
        console.log('🔍 Site Classification:', JSON.stringify(classification, null, 2));

        const blueprintFactory = new BlueprintFactory();
        const blueprint = blueprintFactory.create(normalizedPage, classification);
        console.log('📐 Video Blueprint Beats:', JSON.stringify(blueprint.beats.map(b => b.kind), null, 2));

        if (!this.deps.llmClient.generateScriptFromBlueprint) {
            throw new Error('LLM Client does not support generateScriptFromBlueprint');
        }
        return await this.deps.llmClient.generateScriptFromBlueprint(blueprint, language);
    }

    /** Resolves business name from input, analysis, or script. */
    private resolveBusinessName(
        input: WebsitePromoInput,
        analysis: WebsiteAnalysis,
        script: PromoScriptPlan
    ): string {
        const name = input.businessName || analysis.detectedBusinessName || script.businessName;
        return (!name || name === 'Brand') ? 'My Business' : name;
    }

    /** Applies logo settings from input to script. */
    private applyLogoSettings(script: PromoScriptPlan, input: WebsitePromoInput): void {
        if (input.logoUrl) {
            script.logoUrl = input.logoUrl;
            script.logoPosition = input.logoPosition || 'end';
        }
    }

    /** Runs Guardian compliance check on generated script. */
    private async runComplianceCheck(jobId: string, script: PromoScriptPlan, language?: string): Promise<void> {
        if (!this.deps.complianceClient) return;

        console.log(`[${jobId}] 🛡️ Running Guardian compliance scan...`);
        const fullScript = script.scenes.map((s: { narration: string }) => s.narration).join(' ');
        const lang = language || 'de';

        const result = await this.deps.complianceClient.scanScript(fullScript, lang);

        if (!result.approved) {
            console.warn(`[${jobId}] ⚠️ Compliance issues detected (score: ${result.score}):`, result.violations);
            console.log(`[${jobId}] 💡 Correction hints:`, result.correctionHints);
        } else {
            console.log(`[${jobId}] ✅ Compliance check passed (score: ${result.score}, auditId: ${result.auditId})`);
        }

        await this.deps.jobManager.updateJob(jobId, {
            complianceResult: {
                approved: result.approved,
                score: result.score,
                auditId: result.auditId,
                violations: result.violations,
                scannedAt: new Date().toISOString()
            }
        });
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

        const updatedJob = await this.deps.jobManager.getJob(jobId);
        const websiteAnalysis = updatedJob?.websiteAnalysis || job.websiteAnalysis;

        // Populate branding and overlays
        this.populateManifestBranding(manifest, websiteAnalysis, category, businessName, job);
        this.populateManifestOverlays(manifest, websiteAnalysis, category);

        await this.deps.jobManager.updateJob(jobId, { manifest });
        this.logManifestDetails(manifest);

        // Render and persist
        const finalVideoUrl = await this.renderAndPersistVideo(jobId, manifest);

        // Complete job
        const completedJob = completeJob(await this.deps.jobManager.getJob(jobId) as ReelJob, finalVideoUrl, manifest);
        await this.deps.jobManager.updateJob(jobId, { status: 'completed', finalVideoUrl, manifest });

        // Notify
        await this.sendPromoCompletionNotification(completedJob, businessName, category, finalVideoUrl, job);
        await this.notifyCallback(completedJob);

        return completedJob;
    }

    /** Populates manifest branding based on site type. */
    private populateManifestBranding(
        manifest: ReelManifest,
        analysis: WebsiteAnalysis | undefined,
        category: BusinessCategory,
        businessName: string,
        job: ReelJob
    ): void {
        if (!analysis) return;

        const isPersonalSite = analysis.siteType === 'personal';
        manifest.branding = isPersonalSite
            ? this.createPersonalBranding(analysis, businessName, manifest.logoUrl)
            : this.createBusinessBranding(analysis, category, businessName, manifest.logoUrl, job);

        if (isPersonalSite) {
            console.log(`[PersonalPromo] Branding configured for personal site`);
        }
    }

    /** Creates branding for personal sites. */
    private createPersonalBranding(
        analysis: WebsiteAnalysis,
        businessName: string,
        fallbackLogoUrl?: string
    ): NonNullable<ReelManifest['branding']> {
        return {
            logoUrl: analysis.personalInfo?.headshotUrl || analysis.logoUrl || fallbackLogoUrl || '',
            businessName,
            address: analysis.address,
            hours: analysis.openingHours,
            phone: analysis.phone,
            email: analysis.email,
            ctaText: 'View Portfolio',
            qrCodeUrl: analysis.sourceUrl,
        };
    }

    /** Creates branding for business sites. */
    private createBusinessBranding(
        analysis: WebsiteAnalysis,
        category: BusinessCategory,
        businessName: string,
        fallbackLogoUrl: string | undefined,
        job: ReelJob
    ): NonNullable<ReelManifest['branding']> {
        const template = getPromptTemplate(category);
        return {
            logoUrl: analysis.logoUrl || fallbackLogoUrl || '',
            businessName,
            address: analysis.address,
            hours: analysis.openingHours,
            phone: analysis.phone,
            email: analysis.email,
            ctaText: template?.cta || 'Mehr erfahren',
            qrCodeUrl: analysis.reservationLink || job.websitePromoInput?.websiteUrl,
        };
    }

    /** Populates manifest overlays for restaurant category. */
    private populateManifestOverlays(
        manifest: ReelManifest,
        analysis: WebsiteAnalysis | undefined,
        category: BusinessCategory
    ): void {
        if (category !== 'restaurant' || !analysis) return;
        if (!manifest.segments || manifest.segments.length < 3) return;

        manifest.overlays = [];
        const showcaseScene = manifest.segments[1];

        if (analysis.rating) {
            manifest.overlays.push({
                type: 'rating_badge',
                content: analysis.rating,
                start: showcaseScene.start + 0.5,
                end: showcaseScene.end - 0.5,
                position: 'top_right'
            });
        }
    }

    /** Logs manifest details before rendering. */
    private logManifestDetails(manifest: ReelManifest): void {
        console.log('[Manifest] Before rendering:', {
            duration: manifest.durationSeconds,
            segmentCount: manifest.segments?.length || 0,
            segments: manifest.segments?.map(s => ({ start: s.start, end: s.end })),
            hasBranding: !!manifest.branding,
            branding: manifest.branding
        });
    }

    /** Renders video and persists to Cloudinary if available. */
    private async renderAndPersistVideo(jobId: string, manifest: ReelManifest): Promise<string> {
        await this.deps.jobManager.updateStatus(jobId, 'rendering', 'Rendering final video...');
        const renderResult = await this.deps.videoRenderer.render(manifest);
        let finalVideoUrl = renderResult.videoUrl;

        if (this.deps.storageClient && finalVideoUrl && !finalVideoUrl.includes('cloudinary')) {
            try {
                await this.deps.jobManager.updateStatus(jobId, 'uploading', 'Saving to permanent storage...');
                const uploadResult = await this.deps.storageClient.uploadVideo(finalVideoUrl, {
                    folder: 'instagram-reels/final-videos',
                    publicId: `promo_${jobId}_${Date.now()}`
                });
                finalVideoUrl = uploadResult.url;
            } catch (e) {
                console.error('[Promo] Permanent upload failed, using transient URL:', e);
            }
        }

        return finalVideoUrl;
    }

    /** Sends promo completion notification. */
    private async sendPromoCompletionNotification(
        job: ReelJob,
        businessName: string,
        category: BusinessCategory,
        videoUrl: string,
        originalJob: ReelJob
    ): Promise<void> {
        if (!job.telegramChatId || !this.deps.notificationClient) return;

        const hookName = getViralHookName(originalJob.hookPlan?.chosenHook || originalJob.promoScriptPlan?.hookType);
        await this.deps.notificationClient.sendNotification(
            job.telegramChatId,
            `🎉 *Your website promo reel is ready!*\n\n🏪 ${businessName}\n📁 Category: ${category}\n🪝 Strategy: ${hookName}\n\n${videoUrl}`
        );
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
     */
    private async processYouTubeShortJob(jobId: string, job: ReelJob): Promise<ReelJob> {
        const youtubeInput = job.youtubeShortInput;
        if (!youtubeInput) throw new Error('YouTube Short input is required');
        if (!this.deps.animatedVideoClient) throw new Error('AnimatedVideoClient is required for YouTube Shorts');

        this.logMemoryUsage('Start YouTube Short Pipeline');

        // 1. Generate voiceover with speed adjustment
        const { voiceoverUrl, actualTtsDuration } = await this.generateYouTubeVoiceover(jobId, job, youtubeInput);

        // 2. Analyze scenes using LLM
        const scriptAnalysis = await this.analyzeYouTubeScenes(jobId, youtubeInput);

        // 3. Generate scene visuals (video or image)
        const { segments, videoClipUrls } = await this.generateYouTubeSceneVisuals(
            jobId, scriptAnalysis, youtubeInput, actualTtsDuration
        );

        await this.deps.jobManager.updateJob(jobId, {
            segments,
            isAnimatedVideoMode: true,
            animatedVideoUrls: videoClipUrls,
        });

        // 4. Select music
        const musicResult = await this.selectYouTubeMusic(jobId, actualTtsDuration, youtubeInput.tone);

        // 5. Build manifest and render
        const { finalVideoUrl, manifest } = await this.buildAndRenderYouTubeManifest(
            jobId, voiceoverUrl, musicResult, segments, videoClipUrls, actualTtsDuration
        );

        // 6. Complete job and notify
        return await this.completeYouTubeJob(jobId, manifest, finalVideoUrl, youtubeInput, actualTtsDuration, videoClipUrls.length);
    }

    /** Generates TTS voiceover for YouTube Short with speed adjustment. */
    private async generateYouTubeVoiceover(
        jobId: string,
        job: ReelJob,
        input: NonNullable<ReelJob['youtubeShortInput']>
    ): Promise<{ voiceoverUrl: string; actualTtsDuration: number }> {
        const fullNarration = input.scenes.map(s => s.narration).join(' ');
        await this.updateJobStatus(jobId, 'synthesizing_voiceover', 'Generating voiceover...');

        const voiceId = job.voiceId || getConfig().ttsCloningVoiceId;
        const targetDuration = input.totalDurationSeconds;

        let ttsResult = await this.deps.ttsClient.synthesize(fullNarration, { voiceId });
        let voiceoverUrl = ttsResult.audioUrl;
        let actualTtsDuration = ttsResult.durationSeconds || targetDuration;

        // Re-synthesize with speed if overrun
        const durationOverrun = actualTtsDuration / targetDuration;
        if (durationOverrun > 1.1) {
            const requiredSpeed = Math.min(durationOverrun, 1.8);
            console.log(`[${jobId}] TTS overrun: ${actualTtsDuration.toFixed(1)}s. Re-synthesizing at ${requiredSpeed.toFixed(2)}x`);
            await this.updateJobStatus(jobId, 'synthesizing_voiceover', `Adjusting speed (${requiredSpeed.toFixed(1)}x)...`);
            ttsResult = await this.deps.ttsClient.synthesize(fullNarration, { voiceId, speed: requiredSpeed });
            voiceoverUrl = ttsResult.audioUrl;
            actualTtsDuration = ttsResult.durationSeconds || (targetDuration / requiredSpeed);
        }

        await this.deps.jobManager.updateJob(jobId, { voiceoverUrl, voiceoverDurationSeconds: actualTtsDuration });
        console.log(`[${jobId}] TTS finalized: ${actualTtsDuration.toFixed(1)}s`);

        return { voiceoverUrl, actualTtsDuration };
    }

    /** Analyzes YouTube scenes using LLM for visual accuracy. */
    private async analyzeYouTubeScenes(
        jobId: string,
        input: NonNullable<ReelJob['youtubeShortInput']>
    ) {
        await this.updateJobStatus(jobId, 'analyzing_scenes', 'Analyzing scenes...');
        const sceneAnalyzer = new YouTubeSceneAnalyzer();

        const fullScriptText = input.scenes.map(s =>
            `[${s.title}]\nVisual: ${s.visualPrompt}\nNarration: ${s.narration}`
        ).join('\n\n');

        const scriptAnalysis = await sceneAnalyzer.analyzeScript(
            input.title,
            input.scenes,
            input.tone || 'epic',
            fullScriptText
        );

        for (const analyzed of scriptAnalysis.scenes) {
            console.log(`[${jobId}] Scene "${analyzed.original.title}" → ${analyzed.assetType.toUpperCase()}`);
        }

        return scriptAnalysis;
    }

    /** Generates video or image visuals for each YouTube scene. */
    private async generateYouTubeSceneVisuals(
        jobId: string,
        scriptAnalysis: Awaited<ReturnType<YouTubeSceneAnalyzer['analyzeScript']>>,
        input: NonNullable<ReelJob['youtubeShortInput']>,
        actualTtsDuration: number
    ): Promise<{ segments: Segment[]; videoClipUrls: string[] }> {
        await this.updateJobStatus(jobId, 'generating_animated_video', 'Creating scene visuals...');
        const segments: Segment[] = [];
        const videoClipUrls: string[] = [];
        let currentTime = 0;
        const durationRatio = actualTtsDuration / input.totalDurationSeconds;
        const primaryImage = this.deps.primaryImageClient || this.deps.fallbackImageClient;

        for (let i = 0; i < scriptAnalysis.scenes.length; i++) {
            const analyzed = scriptAnalysis.scenes[i];
            const originalScene = analyzed.original;
            const sceneDuration = (originalScene.durationSeconds || 10) * durationRatio;

            if (analyzed.assetType === 'video') {
                const { segment, urls } = await this.generateVideoSceneClips(
                    jobId, i, analyzed, originalScene, sceneDuration, currentTime, input.tone
                );
                segments.push(segment);
                videoClipUrls.push(...urls);
                currentTime += segment.endSeconds - segment.startSeconds;
            } else {
                const { segment, url } = await this.generateImageSceneClip(
                    jobId, i, analyzed, originalScene, sceneDuration, currentTime, primaryImage
                );
                segments.push(segment);
                videoClipUrls.push(url);
                currentTime += sceneDuration;
            }
        }

        return { segments, videoClipUrls };
    }

    /** Generates video clips for a single scene. */
    private async generateVideoSceneClips(
        jobId: string,
        sceneIndex: number,
        analyzed: any,
        originalScene: any,
        sceneDuration: number,
        currentTime: number,
        tone?: string
    ): Promise<{ segment: Segment; urls: string[] }> {
        const urls: string[] = [];
        const clipsNeeded = Math.ceil(sceneDuration / 10);
        const clipDuration = clipsNeeded > 1 ? 10 : (sceneDuration <= 5 ? 5 : 10);

        for (let clipIdx = 0; clipIdx < clipsNeeded; clipIdx++) {
            const url = await this.generateSingleVideoClip(jobId, sceneIndex, clipIdx, analyzed, originalScene, clipDuration, tone);
            urls.push(url);
        }

        const segmentDuration = clipsNeeded * clipDuration;
        const segment = createSegment({
            index: sceneIndex,
            commentary: originalScene.narration,
            imagePrompt: originalScene.visualPrompt,
            imageUrl: urls[0] || '',
            startSeconds: currentTime,
            endSeconds: currentTime + segmentDuration,
            caption: originalScene.title,
        });

        return { segment, urls };
    }

    /** Generates a single video clip for a scene. */
    private async generateSingleVideoClip(
        jobId: string,
        sceneIndex: number,
        clipIdx: number,
        analyzed: any,
        originalScene: any,
        clipDuration: number,
        tone?: string
    ): Promise<string> {
        try {
            const clipPrompt = clipIdx === 0
                ? analyzed.enhancedPrompt
                : `${analyzed.enhancedPrompt} (continuation, part ${clipIdx + 1})`;

            const videoResult = await this.deps.animatedVideoClient!.generateAnimatedVideo({
                durationSeconds: clipDuration,
                theme: clipPrompt,
                storyline: originalScene.narration,
                mood: analyzed.visualSpec.mood || tone || 'epic',
            });

            return await this.persistVideoClip(videoResult.videoUrl, jobId, sceneIndex, clipIdx);
        } catch (error) {
            console.error(`[${jobId}] Failed to generate video for scene ${sceneIndex}:`, error);
            return 'https://res.cloudinary.com/djol0rpn5/video/upload/v1734612999/samples/elephants.mp4';
        }
    }

    /** Persists video clip to Cloudinary if available. */
    private async persistVideoClip(videoUrl: string, jobId: string, sceneIndex: number, clipIdx: number): Promise<string> {
        if (!this.deps.storageClient || !videoUrl || videoUrl.includes('cloudinary')) {
            return videoUrl;
        }

        const uploaded = await this.deps.storageClient.uploadVideo(videoUrl, {
            folder: 'youtube-shorts/scene-clips',
            publicId: `youtube_${jobId}_scene${sceneIndex}_clip${clipIdx}`,
        });
        return uploaded.url;
    }

    /** Generates image for a scene with Ken Burns effect. */
    private async generateImageSceneClip(
        jobId: string,
        sceneIndex: number,
        analyzed: any,
        originalScene: any,
        sceneDuration: number,
        currentTime: number,
        imageClient: IImageClient
    ): Promise<{ segment: Segment; url: string }> {
        let url: string;
        try {
            const imageResult = await imageClient.generateImage(analyzed.enhancedPrompt);
            let imageUrl = imageResult.imageUrl;

            if (this.deps.storageClient && imageUrl && !imageUrl.includes('cloudinary')) {
                const uploaded = await this.deps.storageClient.uploadImage(imageUrl, {
                    folder: 'youtube-shorts/scene-images',
                    publicId: `youtube_${jobId}_scene${sceneIndex}_image`,
                });
                imageUrl = uploaded.url;
            }
            url = `turbo:${imageUrl}`;
            console.log(`[${jobId}] Image generated for scene ${sceneIndex + 1}`);
        } catch (error) {
            console.error(`[${jobId}] Failed to generate image for scene ${sceneIndex}:`, error);
            url = 'turbo:https://res.cloudinary.com/djol0rpn5/image/upload/v1734612999/samples/landscapes/nature-mountains.jpg';
        }

        const segment = createSegment({
            index: sceneIndex,
            commentary: originalScene.narration,
            imagePrompt: originalScene.visualPrompt,
            imageUrl: url.replace('turbo:', '') || '',
            startSeconds: currentTime,
            endSeconds: currentTime + sceneDuration,
            caption: originalScene.title,
        });

        return { segment, url };
    }

    /** Selects music for YouTube Short. */
    private async selectYouTubeMusic(jobId: string, duration: number, tone?: string) {
        await this.updateJobStatus(jobId, 'selecting_music', 'Selecting background music...');
        const musicResult = await this.deps.musicSelector.selectMusic(
            ['epic', 'cinematic', 'ambient'],
            duration,
            tone || 'epic'
        );

        if (musicResult) {
            await this.deps.jobManager.updateJob(jobId, {
                musicUrl: musicResult.track.audioUrl,
                musicDurationSeconds: musicResult.track.durationSeconds,
                musicSource: musicResult.source as 'catalog' | 'internal' | 'ai',
            });
        }
        return musicResult;
    }

    /** Builds manifest and renders YouTube Short video. */
    private async buildAndRenderYouTubeManifest(
        jobId: string,
        voiceoverUrl: string,
        musicResult: any,
        segments: Segment[],
        videoClipUrls: string[],
        actualTtsDuration: number
    ): Promise<{ finalVideoUrl: string; manifest: ReelManifest }> {
        await this.updateJobStatus(jobId, 'building_manifest', 'Preparing video manifest...');
        const manifest = createReelManifest({
            durationSeconds: actualTtsDuration,
            voiceoverUrl,
            musicUrl: musicResult?.track.audioUrl,
            segments,
            subtitlesUrl: '',
        });

        (manifest as any).isVideoMode = true;
        (manifest as any).videoClipUrls = videoClipUrls;
        await this.deps.jobManager.updateJob(jobId, { manifest });

        await this.updateJobStatus(jobId, 'rendering', 'Rendering final video...');
        const renderResult = await this.deps.videoRenderer.render(manifest);
        let finalVideoUrl = renderResult.videoUrl;

        if (this.deps.storageClient && finalVideoUrl && !finalVideoUrl.includes('cloudinary')) {
            try {
                await this.updateJobStatus(jobId, 'uploading', 'Saving to permanent storage...');
                const uploadResult = await this.deps.storageClient.uploadVideo(finalVideoUrl, {
                    folder: 'youtube-shorts/final-videos',
                    publicId: `youtube_${jobId}_${Date.now()}`,
                });
                finalVideoUrl = uploadResult.url;
            } catch (e) {
                console.error('[YouTube] Permanent upload failed:', e);
            }
        }

        return { finalVideoUrl, manifest };
    }

    /** Completes YouTube Short job and sends notifications. */
    private async completeYouTubeJob(
        jobId: string,
        manifest: ReelManifest,
        finalVideoUrl: string,
        input: NonNullable<ReelJob['youtubeShortInput']>,
        actualTtsDuration: number,
        clipCount: number
    ): Promise<ReelJob> {
        const completedJob = completeJob(
            await this.deps.jobManager.getJob(jobId) as ReelJob,
            finalVideoUrl,
            manifest
        );
        await this.deps.jobManager.updateJob(jobId, { status: 'completed', finalVideoUrl, manifest });

        if (completedJob.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                completedJob.telegramChatId,
                `✅ *Your YouTube Short is ready!*\n\n🎬 ${input.title}\n⏱️ ${actualTtsDuration.toFixed(1)}s\n🎞️ ${clipCount} clips\n\n${finalVideoUrl}`
            );
        }

        await this.notifyCallback(completedJob);
        return completedJob;
    }
}
