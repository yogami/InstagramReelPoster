import axios from 'axios';
import {
    ReelJob,
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
} from '../domain/entities/WebsitePromo';
import { IWebsiteScraperClient } from '../domain/ports/IWebsiteScraperClient';
import { getPromptTemplate, getMusicStyle, detectCategoryFromKeywords } from '../infrastructure/llm/CategoryPrompts';

import { ITranscriptionClient } from '../domain/ports/ITranscriptionClient';
import { ILLMClient, ReelPlan, SegmentContent } from '../domain/ports/ILLMClient';
import { ITTSClient } from '../domain/ports/ITTSClient';
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
import { CloudinaryStorageClient } from '../infrastructure/storage/CloudinaryStorageClient';
import { TrainingDataCollector } from '../infrastructure/training/TrainingDataCollector';
import { TelegramService } from '../presentation/services/TelegramService';
import { getConfig } from '../config';

export interface OrchestratorDependencies {
    transcriptionClient: ITranscriptionClient;
    llmClient: ILLMClient;
    ttsClient: ITTSClient;
    fallbackTTSClient?: ITTSClient;
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
    storageClient?: CloudinaryStorageClient;
    websiteScraperClient?: IWebsiteScraperClient;
    callbackToken?: string;
    callbackHeader?: string;
    notificationClient?: INotificationClient;
}

/**
 * ReelOrchestrator coordinates the full reel generation workflow.
 */
export class ReelOrchestrator {
    private readonly deps: OrchestratorDependencies;
    public readonly approvalService: ApprovalService;

    constructor(deps: OrchestratorDependencies) {
        this.deps = deps;

        // Initialize ApprovalService with TelegramService if notification client supports it
        const config = getConfig();
        const telegramService = config.telegramBotToken
            ? new TelegramService(config.telegramBotToken)
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
        this.logMemoryUsage('Start processJob');
        const job = await this.deps.jobManager.getJob(jobId);
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }

