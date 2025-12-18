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

                segmentContent = this.normalizeSegmentContent(segmentContent);
                segmentContent = await this.adjustCommentaryIfNeeded(plan, segmentContent);
                segmentContent = this.normalizeSegmentContent(segmentContent);

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

            // Step 6: Select music
            let musicUrl = currentJob.musicUrl;
            if (!musicUrl) {
                await this.updateJobStatus(jobId, 'selecting_music', 'Finding background music...');
                const { track, source: musicSource } = await this.deps.musicSelector.selectMusic(
                    plan.musicTags,
                    voiceoverDuration,
                    plan.musicPrompt
                );
                musicUrl = track.audioUrl;
                const musicDurationSeconds = track.durationSeconds;
                await this.deps.jobManager.updateJob(jobId, { musicUrl, musicSource, musicDurationSeconds });
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
                    musicUrl: musicUrl!,
                    musicDurationSeconds: (await this.deps.jobManager.getJob(jobId))?.musicDurationSeconds || voiceoverDuration,
                    subtitlesUrl,
                });
                await this.deps.jobManager.updateJob(jobId, { manifest });
            }

            // Step 10: Render video
            await this.updateJobStatus(jobId, 'rendering', 'Rendering final video...');
            this.logMemoryUsage('Starting Step 10: Rendering');
            const { videoUrl } = await this.deps.videoRenderer.render(manifest);
            this.logMemoryUsage('Step 10: Finished Rendering');

            // Complete the job
            const completedJob = await this.deps.jobManager.updateJob(jobId, {
                status: 'completed',
                finalVideoUrl: videoUrl,
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
            result = await this.deps.ttsClient.synthesize(text);
        } catch (error) {
            if (this.deps.fallbackTTSClient) {
                console.warn('Primary TTS failed, trying fallback:', error);
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
                    result = await this.deps.ttsClient.synthesize(text, { speed });
                } catch (error) {
                    if (this.deps.fallbackTTSClient) {
                        console.warn('Primary TTS adjustment failed, trying fallback:', error);
                        result = await this.deps.fallbackTTSClient.synthesize(text, { speed });
                    } else {
                        throw error;
                    }
                }
            }
        }

        return {
            voiceoverUrl: result.audioUrl,
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

        try {
            console.log(`[${job.id}] Notifying callback: ${job.callbackUrl}`);
            const headers: Record<string, string> = {};
            if (this.deps.callbackToken && this.deps.callbackHeader) {
                if (this.deps.callbackHeader.toLowerCase() === 'authorization') {
                    headers[this.deps.callbackHeader] = `Bearer ${this.deps.callbackToken}`;
                } else {
                    headers[this.deps.callbackHeader] = this.deps.callbackToken;
                }
            }

            await axios.post(job.callbackUrl, {
                jobId: job.id,
                status: job.status,
                videoUrl: job.finalVideoUrl,
                error: job.error,
                metadata: {
                    duration: job.voiceoverDurationSeconds,
                    createdAt: job.createdAt,
                    completedAt: job.updatedAt
                }
            }, {
                headers
            });
        } catch (error) {
            console.error(`[${job.id}] Failed to notify callback:`, error);
            // We don't throw here to avoid failing the job processing just because the callback failed
        }
    }

    /**
     * Normalizes segment content to ensure it's always an array.
     */
    private normalizeSegmentContent(segmentContent: any): SegmentContent[] {
        if (Array.isArray(segmentContent)) {
            return segmentContent;
        }

        console.warn('LLM returned non-array segment content:', JSON.stringify(segmentContent).substring(0, 200));

        if (typeof segmentContent === 'object' && segmentContent !== null && 'segments' in segmentContent) {
            return (segmentContent as any).segments;
        }

        if (typeof segmentContent === 'object' && segmentContent !== null) {
            // If it's an object with numbered keys, convert to array
            const values = Object.values(segmentContent) as any[];
            if (values.length > 0 && values[0].commentary) {
                return values as SegmentContent[];
            }
            // Wrap single object
            return [segmentContent] as SegmentContent[];
        }

        throw new Error(`Invalid segment content format: ${typeof segmentContent}`);
    }
}
