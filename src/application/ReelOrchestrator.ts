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

import { ITranscriptionClient } from '../domain/ports/ITranscriptionClient';
import { ILLMClient, ReelPlan, SegmentContent } from '../domain/ports/ILLMClient';
import { ITTSClient } from '../domain/ports/ITTSClient';
import { IImageClient } from '../domain/ports/IImageClient';
import { ISubtitlesClient } from '../domain/ports/ISubtitlesClient';
import { IVideoRenderer } from '../domain/ports/IVideoRenderer';
import { INotificationClient } from '../domain/ports/INotificationClient';
import { MusicSelector, MusicSource } from './MusicSelector';
import { JobManager } from './JobManager';
import { CloudinaryStorageClient } from '../infrastructure/storage/CloudinaryStorageClient';

export interface OrchestratorDependencies {
    transcriptionClient: ITranscriptionClient;
    llmClient: ILLMClient;
    ttsClient: ITTSClient;
    fallbackTTSClient?: ITTSClient;
    primaryImageClient?: IImageClient; // OpenRouter (optional)
    fallbackImageClient: IImageClient; // DALL-E (required)
    subtitlesClient: ISubtitlesClient;
    videoRenderer: IVideoRenderer;
    musicSelector: MusicSelector;
    jobManager: JobManager;
    storageClient?: CloudinaryStorageClient;
    callbackToken?: string;
    callbackHeader?: string;
    notificationClient?: INotificationClient;
}

/**
 * ReelOrchestrator coordinates the full reel generation workflow.
 */
export class ReelOrchestrator {
    private readonly deps: OrchestratorDependencies;

    constructor(deps: OrchestratorDependencies) {
        this.deps = deps;
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
            // Step 1: Transcribe
            let transcript = job.transcript;
            if (!transcript) {
                await this.updateJobStatus(jobId, 'transcribing', 'Transcribing voice note...');
                transcript = await this.deps.transcriptionClient.transcribe(job.sourceAudioUrl);
                await this.deps.jobManager.updateJob(jobId, { transcript });
                this.logMemoryUsage('Step 1: Transcription');
            }

            // Step 2: Plan reel
            let targetDurationSeconds = job.targetDurationSeconds;
            // For now, we replan if haven't passed planning, but we need the plan object for next steps
            await this.updateJobStatus(jobId, 'planning', 'Planning reel structure...');
            const plan = await this.deps.llmClient.planReel(transcript, {
                minDurationSeconds: job.targetDurationRange.min,
                maxDurationSeconds: job.targetDurationRange.max,
                moodOverrides: job.moodOverrides,
            });
            if (!targetDurationSeconds) {
                await this.deps.jobManager.updateJob(jobId, { targetDurationSeconds: plan.targetDurationSeconds });
            }
            this.logMemoryUsage('Step 2: Planning');

            // Step 3: Generate commentary
            let segments = job.segments;
            if (!segments || segments.length === 0 || !segments[0].commentary) {
                await this.updateJobStatus(jobId, 'generating_commentary', 'Writing commentary...');
                let segmentContent = await this.deps.llmClient.generateSegmentContent(plan, transcript);

                // DEFENSIVE: Ensure segmentContent is always an array (catch any LLM normalization failures)
                if (!Array.isArray(segmentContent)) {
                    console.warn('[DEFENSIVE] segmentContent is not an array, attempting recovery:', typeof segmentContent);
                    if (segmentContent && typeof segmentContent === 'object') {
                        if (Array.isArray((segmentContent as any).segments)) {
                            segmentContent = (segmentContent as any).segments;
                        } else if ((segmentContent as any).commentary) {
                            segmentContent = [segmentContent as any];
                        } else {
                            const values = Object.values(segmentContent);
                            if (values.length > 0 && typeof values[0] === 'object') {
                                segmentContent = values as any;
                            } else {
                                throw new Error(`LLM returned invalid format: ${JSON.stringify(segmentContent).substring(0, 200)}`);
                            }
                        }
                    } else {
                        throw new Error(`LLM returned non-object segment content: ${typeof segmentContent}`);
                    }
                }

                segmentContent = await this.adjustCommentaryIfNeeded(plan, segmentContent);

                // Step 4: Synthesize voiceover
                await this.updateJobStatus(jobId, 'synthesizing_voiceover', 'Creating voiceover...');
                const fullCommentary = segmentContent.map((s) => s.commentary).join(' ');
                const { voiceoverUrl, voiceoverDuration, speed } = await this.synthesizeWithAdjustment(
                    fullCommentary,
                    plan.targetDurationSeconds
                );
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

            // Step 7: Generate images
            // Check if ANY image is missing
            const needsImages = segments.some(s => !s.imageUrl);
            if (needsImages) {
                await this.updateJobStatus(jobId, 'generating_images', 'Creating visuals...');
                segments = await this.generateImages(segments, jobId);
                await this.deps.jobManager.updateJob(jobId, { segments });
                this.logMemoryUsage('Step 7: Images');
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
                manifest = createReelManifest({
                    durationSeconds: voiceoverDuration,
                    segments: segments,
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

            // Notify callback of failure
            if (jobForError && jobForError.callbackUrl) {
                await this.notifyCallback(jobForError);
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

        // Ask LLM to adjust
        return this.deps.llmClient.adjustCommentaryLength(
            segmentContent,
            adjustment,
            plan.targetDurationSeconds
        );
    }

    /**
     * Synthesizes voiceover with optional speed adjustment.
     */
    private async synthesizeWithAdjustment(
        text: string,
        targetDuration: number
    ): Promise<{ voiceoverUrl: string; voiceoverDuration: number; speed: number }> {
        // First pass at normal speed
        let result: any;
        let speed = 1.0;

        try {
            console.log('[TTS] Attempting synthesis with primary client (Fish Audio)...');
            result = await this.deps.ttsClient.synthesize(text);
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
                    console.log(`[TTS] Applying speed adjustment (${speed.toFixed(2)}x)...`);
                    result = await this.deps.ttsClient.synthesize(text, { speed });
                } catch (error: any) {
                    console.warn('[TTS] ⚠️ Primary TTS speed adjustment failed:', error.message);

                    if (this.deps.fallbackTTSClient) {
                        console.log('[TTS] Trying fallback client for speed adjustment...');
                        result = await this.deps.fallbackTTSClient.synthesize(text, { speed });
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
                        console.warn(`Primary image client failed for segment ${index}, falling back to DALL-E:`, primaryError);
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

            // Generate a caption from the commentary
            const caption = job.fullCommentary
                ? job.fullCommentary.substring(0, 200) + '...'
                : 'New reel ready!';

            // Build payload - only include video_url if we have a valid URL
            const payload: any = {
                jobId: job.id,
                status: job.status,
                caption: caption,
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
                completedAt: job.updatedAt
            };

            console.log(`[${job.id}] Sending callback payload:`, JSON.stringify(payload, null, 2));

            await axios.post(job.callbackUrl, payload, { headers });

            console.log(`[${job.id}] Callback notification sent successfully`);
        } catch (error) {
            console.error(`[${job.id}] Failed to notify callback:`, error);
            // We don't throw here to avoid failing the job processing just because the callback failed
        }
    }


}
