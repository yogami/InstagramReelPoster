/**
 * Product Demo Use Case
 * 
 * Core application logic for generating product demo videos.
 * Orchestrates the workflow from URL to final video.
 */

import {
    ProductDemoInput,
    ProductDemoResult,
    ProductAnalysis,
    GitHubContext,
    DemoRecordingResult
} from '../domain/entities/ProductDemo';
import { DemoScript, DemoScene } from '../domain/entities/DemoBlueprint';
import { DemoBlueprintFactory } from '../domain/services/DemoBlueprintFactory';
import { SaaSClassifier } from '../domain/services/SaaSClassifier';
import { ISaaSEligibilityPort } from '../ports/ISaaSEligibilityPort';
import { IProductScrapingPort } from '../ports/IProductScrapingPort';
import { IGitHubScrapingPort } from '../ports/IGitHubScrapingPort';
import { IDemoRecordingPort } from '../ports/IDemoRecordingPort';
import { IDemoScriptGenerationPort } from '../ports/IDemoScriptGenerationPort';

// Importing shared ports from website-promo slice
import { IAssetGenerationPort } from '../../website-promo/ports/IAssetGenerationPort';
import { IRenderingPort } from '../../website-promo/ports/IRenderingPort';
import { ICachePort } from '../../website-promo/ports/ICachePort';
import { IMetricsPort, METRICS } from '../../website-promo/ports/IMetricsPort';
import { PromoSceneContent } from '../../website-promo/domain/entities/WebsitePromo';

// ============================================================================
// Dependencies
// ============================================================================

export interface ProductDemoUseCaseDeps {
    eligibilityPort: ISaaSEligibilityPort;
    productScrapingPort: IProductScrapingPort;
    githubScrapingPort: IGitHubScrapingPort;
    demoRecordingPort: IDemoRecordingPort;
    scriptGenerationPort: IDemoScriptGenerationPort;
    assetPort: IAssetGenerationPort;
    renderingPort: IRenderingPort;
    cachePort: ICachePort;
    metricsPort: IMetricsPort;
    /** Voice speed multiplier (default 1.25) */
    voiceSpeedMultiplier?: number;
    /** Commentary length as percentage of video (default 0.92) */
    commentaryLengthPercent?: number;
    /** Your Fish Audio voice clone ID */
    voiceId?: string;
}

// ============================================================================
// Use Case
// ============================================================================

export class ProductDemoUseCase {
    private readonly blueprintFactory = new DemoBlueprintFactory();
    private readonly classifier = new SaaSClassifier();

    constructor(private readonly deps: ProductDemoUseCaseDeps) { }

    /**
     * Executes the full product demo generation workflow.
     */
    async execute(input: ProductDemoInput): Promise<ProductDemoResult | { error: string; eligible: false }> {
        const startTime = Date.now();
        console.log(`[ProductDemo] Starting demo generation for: ${input.productUrl}`);

        try {
            // Step 1: Check cache
            const cached = await this.deps.cachePort.get<ProductDemoResult>(`demo:${input.productUrl}:${input.audienceType}`);
            if (cached) {
                console.log('[ProductDemo] Returning cached result');
                return cached;
            }

            // Step 2: Check SaaS eligibility
            if (!input.force) {
                const eligibility = await this.deps.eligibilityPort.checkEligibility(input.productUrl);
                if (!eligibility.isEligible) {
                    const message = this.classifier.createRejectionMessage(eligibility);
                    console.log(`[ProductDemo] Not eligible: ${message}`);
                    return { error: message, eligible: false };
                }
            } else {
                console.log(`[ProductDemo] Bypassing eligibility check (force=true)`);
            }

            // Step 3: Scrape product page
            const productAnalysis = await this.deps.productScrapingPort.scrapeProduct({
                url: input.productUrl,
                captureScreenshots: true,
                extractImages: true,
                additionalPages: ['/features', '/pricing']
            });

            // Step 4: Parse GitHub if provided
            let githubContext: GitHubContext | undefined;
            if (input.githubUrl && this.deps.githubScrapingPort.isValidGitHubUrl(input.githubUrl)) {
                try {
                    githubContext = await this.deps.githubScrapingPort.parseRepository({
                        repoUrl: input.githubUrl,
                        parseDocs: true,
                        extractTechStack: true
                    });
                } catch (error) {
                    console.warn('[ProductDemo] GitHub parsing failed, continuing without:', error);
                }
            }

            // Step 5: Check if live demo is possible
            const authCheck = await this.deps.demoRecordingPort.canRecordWithoutAuth(input.productUrl);
            let demoRecording: DemoRecordingResult | undefined;

            if (authCheck.canDemoWithoutAuth) {
                // Try to record live demo
                console.log('[ProductDemo] Attempting live demo recording...');
                demoRecording = await this.deps.demoRecordingPort.recordLiveDemo({
                    url: authCheck.demoUrl || input.productUrl,
                    maxDurationSeconds: 20
                });

                if (!demoRecording.success) {
                    console.log(`[ProductDemo] Live demo failed: ${demoRecording.failureReason}`);
                    demoRecording = undefined;
                }
            } else if (authCheck.hasEmbeddedVideo && authCheck.embeddedVideoUrl) {
                // Use embedded video instead
                console.log('[ProductDemo] Using embedded video from product page');
                demoRecording = {
                    videoUrl: authCheck.embeddedVideoUrl,
                    durationSeconds: 15,
                    wasAuthenticated: false,
                    success: true
                };
            }

            // Step 6: Generate script
            const script = await this.deps.scriptGenerationPort.generateScript({
                productAnalysis,
                githubContext,
                audienceType: input.audienceType,
                hasLiveDemoRecording: !!demoRecording?.success,
                customInstructions: input.customInstructions
            });

            // Step 7: Generate assets
            const assets = await this.generateAssets(script, productAnalysis, demoRecording);

            // Step 8: Render video - create a PromoScriptPlan compatible object
            const scriptPlan = {
                coreMessage: script.coreMessage,
                category: 'tech' as const,
                businessName: script.productName,
                scenes: assets.scenes,
                musicStyle: script.musicStyle,
                caption: script.caption,
                compliance: {
                    source: 'public-website' as const,
                    consent: true,
                    scrapedAt: new Date()
                },
                language: script.language
            };



            // Generate actual image URLs (handles both AI prompts and scraped URLs)
            const imageUrls = await this.deps.assetPort.generateImages(assets.scenes);

            const renderAssets = {
                voiceoverUrl: assets.voiceoverUrl,
                musicUrl: assets.musicUrl,
                subtitlesUrl: assets.subtitlesUrl,
                imageUrls
            };

            const renderResult = await this.deps.renderingPort.render(scriptPlan, renderAssets);

            // Build result
            const result: ProductDemoResult = {
                videoUrl: renderResult.videoUrl,
                durationSeconds: renderResult.durationSeconds,
                productName: script.productName,
                audienceType: input.audienceType,
                caption: script.caption,
                metadata: {
                    hadGitHubContext: !!githubContext,
                    usedLiveDemo: !!demoRecording?.success,
                    usedAIImages: assets.usedAIImages,
                    scrapedImageCount: productAnalysis.images.length,
                    screenshotCount: productAnalysis.screenshots.length
                }
            };

            // Cache result
            await this.deps.cachePort.set(`demo:${input.productUrl}:${input.audienceType}`, result);

            // Record metrics (using existing METRICS from website-promo)
            this.deps.metricsPort.recordDuration(METRICS.TOTAL_JOB_DURATION, Date.now() - startTime);
            this.deps.metricsPort.incrementCounter(METRICS.JOBS_PROCESSED);

            console.log(`[ProductDemo] Generation complete in ${Date.now() - startTime}ms`);
            return result;

        } catch (error) {
            console.error('[ProductDemo] Generation failed:', error);
            this.deps.metricsPort.incrementCounter(METRICS.JOBS_FAILED);
            throw error;
        }
    }