        // Send initial notification
        if (job.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                job.telegramChatId,
                '🎬 *Starting your reel creation!*\n\nI\'ll notify you when it\'s ready. This usually takes 2-5 minutes.'
            );
        }

        try {
            // ============================================
            // WEBSITE PROMO MODE (Early Branch)
            // ============================================
            const refreshedJobForMode = await this.deps.jobManager.getJob(jobId);
            const forceModeCheck = (refreshedJobForMode as any)?.forceMode;

            if (forceModeCheck === 'website-promo' && job.websitePromoInput) {
                console.log(`[${jobId}] Using WEBSITE PROMO pipeline...`);
                return await this.processWebsitePromoJob(jobId, job);
            }

            // ============================================
            // STANDARD PIPELINE (Transcript-based)
            // ============================================

            // Step 1: Transcribe
            let transcript = job.transcript;
            if (!transcript) {
                await this.updateJobStatus(jobId, 'transcribing', 'Transcribing voice note...');
                transcript = await this.deps.transcriptionClient.transcribe(job.sourceAudioUrl);
                await this.deps.jobManager.updateJob(jobId, { transcript });
                this.logMemoryUsage('Step 1: Transcription');
            }

            console.log(`[${jobId}] TRANSCRIPT: "${transcript}"`);

            // Personal Clone: Collect voice sample for training if enabled
            const config = getConfig();
            if (config.featureFlags.personalCloneTrainingMode && transcript) {
                try {
                    const collector = new TrainingDataCollector();
                    await collector.collectVoiceSample(
                        job.sourceAudioUrl,
                        transcript,
                        job.targetDurationSeconds || 30 // Estimate if not set yet
                    );
                    console.log('[PersonalClone] Collected voice sample for training');
                } catch (err) {
                    console.warn('[PersonalClone] Failed to collect voice sample:', err);
                }
            }

            // Step 1.5: Detect reel mode (images vs animated video)
            // Use local variable to store result throughout this execution
            let detectionResult: { isAnimatedMode: boolean; storyline?: string } = { isAnimatedMode: false };

            // Only run detection if not already set in job (or if we want to re-run?)
            // For now, we run if not explicitly set.
            if (job.isAnimatedVideoMode === undefined) {
                await this.updateJobStatus(jobId, 'detecting_intent', 'Analyzing request for animation...');
                detectionResult = await this.deps.llmClient.detectReelMode(transcript);
                console.log(`[${jobId}] Reel Mode: ${detectionResult.isAnimatedMode ? 'ANIMATED VIDEO' : 'IMAGES'}`);

                await this.deps.jobManager.updateJob(jobId, {
                    isAnimatedVideoMode: detectionResult.isAnimatedMode
                });
            } else {
                detectionResult = { isAnimatedMode: job.isAnimatedVideoMode };
            }

            // Check forceMode early to determine if we should override animated mode for parable
            const refreshedJobForForceMode = await this.deps.jobManager.getJob(jobId);
            const forceMode = (refreshedJobForForceMode as any)?.forceMode;

            // CRITICAL FIX: Force IMAGE mode for parables because Kie.ai only supports 10s max videos
            // Parables need 36-46s which requires image-per-beat rendering, not single animated video
            if (forceMode === 'parable') {
                if (detectionResult.isAnimatedMode) {
                    console.log(`[${jobId}] OVERRIDE: Forcing IMAGE mode for parable (Kie.ai 10s limit incompatible with 36-46s parable)`);
                    detectionResult.isAnimatedMode = false;
                    await this.deps.jobManager.updateJob(jobId, { isAnimatedVideoMode: false });
                }
            }

            // Step 1.6: Detect content mode (direct-message vs parable)
            let contentMode: ContentMode = job.contentMode || 'direct-message';
            let parableScriptPlan: ParableScriptPlan | undefined = job.parableScriptPlan;
            let parableIntent: ParableIntent | undefined = job.parableIntent;

            // Refresh job to get latest state
            const jobForContentMode = await this.deps.jobManager.getJob(jobId);
            if (jobForContentMode) {
                contentMode = jobForContentMode.contentMode || contentMode;
                parableScriptPlan = jobForContentMode.parableScriptPlan;
                parableIntent = jobForContentMode.parableIntent;
            }

            // Determine content mode if not already set
            if (!contentMode || contentMode === 'direct-message') {
                // Check for explicit forceMode in job input
                const refreshedJob = await this.deps.jobManager.getJob(jobId);
                const forceMode = (refreshedJob as any)?.forceMode;

                if (forceMode === 'parable') {
                    contentMode = 'parable';
                    console.log(`[${jobId}] Content Mode: PARABLE (forced)`);
                } else if (forceMode === 'direct') {
                    contentMode = 'direct-message';
                    console.log(`[${jobId}] Content Mode: DIRECT-MESSAGE (forced)`);
                } else if (this.deps.llmClient.detectContentMode) {
                    // Auto-detect from transcript
                    try {
                        const contentModeResult = await this.deps.llmClient.detectContentMode(transcript);
                        contentMode = contentModeResult.contentMode;
                        console.log(`[${jobId}] Content Mode: ${contentMode.toUpperCase()} (detected: ${contentModeResult.reason})`);
                    } catch (err) {
                        console.warn(`[${jobId}] Content mode detection failed, defaulting to direct-message:`, err);
                        contentMode = 'direct-message';
                    }
                }

                await this.deps.jobManager.updateJob(jobId, { contentMode });
            }

            // Step 2: Plan reel (branched by content mode)
            let targetDurationSeconds = job.targetDurationSeconds;
            await this.updateJobStatus(jobId, 'planning', 'Planning reel structure...');

            console.log(`[${jobId}] Planning reel with range: ${job.targetDurationRange.min}s - ${job.targetDurationRange.max}s`);

            let plan: ReelPlan;
            let segmentContent: SegmentContent[] | undefined;

            if (contentMode === 'parable' && this.deps.llmClient.extractParableIntent && this.deps.llmClient.generateParableScript) {
                // PARABLE MODE PIPELINE
                console.log(`[${jobId}] Using PARABLE pipeline...`);

                try {
                    // Step 2a: Extract parable intent
                    if (!parableIntent) {
                        parableIntent = await this.deps.llmClient.extractParableIntent(transcript);
                        await this.deps.jobManager.updateJob(jobId, { parableIntent });
                        console.log(`[${jobId}] Parable intent: theme="${parableIntent.coreTheme}", type="${parableIntent.sourceType}"`);
                    }

                    // Step 2b: Choose story source (if theme-only)
                    let sourceChoice = parableScriptPlan?.sourceChoice;
                    if (!sourceChoice && parableIntent.sourceType === 'theme-only' && this.deps.llmClient.chooseParableSource) {
                        sourceChoice = await this.deps.llmClient.chooseParableSource(parableIntent);
                        console.log(`[${jobId}] Parable source: culture="${sourceChoice.culture}", archetype="${sourceChoice.archetype}"`);
                    } else if (!sourceChoice) {
                        sourceChoice = {
                            culture: parableIntent.culturalPreference || 'generic-eastern',
                            archetype: 'sage',
                            rationale: 'Default selection from intent'
                        };
                    }

                    // Step 2c: Generate parable script
                    const targetDuration = Math.min(job.targetDurationRange.max, 40); // Parables target 25-40s
                    parableScriptPlan = await this.deps.llmClient.generateParableScript(
                        parableIntent,
                        sourceChoice,
                        targetDuration
                    );
                    await this.deps.jobManager.updateJob(jobId, { parableScriptPlan });
                    console.log(`[${jobId}] Parable script generated with ${parableScriptPlan.beats.length} beats`);

                    // Convert parable beats to standard SegmentContent
                    segmentContent = parableScriptPlan.beats.map((beat: ParableBeat) => ({
                        commentary: beat.narration,
                        imagePrompt: beat.imagePrompt,
                        caption: beat.textOnScreen
                    }));

                    // Create a compatible plan object for downstream processing
                    plan = {
                        targetDurationSeconds: parableScriptPlan.beats.reduce((sum: number, b: ParableBeat) => sum + b.approxDurationSeconds, 0),
                        segmentCount: parableScriptPlan.beats.length,
                        musicTags: ['ambient', 'spiritual', 'meditative', 'eastern'],
                        musicPrompt: `Ambient meditative music for a ${sourceChoice.culture} ${sourceChoice.archetype} story`,
                        mood: 'contemplative',
                        summary: `A ${sourceChoice.archetype} story about ${parableIntent.coreTheme}`,
                        mainCaption: parableIntent.moral
                    };

                } catch (err) {
                    // Fallback to direct-message mode on parable failure
                    console.warn(`[${jobId}] Parable pipeline failed, falling back to direct-message:`, err);
                    contentMode = 'direct-message';
                    await this.deps.jobManager.updateJob(jobId, { contentMode: 'direct-message' });

                    // Fall through to normal planning
                    plan = await this.deps.llmClient.planReel(transcript, {
                        minDurationSeconds: job.targetDurationRange.min,
                        maxDurationSeconds: job.targetDurationRange.max,
                        moodOverrides: job.moodOverrides,
                    });
                }
            } else {
                // DIRECT-MESSAGE MODE PIPELINE (existing behavior)
                plan = await this.deps.llmClient.planReel(transcript, {
                    minDurationSeconds: job.targetDurationRange.min,
                    maxDurationSeconds: job.targetDurationRange.max,
                    moodOverrides: job.moodOverrides,
                });
            }

            console.log(`[${jobId}] LLM Initial Plan: target=${plan.targetDurationSeconds}s, segments=${plan.segmentCount}`);

            // Phase 2: Hook & Structure Optimization
            if (this.deps.hookAndStructureService) {
                try {
                    console.log(`[${jobId}] Optimizing structure & hooks...`);
                    const hookPlan = await this.deps.hookAndStructureService.optimizeStructure(transcript, plan, job.trendContext, job.reelMode);

                    await this.deps.jobManager.updateJob(jobId, {
                        hookPlan,
                        targetDurationSeconds: hookPlan.targetDurationSeconds,
                        // Combine hook with planning caption as a fallback
                        mainCaption: `${hookPlan.chosenHook}\n\n${plan.mainCaption}`
                    });

                    // Update local plan with optimized values for logic below
                    // CRITICAL: DO NOT override plan.segmentCount - it was strictly enforced in planReel.
                    // The hook plan can suggest a different count, but that leads to drift and LLM failures.
                    plan.targetDurationSeconds = hookPlan.targetDurationSeconds;

                    console.log(`[${jobId}] Optimization complete: target=${plan.targetDurationSeconds}s, segments=${plan.segmentCount} (enforced, hookPlan suggested ${hookPlan.segmentCount})`);
                } catch (err) {
                    console.warn(`[${jobId}] Hook optimization failed, using default plan:`, err);
                }
            }

            await this.deps.jobManager.updateJob(jobId, {
                targetDurationSeconds: plan.targetDurationSeconds,
                mainCaption: plan.mainCaption
            });
            this.logMemoryUsage('Step 2: Planning');

            // Step 3: Generate commentary (skip if already generated from parable pipeline)
            let segments = job.segments;
            if (!segments || segments.length === 0 || !segments[0].commentary) {
                await this.updateJobStatus(jobId, 'generating_commentary', 'Writing commentary...');

                // Use pre-generated segment content from parable pipeline if available
                if (!segmentContent) {
                    segmentContent = await this.deps.llmClient.generateSegmentContent(plan, transcript);
                }

                // Personal Clone: Collect text samples for training if enabled
                if (config.featureFlags.personalCloneTrainingMode && segmentContent) {
                    try {
                        const collector = new TrainingDataCollector();
                        for (const segment of (Array.isArray(segmentContent) ? segmentContent : [])) {
                            if (segment.commentary) {
                                await collector.collectTextSample(segment.commentary, 'commentary');
                            }
                        }
                        console.log('[PersonalClone] Collected text samples for training');
                    } catch (err) {
                        console.warn('[PersonalClone] Failed to collect text samples:', err);
                    }
                }

                // VALIDATION: Ensure the LLM returned exactly the number of segments we planned for.
                // Skip validation for parable mode since segments are pre-generated with 4 beats
                // and plan.segmentCount is already set correctly from parableScriptPlan
                const isParablePreGenerated = contentMode === 'parable' && parableScriptPlan;
                if (!isParablePreGenerated) {
                    this.validateSegmentCount(segmentContent, plan.segmentCount, 'Initial Generation');
                } else {
                    console.log(`[${jobId}] Skipping segment validation for parable mode (${segmentContent.length} beats)`);
                }

                segmentContent = await this.adjustCommentaryIfNeeded(plan, segmentContent);

                // VALIDATION: Ensure the adjustment step didn't truncate segments either.
                // Skip for parable mode as well
                if (!isParablePreGenerated) {
                    this.validateSegmentCount(segmentContent, plan.segmentCount, 'Adjustment Phase');
                }

                // Step 4: Synthesize voiceover
                await this.updateJobStatus(jobId, 'synthesizing_voiceover', 'Creating voiceover...');
                const fullCommentary = segmentContent.map((s) => s.commentary).join(' ');
                const { voiceoverUrl, voiceoverDuration, speed } = await this.synthesizeWithAdjustment(
                    fullCommentary,
                    plan.targetDurationSeconds,
                    job.voiceId
                );
                console.log(`[${jobId}] Voiceover generated: duration=${voiceoverDuration}s`);

                await this.deps.jobManager.updateJob(jobId, {
                    fullCommentary,
                    voiceoverUrl,
                    voiceoverDurationSeconds: voiceoverDuration,
                });

                // Step 5: Build segments with timing
                segments = this.buildSegments(segmentContent, voiceoverDuration);
                await this.deps.jobManager.updateJob(jobId, { segments });

                this.logMemoryUsage('Steps 3-5: Content & Voiceover');
            }

            // Step 5.5: Phase 2 Caption & Hashtag Optimization (Ensured even on resume/salvage)
            const jobAfterSegments = await this.deps.jobManager.getJob(jobId);

            // DEBUG: Log caption generation conditions
            console.log(`[${jobId}] Caption Debug: jobAfterSegments=${!!jobAfterSegments}, captionBody=${!!jobAfterSegments?.captionBody}, hashtags=${jobAfterSegments?.hashtags?.length || 0}, contentMode=${contentMode}, hasParableScript=${!!parableScriptPlan}`);

            if (jobAfterSegments && (!jobAfterSegments.captionBody || !jobAfterSegments.hashtags || jobAfterSegments.hashtags.length === 0)) {
                try {
                    // For parable mode, use specialized caption generation
                    if (contentMode === 'parable' && parableScriptPlan && this.deps.llmClient.generateParableCaptionAndTags) {
                        console.log(`[${jobId}] Generating parable-optimized caption & hashtags...`);
                        const summary = parableScriptPlan.parableIntent.coreTheme;
                        const captionResult = await this.deps.llmClient.generateParableCaptionAndTags(parableScriptPlan, summary);

                        // DEBUG: Log generated hashtags
                        console.log(`[${jobId}] Caption generated: body=${captionResult.captionBody.length} chars, hashtags=${JSON.stringify(captionResult.hashtags)}`);

                        await this.deps.jobManager.updateJob(jobId, {
                            captionBody: captionResult.captionBody,
                            hashtags: captionResult.hashtags
                        });
                        console.log(`[${jobId}] Parable caption complete: ${captionResult.hashtags.length} hashtags`);
                    } else if (this.deps.captionService) {
                        // Fallback to generic caption service
                        const fullCommentary = jobAfterSegments.fullCommentary ||
                            (jobAfterSegments.segments?.map(s => s.commentary).join(' ')) ||
                            jobAfterSegments.transcript; // CRITICAL: Use transcript as fallback

                        if (fullCommentary) {
                            console.log(`[${jobId}] Generating optimized caption & hashtags...`);
                            const captionResult = await this.deps.captionService.generateCaption(fullCommentary, plan.summary);
                            await this.deps.jobManager.updateJob(jobId, {
                                captionBody: captionResult.captionBody,
                                hashtags: captionResult.hashtags
                            });
                            console.log(`[${jobId}] Caption optimization complete: ${captionResult.hashtags.length} hashtags`);
                        } else {
                            // LAST RESORT: Generate hashtags even without content
                            console.warn(`[${jobId}] No fullCommentary or transcript, generating default hashtags`);
                            const defaultHashtags = ['#ChallengingView', '#spirituality', '#reels', '#growth', '#selfawareness', '#mentalhealth', '#selfinquiry', '#shadowwork', '#psychology', '#mindset'];
                            await this.deps.jobManager.updateJob(jobId, {
                                hashtags: defaultHashtags
                            });
                        }
                    } else {
                        // DEBUG: Log why caption was not generated
                        console.warn(`[${jobId}] Caption NOT generated: contentMode=${contentMode}, hasParableScript=${!!parableScriptPlan}, hasCaptionService=${!!this.deps.captionService}`);
                    }
                } catch (err) {
                    console.warn(`[${jobId}] Caption optimization failed:`, err);
                }
            } else {
                console.log(`[${jobId}] Skipping caption generation: already has captionBody=${!!jobAfterSegments?.captionBody}, hashtags=${jobAfterSegments?.hashtags?.length || 0}`);
            }

            // Refresh job object
            const currentJob = await this.deps.jobManager.getJob(jobId);
            if (!currentJob) throw new Error('Job disappeared');

            const voiceoverUrl = currentJob.voiceoverUrl!;
            const voiceoverDuration = currentJob.voiceoverDurationSeconds!;

            // Step 6: Select music (optional)
            let musicUrl = currentJob.musicUrl;
            let musicDurationSeconds = currentJob.musicDurationSeconds || 0;
            if (!musicUrl) {
                await this.updateJobStatus(jobId, 'selecting_music', 'Finding background music...');
                const musicResult = await this.deps.musicSelector.selectMusic(
                    plan.musicTags,
                    voiceoverDuration,
                    plan.musicPrompt
                );
                if (musicResult) {
                    musicUrl = musicResult.track.audioUrl;
                    musicDurationSeconds = musicResult.track.durationSeconds;
                    await this.deps.jobManager.updateJob(jobId, {
                        musicUrl,
                        musicSource: musicResult.source,
                        musicDurationSeconds
                    });
                }
                this.logMemoryUsage('Step 6: Music');
            }

            // Step 7: Visuals (Images or Animated Video)
            // PARABLES: Always use image mode (proven method for faceless content)
            // Each beat gets one image with Ken Burns effect
            const isParableContent = contentMode === 'parable';
            const isAnimated = currentJob.isAnimatedVideoMode && !isParableContent;

            if (isParableContent) {
                console.log(`[${jobId}] Parable mode: Using IMAGE rendering (4 beats → 4 images + Ken Burns)`);
            }

            if (isAnimated && this.deps.animatedVideoClient) {
                // Animated Video Path
                const hasExistingVideos = (currentJob.animatedVideoUrls && currentJob.animatedVideoUrls.length > 0) || !!currentJob.animatedVideoUrl;

                if (!hasExistingVideos) {
                    await this.updateJobStatus(jobId, 'generating_animated_video', 'Generating animated video...');

                    // Check if this is a parable with beats - generate one video per beat
                    if (isParableContent && parableScriptPlan && parableScriptPlan.beats && parableScriptPlan.beats.length > 0) {
                        // MULTI-CLIP PARABLE MODE: Generate one video per beat
                        console.log(`[${jobId}] Parable mode: Generating ${parableScriptPlan.beats.length} video clips (one per beat)...`);

                        const videoUrls: string[] = [];
                        const kieMaxDuration = 10; // Kie.ai max duration per clip

                        for (let i = 0; i < parableScriptPlan.beats.length; i++) {
                            const beat = parableScriptPlan.beats[i];
                            const beatDuration = Math.min(beat.approxDurationSeconds || 10, kieMaxDuration);

                            console.log(`[${jobId}] Generating beat ${i + 1}/${parableScriptPlan.beats.length} (${beat.role}): ${beatDuration}s`);

                            // Use beat's visual prompt as the video theme
                            const animatedResult = await this.deps.animatedVideoClient.generateAnimatedVideo({
                                durationSeconds: beatDuration,
                                theme: beat.textOnScreen || beat.narration.substring(0, 100),
                                storyline: beat.narration,
                                mood: beat.role === 'moral' ? 'inspiring' : beat.role === 'turn' ? 'dramatic' : 'contemplative',
                            });

                            let videoUrl = animatedResult.videoUrl;

                            // Persist each video to storage
                            if (this.deps.storageClient) {
                                try {
                                    console.log(`[${jobId}] Persisting beat ${i + 1} video to Cloudinary...`);
                                    const uploadResult = await this.deps.storageClient.uploadVideo(videoUrl, {
                                        folder: 'instagram-reels/parable-clips',
                                        publicId: `parable_${jobId}_beat${i + 1}_${Date.now()}`
                                    });
                                    videoUrl = uploadResult.url;
                                } catch (err) {
                                    console.error(`[${jobId}] Failed to persist beat ${i + 1} video:`, err);
                                }
                            }

                            videoUrls.push(videoUrl);
                        }

                        // Store all video URLs
                        await this.deps.jobManager.updateJob(jobId, {
                            animatedVideoUrls: videoUrls
                        });
                        currentJob.animatedVideoUrls = videoUrls;
                        console.log(`[${jobId}] Parable multi-clip complete: ${videoUrls.length} videos generated`);

                    } else {
                        // MULTI-CLIP MODE FOR ALL ANIMATED VIDEOS (no looping)
                        // Calculate how many clips needed based on duration
                        const kieMaxDuration = 10;
                        const clipsNeeded = Math.ceil(voiceoverDuration / kieMaxDuration);
                        const clipDuration = voiceoverDuration / clipsNeeded;

                        console.log(`[${jobId}] Multi-clip mode: ${clipsNeeded} clips x ${clipDuration.toFixed(1)}s = ${voiceoverDuration}s total`);

                        const videoUrls: string[] = [];

                        for (let i = 0; i < clipsNeeded; i++) {
                            const clipNum = i + 1;
                            console.log(`[${jobId}] Generating clip ${clipNum}/${clipsNeeded}: ${clipDuration.toFixed(1)}s`);

                            // Vary the prompt slightly for each clip to avoid identical videos
                            const clipPrompt = segments && segments[i]
                                ? segments[i].commentary.substring(0, 100)
                                : `${plan.summary || plan.mainCaption} - Part ${clipNum}`;

                            const animatedResult = await this.deps.animatedVideoClient.generateAnimatedVideo({
                                durationSeconds: Math.min(clipDuration, kieMaxDuration),
                                theme: clipPrompt,
                                storyline: detectionResult.storyline,
                                mood: plan.mood,
                            });

                            let videoUrl = animatedResult.videoUrl;

                            // Persist each clip
                            if (this.deps.storageClient) {
                                try {
                                    console.log(`[${jobId}] Persisting clip ${clipNum} to Cloudinary...`);
                                    const uploadResult = await this.deps.storageClient.uploadVideo(videoUrl, {
                                        folder: 'instagram-reels/animated-clips',
                                        publicId: `anim_${jobId}_clip${clipNum}_${Date.now()}`
                                    });
                                    videoUrl = uploadResult.url;
                                } catch (err) {
                                    console.error(`[${jobId}] Failed to persist clip ${clipNum}:`, err);
                                }
                            }

                            videoUrls.push(videoUrl);
                        }

                        // Store all video URLs
                        await this.deps.jobManager.updateJob(jobId, {
                            animatedVideoUrls: videoUrls
                        });
                        currentJob.animatedVideoUrls = videoUrls;
                        console.log(`[${jobId}] Multi-clip complete: ${videoUrls.length} videos generated`);
                    }
                } else {
                    console.log(`[${jobId}] Using pre-existing animated video(s). Skipping generation.`);
                }
            } else {
                // Image Path (Existing)
                // Check if ANY image is missing
                const needsImages = segments.some(s => !s.imageUrl);
                if (needsImages) {
                    await this.updateJobStatus(jobId, 'generating_images', 'Creating visuals...');
                    segments = await this.generateImages(segments, jobId);
                    await this.deps.jobManager.updateJob(jobId, { segments });
                    this.logMemoryUsage('Step 7: Images');
                }
            }

            // Step 8: Generate subtitles
            let subtitlesUrl = currentJob.subtitlesUrl;
            if (!subtitlesUrl) {
                await this.updateJobStatus(jobId, 'generating_subtitles', 'Creating subtitles...');
                const result = await this.deps.subtitlesClient.generateSubtitles(voiceoverUrl);
                subtitlesUrl = result.subtitlesUrl;
                await this.deps.jobManager.updateJob(jobId, { subtitlesUrl });
                this.logMemoryUsage('Step 8: Subtitles');
            }

            // Step 9: Build manifest
            let manifest = currentJob.manifest;
            if (!manifest) {
                await this.updateJobStatus(jobId, 'building_manifest', 'Preparing render manifest...');
                const hasAnimatedVideo = !!currentJob.animatedVideoUrl || (currentJob.animatedVideoUrls && currentJob.animatedVideoUrls.length > 0);
                manifest = createReelManifest({
                    durationSeconds: voiceoverDuration,
                    segments: hasAnimatedVideo ? undefined : segments,
                    animatedVideoUrl: currentJob.animatedVideoUrl,
                    animatedVideoUrls: currentJob.animatedVideoUrls,
                    voiceoverUrl,
                    musicUrl: musicUrl,
                    musicDurationSeconds: musicDurationSeconds || voiceoverDuration,
                    subtitlesUrl: subtitlesUrl || '',
                });
                await this.deps.jobManager.updateJob(jobId, { manifest });
            }

            // Step 10: Render video
            await this.updateJobStatus(jobId, 'rendering', 'Rendering final video...');
            this.logMemoryUsage('Starting Step 10: Rendering');
            const { videoUrl } = await this.deps.videoRenderer.render(manifest);
            this.logMemoryUsage('Step 10: Finished Rendering');

            // CRITICAL: Upload to Cloudinary for permanent storage
            // Shotstack URLs expire after 24 hours, causing Instagram API failures
            let permanentVideoUrl = videoUrl;
            if (this.deps.storageClient) {
                try {
                    await this.updateJobStatus(jobId, 'uploading', 'Uploading to permanent storage...');
                    console.log(`[${jobId}] Uploading final video to Cloudinary for permanent storage...`);
                    const uploadResult = await this.deps.storageClient.uploadVideo(videoUrl, {
                        folder: 'instagram-reels/final-videos',
                        publicId: `reel_${jobId}_${Date.now()}`,
                        resourceType: 'video'
                    });
                    permanentVideoUrl = uploadResult.url;
                    console.log(`[${jobId}] Video uploaded successfully: ${permanentVideoUrl}`);

                    // Wait for CDN propagation before triggering webhook
                    // Instagram API can be picky if the URL returns 404/403 even for a moment
                    console.log(`[${jobId}] Waiting 5s for final video propagation...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } catch (uploadError) {
                    console.error(`[${jobId}] Failed to upload video to Cloudinary, using Shotstack URL (may expire):`, uploadError);
                    // Continue with Shotstack URL if Cloudinary upload fails
                }
            } else {
                console.warn(`[${jobId}] No storage client configured - using temporary Shotstack URL (expires in 24h)`);
            }

            // Complete the job
            const completedJob = await this.deps.jobManager.updateJob(jobId, {
                status: 'completed',
                finalVideoUrl: permanentVideoUrl,
                currentStep: undefined,
            });

            // Notify callback if present
            if (completedJob && completedJob.callbackUrl) {
                await this.notifyCallback(completedJob);
            }

            // Step 11: Phase 2 Record Analytics (Target vs Actual)
            if (completedJob && this.deps.growthInsightsService) {
                try {
                    await this.deps.growthInsightsService.recordAnalytics({
                        reelId: jobId,
                        hookUsed: completedJob.hookPlan?.chosenHook || 'None',
                        targetDurationSeconds: completedJob.targetDurationSeconds || 0,
                        actualDurationSeconds: completedJob.voiceoverDurationSeconds || 0,
                        postedAt: new Date().toISOString()
                    });
                    console.log(`[${jobId}] Post-run analytics recorded.`);
                } catch (err) {
                    console.warn(`[${jobId}] Failed to record post-run analytics:`, err);
                }
            }

            // Send success notification to Telegram
            if (completedJob && completedJob.telegramChatId && this.deps.notificationClient) {
                await this.deps.notificationClient.sendNotification(
                    completedJob.telegramChatId,
                    `✅ *Your reel is ready!*\n\nProcessing took ${Math.round((completedJob.updatedAt.getTime() - completedJob.createdAt.getTime()) / 1000)}s.\n\nThe video has been sent to your automation workflow.`
                );
            }

            return completedJob!;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await this.deps.jobManager.failJob(jobId, errorMessage);

            // Send error notification to Telegram
            const jobForError = await this.deps.jobManager.getJob(jobId);
            if (jobForError && jobForError.telegramChatId && this.deps.notificationClient) {
                const friendlyError = this.getFriendlyErrorMessage(errorMessage);
                await this.deps.notificationClient.sendNotification(
                    jobForError.telegramChatId,
                    `❌ *Oops! Something went wrong*\n\n${friendlyError}\n\nPlease try again or contact support if the issue persists.`
                );
            }

            throw error;
        }
    }

    /**
     * Adjusts commentary length if needed to match target duration.
     */
    private async adjustCommentaryIfNeeded(
        plan: ReelPlan,
        segmentContent: SegmentContent[]
    ): Promise<SegmentContent[]> {
        const fullText = segmentContent.map((s) => s.commentary).join(' ');
        const estimate = estimateSpeakingDuration(fullText);
        const adjustment = needsTextAdjustment(estimate.estimatedSeconds, plan.targetDurationSeconds);

        if (adjustment === 'ok') {
            return segmentContent;
        }

        return this.deps.llmClient.adjustCommentaryLength(
            segmentContent,
            adjustment,
            plan.targetDurationSeconds
        );
    }

    /**
     * Strictly validates that the LLM returned the expected number of segments.
     * This prevents "Strategic Collapse" where a 12-segment plan becomes a 1-segment video.
     */
    private validateSegmentCount(segments: SegmentContent[], expected: number, stage: string): void {
        if (!Array.isArray(segments)) {
            throw new Error(`[${stage}] LLM returned non-array segment content: ${typeof segments}`);
        }

        if (segments.length !== expected) {
            throw new Error(
                `[${stage}] Segment count mismatch: Planned ${expected} segments, but LLM returned ${segments.length}. ` +
                `This safety guard prevents generating a truncated (e.g. 5-second) video.`
            );
        }

        // Additional sanity check: ensure no empty commentaries
        for (let i = 0; i < segments.length; i++) {
            if (!segments[i].commentary || segments[i].commentary.trim().length < 5) {
                throw new Error(`[${stage}] Segment ${i + 1} has missing or too-short commentary.`);
            }
        }
    }

    /**
     * Synthesizes voiceover with optional speed adjustment.
     */
    private async synthesizeWithAdjustment(
        text: string,
        targetDuration: number,
        voiceId?: string
    ): Promise<{ voiceoverUrl: string; voiceoverDuration: number; speed: number }> {
        // First pass at normal speed
        let result: any;
        let speed = 1.0;

        try {
            console.log(`[TTS] Attempting synthesis with primary client (Fish Audio)...${voiceId ? ` (Voice: ${voiceId})` : ''}`);
            result = await this.deps.ttsClient.synthesize(text, { voiceId });
        } catch (error: any) {
            console.error('[TTS] ❌ Primary TTS (Fish Audio) failed. Falling back to OpenAI.');
            console.error(`[TTS] Error Details: ${error.message}`);
            if (error.response) {
                console.error(`[TTS] Status: ${error.response.status}`);
                console.error(`[TTS] Data: ${JSON.stringify(error.response.data)}`);
            }

            if (this.deps.fallbackTTSClient) {
                console.warn('[TTS] ⚠️ Using fallback TTS client...');
                result = await this.deps.fallbackTTSClient.synthesize(text);
            } else {
                throw error;
            }
        }

        // Check if we need speed adjustment
        const diff = Math.abs(result.durationSeconds - targetDuration);
        if (diff > 1.5) {
            speed = calculateSpeedAdjustment(result.durationSeconds, targetDuration);
            if (speed !== 1.0) {
                try {
                    console.log(`[TTS] Applying speed adjustment (${speed.toFixed(2)}x) with pitch 0.9...`);
                    result = await this.deps.ttsClient.synthesize(text, { speed, pitch: 0.9, voiceId });
                } catch (error: any) {
                    console.warn('[TTS] ⚠️ Primary TTS speed adjustment failed:', error.message);

                    if (this.deps.fallbackTTSClient) {
                        console.log('[TTS] Trying fallback client for speed adjustment with pitch 0.9...');
                        result = await this.deps.fallbackTTSClient.synthesize(text, { speed, pitch: 0.9 });
                    } else {
                        console.warn('[TTS] No fallback available for adjustment, returning original.');
                    }
                }
            }
        }

        // CRITICAL: Upload to Cloudinary if TTS returned a data URL
        let voiceoverUrl = result.audioUrl;
        if (voiceoverUrl.startsWith('data:') && this.deps.storageClient) {
            console.log('[Voiceover] Uploading base64 audio to Cloudinary...');
            try {
                const uploadResult = await this.deps.storageClient.uploadAudio(voiceoverUrl, {
                    folder: 'instagram-reels/voiceovers',
                    publicId: `voiceover_${Date.now()}`
                });
                voiceoverUrl = uploadResult.url;
                console.log('[Voiceover] Uploaded successfully:', voiceoverUrl);
            } catch (uploadError) {
                console.error('[Voiceover] Cloudinary upload failed, using data URL (may cause API issues):', uploadError);
            }
        }

        return {
            voiceoverUrl,
            voiceoverDuration: result.durationSeconds,
            speed,
        };
    }

    /**
     * Builds segments with proper timing.
     */
    private buildSegments(content: SegmentContent[], totalDuration: number): Segment[] {
        const segmentDuration = totalDuration / content.length;
        const timings = calculateSegmentTimings(Array(content.length).fill(segmentDuration));

        return content.map((c, index) =>
            createSegment({
                index,
                startSeconds: timings[index].start,
                endSeconds: timings[index].end,
                commentary: c.commentary,
                imagePrompt: c.imagePrompt,
                caption: c.caption,
            })
        );
    }

    /**
     * Generates images for all segments.
     */
    private async generateImages(segments: Segment[], jobId: string): Promise<Segment[]> {
        console.log(`Generating images for ${segments.length} segments...`);

        // Reset OpenRouter sequence for new job
        if (this.deps.primaryImageClient && 'resetSequence' in this.deps.primaryImageClient) {
            (this.deps.primaryImageClient as any).resetSequence();
        }

        const results: Segment[] = [];
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const index = i;

            try {
                let finalImageUrl = '';

                // Try primary image client (OpenRouter) first, with fallback to DALL-E
                if (this.deps.primaryImageClient) {
                    try {
                        await this.updateJobStatus(jobId, 'generating_images', `Creating visual ${index + 1} of ${segments.length}...`);
                        const { imageUrl } = await this.deps.primaryImageClient.generateImage(segment.imagePrompt);
                        finalImageUrl = imageUrl;
                    } catch (primaryError) {
                        console.warn(`Primary image client failed for segment ${index}, falling back to secondary client:`, primaryError);
                        const { imageUrl } = await this.deps.fallbackImageClient.generateImage(segment.imagePrompt);
                        finalImageUrl = imageUrl;
                    }
                } else {
                    // No primary client, use DALL-E directly
                    const { imageUrl } = await this.deps.fallbackImageClient.generateImage(segment.imagePrompt);
                    finalImageUrl = imageUrl;
                }

                // IMPORTANT: Upload to Cloudinary to avoid "Payload Too Large" and ensure permanent URLs
                if (this.deps.storageClient && finalImageUrl) {
                    try {
                        const uploadResult = await this.deps.storageClient.uploadImage(finalImageUrl, {
                            folder: `instagram-reels/images/${jobId}`,
                            publicId: `seg_${index}_${Date.now()}`
                        });
                        finalImageUrl = uploadResult.url;
                    } catch (uploadError) {
                        console.warn('Failed to upload image to Cloudinary, using original URL:', uploadError);
                    }
                }

                results.push({ ...segment, imageUrl: finalImageUrl });
            } catch (error) {
                console.error(`Image generation failed for segment ${index} (both primary and fallback):`, error);
                throw error; // Only throw if BOTH primary and fallback failed
            }
        }



        // Add a small delay to ensure Cloudinary assets are propagated to CDNs
        // This prevents "Asset URL not downloadable" errors from Shotstack
        if (this.deps.storageClient) {
            console.log('Waiting 2s for asset propagation...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return results;
    }

    /**
     * Converts technical error messages to user-friendly ones.
     */
    private getFriendlyErrorMessage(error: string): string {
        if (error.includes('transcribe') || error.includes('Whisper')) {
            return 'I could not understand the audio. Please try recording again with less background noise.';
        }
        if (error.includes('OpenAI') || error.includes('API key')) {
            return 'There was an issue connecting to our AI services. Please try again in a moment.';
        }
        if (error.includes('music') || error.includes('track')) {
            return 'I could not find suitable background music. Please try again.';
        }
        if (error.includes('image') || error.includes('DALL-E')) {
            return 'I had trouble generating images for your reel. Please try again.';
        }
        if (error.includes('render') || error.includes('video')) {
            return 'The video rendering failed. Please try again.';
        }
        if (error.includes('duration') || error.includes('too short') || error.includes('too long')) {
            return 'Your voice note is either too short or too long. Please keep it between 10-90 seconds.';
        }
        return 'An unexpected error occurred. Our team has been notified.';
    }

    /**
     * Updates job status with logging.
     */
    private updateJobStatus(jobId: string, status: ReelJob['status'], step: string): void {
        console.log(`[${jobId}] ${status}: ${step}`);
        this.deps.jobManager.updateStatus(jobId, status, step);
    }

    /**
     * Sends a webhook notification to the callbackUrl.
     */
    private async notifyCallback(job: ReelJob): Promise<void> {
        if (!job.callbackUrl) return;

        // CRITICAL: Only send callback if we have a valid video URL
        // Make.com validation rejects empty strings as "missing values"
        if (job.status === 'completed' && !job.finalVideoUrl) {
            console.warn(`[${job.id}] Skipping callback - job completed but no video URL available`);
            return;
        }

        try {
            console.log(`[${job.id}] Notifying callback: ${job.callbackUrl}`);

            // Make.com requires x-make-apikey header
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-make-apikey': '4LyPD8E3TVRmh_F'
            };

            // Generate a caption:
            // 1. Try global mainCaption (Primary)
            // 2. Try FIRST segment's "caption" field (Fallback 1)
            // 3. Fallback to Source Transcript (Topic based)
            // 4. Last resort: Commentary summary
            let caption = 'New reel ready!';
            if (job.mainCaption) {
                caption = job.mainCaption;
            } else if (job.segments && job.segments.length > 0 && job.segments[0].caption) {
                caption = job.segments[0].caption;
            } else if (job.transcript) {
                console.warn(`[${job.id}] ⚠️ Missing main caption, falling back to transcript summary.`);
                caption = job.transcript.substring(0, 150) + '...';
            } else if (job.fullCommentary) {
                console.warn(`[${job.id}] ⚠️ Missing caption, falling back to commentary.`);
                caption = job.fullCommentary.substring(0, 150) + '...';
            }

            // Build payload - only include video_url if we have a valid URL
            // CRITICAL: Combine caption body WITH hashtags for Instagram
            const hashtagString = job.hashtags ? job.hashtags.join(' ') : '';
            const fullCaption = job.captionBody
                ? `${job.captionBody}\n\n${hashtagString}`.trim()
                : `${caption}\n\n${hashtagString}`.trim();

            const payload: any = {
                jobId: job.id,
                status: job.status,
                caption: fullCaption, // COMBINED: caption body + hashtags for Instagram
                hashtags: hashtagString, // Separate field for reference
                captionBody: job.captionBody, // Just the body for reference
                originalHashtags: job.hashtags, // Array for reference
            };

            // Add video URL only if present (Make.com validates this field)
            if (job.finalVideoUrl) {
                payload.video_url = job.finalVideoUrl;
                payload.url = job.finalVideoUrl; // Alias for flexibility
                payload.videoUrl = job.finalVideoUrl; // Alias for camelCase consumers
            }

            // Add error only if present
            if (job.error) {
                payload.error = job.error;
            }

            // Add metadata
            payload.metadata = {
                duration: job.voiceoverDurationSeconds,
                createdAt: job.createdAt,
                completedAt: job.updatedAt,
                mainCaption: job.mainCaption,
                hook: job.hookPlan?.chosenHook,
                // Parable mode metadata
                contentMode: job.contentMode,
                parableTheme: job.parableIntent?.coreTheme,
                parableCulture: job.parableScriptPlan?.sourceChoice?.culture,
            };

            console.log(`[${job.id}] Sending callback payload:`, JSON.stringify(payload, null, 2));

            await axios.post(job.callbackUrl, payload, { headers });

            console.log(`[${job.id}] Callback notification sent successfully`);
        } catch (error) {
            console.error(`[${job.id}] Failed to notify callback:`, error);
            // We don't throw here to avoid failing the job processing just because the callback failed
        }
    }

    /**
     * Processes a website promo reel job.
     * Orchestrates: scrape → detect category → generate script → render.
     */
    private async processWebsitePromoJob(jobId: string, job: ReelJob): Promise<ReelJob> {
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
            return await this.handlePromoJobError(jobId, job, error);
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

        const websiteAnalysis = await this.deps.websiteScraperClient.scrapeWebsite(websiteUrl);
        await this.deps.jobManager.updateJob(jobId, { websiteAnalysis });
        console.log(`[${jobId}] Website scraped: hero="${websiteAnalysis.heroText}"`);

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
            throw new Error('LLMClient.generatePromoScript is required for website promo mode');
        }

        const promoScript = await this.deps.llmClient.generatePromoScript(
            websiteAnalysis, category, template, businessName, websiteInput.language || 'en'
        );
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
        const promoVoiceId = job.voiceId || config.fishAudioPromoVoiceId;
        const assets = await this.preparePromoAssets(jobId, segmentContent, fullCommentary, targetDuration, category, promoScript, promoVoiceId);

        // Build manifest
        const manifest = createReelManifest({
            durationSeconds: assets.voiceoverDuration,
            voiceoverUrl: assets.voiceoverUrl,
            musicDurationSeconds: assets.musicDurationSeconds,
            segments: assets.segmentsWithImages,
            subtitlesUrl: '', // Disabled for promo
        });

        // Finalize and return completed job
        return await this.finalizePromoJob(jobId, job, manifest, category, businessName);
    }

    /**
     * Converts promo scenes to standard segment content format.
     */
    private convertPromoScenesToSegments(promoScript: PromoScriptPlan): SegmentContent[] {
        return promoScript.scenes.map((scene: PromoSceneContent) => ({
            commentary: scene.narration,
            imagePrompt: scene.imagePrompt,
            caption: scene.subtitle,
        }));
    }

    private async preparePromoAssets(
        jobId: string,
        segmentContent: SegmentContent[],
        fullCommentary: string,
        targetDuration: number,
        category: BusinessCategory,
        promoScript?: PromoScriptPlan,
        voiceId?: string
    ) {
        // Synthesize voiceover
        await this.updateJobStatus(jobId, 'synthesizing_voiceover', 'Creating voiceover...');
        const { voiceoverUrl, voiceoverDuration } = await this.synthesizeWithAdjustment(fullCommentary, targetDuration, voiceId);
        await this.deps.jobManager.updateJob(jobId, { voiceoverUrl, voiceoverDurationSeconds: voiceoverDuration, fullCommentary });

        // Select music
        await this.updateJobStatus(jobId, 'selecting_music', 'Selecting background music...');
        const musicStyle = getMusicStyle(category);
        const musicContext = promoScript ? `Business: ${promoScript.businessName}, Category: ${category}, Tone: ${promoScript.musicStyle}` : `${category} promo`;
        const musicResult = await this.deps.musicSelector.selectMusic([musicStyle], voiceoverDuration, musicContext);
        const musicUrl = musicResult?.track?.audioUrl;
        const musicDurationSeconds = musicResult?.track?.durationSeconds;
        if (musicUrl) {
            await this.deps.jobManager.updateJob(jobId, { musicUrl, musicDurationSeconds, musicSource: musicResult.source });
        }

        // Build segments and generate images
        const segments = this.buildSegments(segmentContent, voiceoverDuration);
        await this.updateJobStatus(jobId, 'generating_images', 'Creating visuals...');
        const segmentsWithImages = await this.generateImages(segments, jobId);
        await this.deps.jobManager.updateJob(jobId, { segments: segmentsWithImages });

        // Generate subtitles (Disabled for promo reels per user request)
        // await this.updateJobStatus(jobId, 'generating_subtitles', 'Creating subtitles...');
        // const subtitlesResult = await this.deps.subtitlesClient.generateSubtitles(voiceoverUrl);
        // await this.deps.jobManager.updateJob(jobId, { subtitlesUrl: subtitlesResult.subtitlesUrl });

        return { voiceoverUrl, voiceoverDuration, musicUrl, musicDurationSeconds, segmentsWithImages };
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
        await this.updateJobStatus(jobId, 'building_manifest', 'Preparing final video...');
        await this.deps.jobManager.updateJob(jobId, { manifest });

        await this.updateJobStatus(jobId, 'rendering', 'Rendering final video...');
        const renderResult = await this.deps.videoRenderer.render(manifest);
        const finalVideoUrl = renderResult.videoUrl;

        const completedJob = completeJob(await this.deps.jobManager.getJob(jobId) as ReelJob, finalVideoUrl, manifest);
        await this.deps.jobManager.updateJob(jobId, { status: 'completed', finalVideoUrl, manifest });

        if (completedJob.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                completedJob.telegramChatId,
                `🎉 *Your website promo reel is ready!*\n\n🏪 ${businessName}\n📁 Category: ${category}\n\n${finalVideoUrl}`
            );
        }
        await this.notifyCallback(completedJob);
        return completedJob;
    }

    /**
     * Handles errors in website promo job processing.
     */
    private async handlePromoJobError(jobId: string, job: ReelJob, error: unknown): Promise<never> {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${jobId}] Website promo job failed:`, error);

        const failedJob = failJob(job, errorMessage); // Use failJob to get the updated job object
        await this.deps.jobManager.updateJob(jobId, { status: 'failed', error: errorMessage });

        if (job.telegramChatId && this.deps.notificationClient) {
            await this.deps.notificationClient.sendNotification(
                job.telegramChatId,
                `❌ *Website promo reel failed*\n\n${this.getFriendlyErrorMessage(errorMessage)}`
            );
        }

        throw error;
    }

}
