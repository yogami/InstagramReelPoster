import { Segment } from '../../domain/entities/Segment';
import { JobManager } from '../JobManager';
import { ITtsClient } from '../../domain/ports/ITtsClient';
import { IImageClient } from '../../domain/ports/IImageClient';
import { MediaStorageClient } from '../../infrastructure/storage/MediaStorageClient';
import { MusicSelector } from '../MusicSelector';
import { ReelJob } from '../../domain/entities/ReelJob';
import { SegmentContent } from '../../domain/ports/ILlmClient';
import { PromoScriptPlan, PromoSceneContent, ScrapedMedia, BusinessCategory } from '../../domain/entities/WebsitePromo';
import { getMusicStyle } from '../../infrastructure/llm/CategoryPrompts';
import { getConfig } from '../../config';
import { calculateSpeedAdjustment, calculateSegmentTimings, truncateToFitDuration } from '../../domain/services/DurationCalculator';
import { createSegment } from '../../domain/entities/Segment';
import { IImageVerificationClient } from '../../domain/ports/IImageVerificationClient';

export interface PreparePromoAssetsOptions {
    jobId: string;
    job: ReelJob;
    segmentContent: SegmentContent[];
    fullCommentary: string;
    targetDuration: number;
    category: BusinessCategory;
    promoScript: PromoScriptPlan;
    voiceId?: string;
}

export interface PromoAssetServiceDependencies {
    jobManager: JobManager;
    ttsClient: ITtsClient;
    fallbackTtsClient?: ITtsClient;
    primaryImageClient?: IImageClient;
    fallbackImageClient: IImageClient;
    storageClient?: MediaStorageClient;
    musicSelector: MusicSelector;
    imageVerificationClient?: IImageVerificationClient;
}

export class PromoAssetService {
    constructor(private readonly deps: PromoAssetServiceDependencies) { }

    async preparePromoAssets(options: PreparePromoAssetsOptions) {
        const { jobId, job, segmentContent, fullCommentary, targetDuration, category, promoScript, voiceId } = options;

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

        // Build segments and resolve media with prioritized sourcing
        const segments = this.buildSegments(segmentContent, voiceoverDuration);
        // Resolve logo and upload to Cloudinary (for reliable cross-origin rendering)
        const websiteAnalysis = (await this.deps.jobManager.getJob(jobId))?.websiteAnalysis;
        let logoUrl = websiteAnalysis?.logoUrl || job.manifest?.logoUrl;

        if (this.deps.storageClient && logoUrl && !logoUrl.includes('cloudinary.com') && !logoUrl.startsWith('data:')) {
            console.log(`[${jobId}] Uploading logo to Cloudinary for reliable rendering: ${logoUrl}`);
            try {
                const uploadResult = await this.deps.storageClient.uploadImage(logoUrl, {
                    folder: `instagram-reels/branding/${jobId}`,
                    publicId: `logo_${Date.now()}`
                });
                logoUrl = uploadResult.url;
                if (websiteAnalysis) {
                    await this.deps.jobManager.updateJob(jobId, {
                        websiteAnalysis: { ...websiteAnalysis, logoUrl }
                    });
                }
            } catch (error) {
                console.warn(`[${jobId}] Logo upload failed, using original URL:`, error);
            }
        }
        const scrapedMedia = promoScript?.compliance?.source === 'public-website'
            ? websiteAnalysis?.scrapedMedia || []
            : [];
        const userProvidedMedia = job.websitePromoInput?.providedMedia || [];
        const resolvedMedia = this.resolveMediaForScenes(
            promoScript?.scenes || [],
            userProvidedMedia,
            scrapedMedia,
            logoUrl
        );

        // Generate images only for scenes needing AI (gap fill), with CTA verification
        const segmentsWithImages = await this.generateImagesWithPriority(
            segments, resolvedMedia, jobId, promoScript?.scenes, logoUrl, websiteAnalysis
        );
        await this.deps.jobManager.updateJob(jobId, { segments: segmentsWithImages });

        console.log(`[${jobId}] Promo assets prepared: ${segmentsWithImages.length} segments, ${voiceoverDuration.toFixed(1)}s voiceover`);
        return { voiceoverUrl, voiceoverDuration, musicUrl, musicDurationSeconds, segmentsWithImages };
    }

    private async updateJobStatus(jobId: string, status: ReelJob['status'], step: string): Promise<void> {
        console.log(`[${jobId}] ${status}: ${step}`);
        await this.deps.jobManager.updateStatus(jobId, status, step);
    }