    private async generateAssets(
        script: DemoScript,
        productAnalysis: ProductAnalysis,
        demoRecording?: DemoRecordingResult
    ): Promise<{
        scenes: PromoSceneContent[];
        voiceoverUrl: string;
        musicUrl: string;
        subtitlesUrl: string;
        usedAIImages: boolean;
    }> {
        // Generate voiceover with voice ID option
        const voiceResult = await this.deps.assetPort.generateVoiceover(
            script.fullNarration,
            { voiceId: this.deps.voiceId }
        );

        // Adjust for commentary length percentage
        const commentaryPercent = this.deps.commentaryLengthPercent || 0.92;
        const targetVideoDuration = voiceResult.durationSeconds / commentaryPercent;

        // Select music
        const musicResult = await this.deps.assetPort.selectMusic(script.musicStyle, targetVideoDuration);

        // Generate subtitles from the voiceover audio URL
        const subtitlesUrl = await this.deps.assetPort.generateSubtitles(voiceResult.url);

        // Convert script scenes to PromoSceneContent format
        let usedAIImages = false;
        const scenes: PromoSceneContent[] = await Promise.all(script.scenes.map(async (scene, index) => {
            let imagePrompt = scene.imagePrompt;

            // Determine image source
            if (scene.visualSource === 'scraped' && productAnalysis.images.length > index) {
                // For scraped images, use the URL as the prompt (will be handled by asset port)
                imagePrompt = productAnalysis.images[index]?.url || scene.imagePrompt;
            } else if (scene.visualSource === 'recorded' && demoRecording?.success) {
                // Use demo recording URL
                imagePrompt = demoRecording.videoUrl;
            } else if (scene.visualSource === 'screenshot' && productAnalysis.screenshots.length > 0) {
                // Use screenshot URL
                imagePrompt = productAnalysis.screenshots[index % productAnalysis.screenshots.length];
            } else {
                // Will use AI generation
                usedAIImages = true;
            }

            // Map DemoBeatKind to PromoSceneContent role
            const roleMap: Record<string, 'hook' | 'showcase' | 'cta'> = {
                'HOOK': 'hook',
                'PROBLEM': 'showcase',
                'TRADITIONAL_SOLUTION': 'showcase',
                'PRODUCT_SOLUTION': 'showcase',
                'LIVE_DEMO': 'showcase',
                'FEATURES': 'showcase',
                'SOCIAL_PROOF': 'showcase',
                'CTA': 'cta'
            };

            return {
                duration: scene.duration,
                imagePrompt,
                narration: scene.narration,
                subtitle: scene.subtitle,
                role: roleMap[scene.role] || 'showcase',
                visualStyle: scene.visualSource === 'generated' ? 'ai_generated' : 'scraped',
                mediaIntent: scene.visualSource
            };
        }));

        return {
            scenes,
            voiceoverUrl: voiceResult.url,
            musicUrl: musicResult.url,
            subtitlesUrl,
            usedAIImages
        };
    }
}