    /**
     * Synthesizes voiceover with optional speed adjustment.
     */
    private async synthesizeWithAdjustment(
        text: string,
        targetDuration: number,
        voiceId?: string
    ): Promise<{ voiceoverUrl: string; voiceoverDuration: number; speed: number }> {
        // PRE-TTS: Truncate text to fit target duration (prevent cutoff)
        const truncatedText = truncateToFitDuration(text, targetDuration);
        if (truncatedText.length < text.length) {
            console.log(`[TTS] Text truncated from ${text.split(/\s+/).length} to ${truncatedText.split(/\s+/).length} words to fit ${targetDuration}s`);
        }

        // First pass at normal speed
        let result: any;
        let speed = 1.0;

        try {
            console.log(`[TTS] Attempting synthesis with primary client (Fish Audio)...${voiceId ? ` (Voice: ${voiceId})` : ''}`);
            result = await this.deps.ttsClient.synthesize(truncatedText, { voiceId });
        } catch (error: any) {
            console.error('[TTS] ❌ Primary TTS (Fish Audio) failed.');
            console.error(`[TTS] Error: ${error.message}`);
            if (error.response) {
                console.error(`[TTS] Status: ${error.response.status}`);
            }

            if (this.deps.fallbackTtsClient) {
                console.warn('[TTS] ⚠️ Using fallback TTS client...');
                result = await this.deps.fallbackTtsClient.synthesize(text, { voiceId });
            } else {
                throw error;
            }
        }

        // Check if we need speed adjustment (Strict: 95-100% of target)
        const deviation = (result.durationSeconds - targetDuration) / targetDuration;
        const absDiff = Math.abs(result.durationSeconds - targetDuration);

        // Adjust if deviation > 0 (too long) or deviation < -0.05 (too short, <95%)
        // OR if absolute difference is more than 0.5s for short reels
        if (deviation > 0 || deviation < -0.04 || absDiff > 0.5) {
            speed = calculateSpeedAdjustment(result.durationSeconds, targetDuration);
            if (speed !== 1.0) {
                try {
                    console.log(`[TTS] Applying speed adjustment (${speed.toFixed(2)}x) to hit target ${targetDuration}s (current: ${result.durationSeconds.toFixed(2)}s)...`);
                    result = await this.deps.ttsClient.synthesize(text, { speed, pitch: 0.9, voiceId });
                } catch (error: any) {
                    console.warn('[TTS] ⚠️ Primary TTS speed adjustment failed:', error.message);

                    if (this.deps.fallbackTtsClient) {
                        console.log('[TTS] Trying fallback client for speed adjustment with pitch 0.9...');
                        result = await this.deps.fallbackTtsClient.synthesize(text, { speed, pitch: 0.9 });
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
            } catch (uploadError: any) {
                console.error(`[Voiceover] Cloudinary upload failed: ${uploadError.message || 'Unknown error'}`);
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
                visualStyle: c.visualStyle,
            })
        );
    }

    /**
     * Resolves media assets for scenes using prioritized sourcing.
     * Priority: user-provided > scraped website images > AI generation
     */
    private resolveMediaForScenes(
        scenes: PromoSceneContent[],
        userMedia: string[] = [],
        scrapedMedia: ScrapedMedia[] = [],
        logoUrl?: string
    ): (string | null)[] {
        const resolvedMedia: (string | null)[] = [];
        let userMediaIndex = 0;
        let scrapedMediaIndex = 0;

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];

            // Special Case: CTA scene logic removed to avoid blurry logo as background.
            // Logo is already present in Branding Overlay.

            // Priority 1: User-provided media
            if (userMediaIndex < userMedia.length) {
                resolvedMedia.push(userMedia[userMediaIndex]);
                userMediaIndex++;
                console.log(`[MediaResolver] Scene ${i + 1} (${scene.role}): Using user-provided media`);
                continue;
            }

            // Priority 2: Scraped website images
            if (scrapedMediaIndex < scrapedMedia.length) {
                const scraped = scrapedMedia[scrapedMediaIndex];
                resolvedMedia.push(scraped.url);
                scrapedMediaIndex++;
                console.log(`[MediaResolver] Scene ${i + 1} (${scene.role}): Using scraped image from ${scraped.sourcePage}`);
                continue;
            }

            // Priority 3: AI generation (gap fill)
            resolvedMedia.push(null);
            console.log(`[MediaResolver] Scene ${i + 1} (${scene.role}): Will use AI generation (gap fill)`);
        }

        const stats = {
            total: scenes.length,
            userMedia: userMediaIndex,
            scraped: scrapedMediaIndex - userMediaIndex > 0 ? scrapedMediaIndex - userMediaIndex : scrapedMediaIndex,
            ai: resolvedMedia.filter(m => m === null).length,
        };
        console.log(`[MediaResolver] Summary: ${stats.userMedia} user, ${stats.scraped} scraped, ${stats.ai} AI-generated`);

        return resolvedMedia;
    }

    /**
     * Generates images with priority sourcing.
     * Uses pre-resolved media URLs when available, only generating AI images for gaps.
     * Verifies CTA images are text-free using vision LLM.
     */
    private async generateImagesWithPriority(
        segments: Segment[],
        resolvedMedia: (string | null)[],
        jobId: string,
        scenes?: { role: string }[],
        logoUrl?: string,
        websiteAnalysis?: any
    ): Promise<Segment[]> {
        console.log(`Generating images with priority sourcing for ${segments.length} segments...`);

        const results: Segment[] = [];
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const preResolvedUrl = resolvedMedia[i];

            try {
                let finalImageUrl = '';

                if (preResolvedUrl) {
                    // Use pre-resolved media (user-provided or scraped)
                    finalImageUrl = preResolvedUrl;
                    console.log(`[${jobId}] Segment ${i + 1}: Using pre-resolved media`);
                } else {
                    // Generate AI image (gap fill)
                    await this.updateJobStatus(jobId, 'generating_images', `Creating visual ${i + 1} of ${segments.length} (AI)...`);
                    if (this.deps.primaryImageClient) {
                        try {
                            // Strict text prevention by appending negative prompt instruction
                            const stylePrefix = segment.visualStyle ? `Style: ${segment.visualStyle}. ` : '';
                            const strictPrompt = `${stylePrefix}${segment.imagePrompt}. Ensure the image contains NO text, NO letters, NO words, NO signage, and NO watermarks. Purely visual composition.`;
                            const { imageUrl } = await this.deps.primaryImageClient.generateImage(strictPrompt);
                            finalImageUrl = imageUrl;
                        } catch (primaryError) {
                            console.warn(`Primary image client failed for segment ${i}, falling back:`, primaryError);
                            const { imageUrl } = await this.deps.fallbackImageClient.generateImage(segment.imagePrompt);
                            finalImageUrl = imageUrl;
                        }
                    } else {
                        const { imageUrl } = await this.deps.fallbackImageClient.generateImage(segment.imagePrompt);
                        finalImageUrl = imageUrl;
                    }
                }

                // Upload to Cloudinary for permanent URLs (skip if already a cloud URL)
                if (this.deps.storageClient && finalImageUrl && !finalImageUrl.includes('cloudinary.com')) {
                    try {
                        const uploadResult = await this.deps.storageClient.uploadImage(finalImageUrl, {
                            folder: `instagram-reels/images/${jobId}`,
                            publicId: `seg_${i}_${Date.now()}`
                        });
                        finalImageUrl = uploadResult.url;

                        // If this was the logo used for CTA, update analysis for other uses (like branding card)
                        if (preResolvedUrl === logoUrl && websiteAnalysis) {
                            await this.deps.jobManager.updateJob(jobId, {
                                websiteAnalysis: { ...websiteAnalysis, logoUrl: finalImageUrl }
                            });
                        }
                    } catch (uploadError: any) {
                        console.warn('Failed to upload image to Cloudinary, using original URL:', uploadError);

                        // If it's a 404 error and it was a pre-resolved URL, fallback to AI generation
                        const is404 = uploadError.message?.includes('404') || uploadError.http_code === 404;
                        if (is404 && preResolvedUrl) {
                            console.warn(`[${jobId}] Pre-resolved image ${i + 1} is 404, falling back to AI generation...`);
                            await this.updateJobStatus(jobId, 'generating_images', `Fixing broken visual ${i + 1} with AI...`);

                            try {
                                const { imageUrl } = await this.deps.fallbackImageClient.generateImage(segment.imagePrompt);
                                finalImageUrl = imageUrl;

                                // Attempt to upload the new AI image
                                if (this.deps.storageClient) {
                                    const retryUpload = await this.deps.storageClient.uploadImage(finalImageUrl, {
                                        folder: `instagram-reels/images/${jobId}`,
                                        publicId: `seg_${i}_retry_${Date.now()}`
                                    });
                                    finalImageUrl = retryUpload.url;
                                }
                            } catch (retryError) {
                                console.error(`[${jobId}] AI fallback generation failed:`, retryError);
                            }
                        }
                    }
                }

                // VERIFICATION: For CTA images, verify they are text-free
                const isCta = scenes?.[i]?.role === 'cta';
                if (isCta && this.deps.imageVerificationClient && !preResolvedUrl) {
                    try {
                        console.log(`[${jobId}] Verifying CTA image is text-free...`);
                        const verification = await this.deps.imageVerificationClient.verifyImageContent(
                            finalImageUrl,
                            { mustBeTextFree: true }
                        );

                        if (!verification.isValid) {
                            console.warn(`[${jobId}] CTA image verification failed: ${verification.issues.join(', ')}`);
                            console.log(`[${jobId}] Detected text: ${verification.detectedText.join(', ')}`);
                            // For now, log and continue. Future: regenerate with stricter prompt.
                        } else {
                            console.log(`[${jobId}] CTA image verification passed (text-free)`);
                        }
                    } catch (verifyError) {
                        console.warn(`[${jobId}] Vision verification failed, continuing:`, verifyError);
                    }
                }

                results.push({ ...segment, imageUrl: finalImageUrl });
            } catch (error: any) {
                console.error(`Image generation failed for segment ${i}: ${error.message || 'Unknown error'}`);
                throw error;
            }
        }

        // Wait for asset propagation
        if (this.deps.storageClient) {
            console.log('Waiting 2s for asset propagation...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return results;
    }
}
