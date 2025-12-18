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

export interface OrchestratorDependencies {
    transcriptionClient: ITranscriptionClient;
    llmClient: ILLMClient;
    ttsClient: ITTSClient;
    primaryImageClient?: IImageClient; // OpenRouter (optional)
    fallbackImageClient: IImageClient; // DALL-E (required)
    subtitlesClient: ISubtitlesClient;
    videoRenderer: IVideoRenderer;
    musicSelector: MusicSelector;
    jobManager: JobManager;
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

    /**
     * Processes a reel job asynchronously.
     * Updates job status at each step.
     */
    async processJob(jobId: string): Promise<ReelJob> {
        const job = this.deps.jobManager.getJob(jobId);
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
            this.updateJobStatus(jobId, 'transcribing', 'Transcribing voice note...');
            const transcript = await this.deps.transcriptionClient.transcribe(job.sourceAudioUrl);
            this.deps.jobManager.updateJob(jobId, { transcript });

            // Step 2: Plan reel
            this.updateJobStatus(jobId, 'planning', 'Planning reel structure...');
            const plan = await this.deps.llmClient.planReel(transcript, {
                minDurationSeconds: job.targetDurationRange.min,
                maxDurationSeconds: job.targetDurationRange.max,
                moodOverrides: job.moodOverrides,
            });
            this.deps.jobManager.updateJob(jobId, { targetDurationSeconds: plan.targetDurationSeconds });

            // Step 3: Generate commentary
            this.updateJobStatus(jobId, 'generating_commentary', 'Writing commentary...');
            let segmentContent = await this.deps.llmClient.generateSegmentContent(plan, transcript);

            segmentContent = this.normalizeSegmentContent(segmentContent);
            segmentContent = await this.adjustCommentaryIfNeeded(plan, segmentContent);
            segmentContent = this.normalizeSegmentContent(segmentContent); // Normalize again if adjustment changed format

            // Step 4: Synthesize voiceover
            this.updateJobStatus(jobId, 'synthesizing_voiceover', 'Creating voiceover...');
            const fullCommentary = segmentContent.map((s) => s.commentary).join(' ');
            const { voiceoverUrl, voiceoverDuration, speed } = await this.synthesizeWithAdjustment(
                fullCommentary,
                plan.targetDurationSeconds
            );
            this.deps.jobManager.updateJob(jobId, {
                fullCommentary,
                voiceoverUrl,
                voiceoverDurationSeconds: voiceoverDuration,
            });

            // Step 5: Build segments with timing
            const segments = this.buildSegments(segmentContent, voiceoverDuration);
            this.deps.jobManager.updateJob(jobId, { segments });

            // Step 6: Select music
            this.updateJobStatus(jobId, 'selecting_music', 'Finding background music...');
            const { track, source: musicSource } = await this.deps.musicSelector.selectMusic(
                plan.musicTags,
                voiceoverDuration,
                plan.musicPrompt
            );
            this.deps.jobManager.updateJob(jobId, { musicUrl: track.audioUrl, musicSource });

            // Step 7: Generate images
            this.updateJobStatus(jobId, 'generating_images', 'Creating visuals...');
            const segmentsWithImages = await this.generateImages(segments);
            this.deps.jobManager.updateJob(jobId, { segments: segmentsWithImages });

            // Step 8: Generate subtitles
            this.updateJobStatus(jobId, 'generating_subtitles', 'Creating subtitles...');
            const { subtitlesUrl } = await this.deps.subtitlesClient.generateSubtitles(voiceoverUrl);
            this.deps.jobManager.updateJob(jobId, { subtitlesUrl });

            // Step 9: Build manifest
            this.updateJobStatus(jobId, 'building_manifest', 'Preparing render manifest...');
            const manifest = createReelManifest({
                durationSeconds: voiceoverDuration,
                segments: segmentsWithImages,
                voiceoverUrl,
                musicUrl: track.audioUrl,
                subtitlesUrl,
            });
            this.deps.jobManager.updateJob(jobId, { manifest });

            // Step 10: Render video
            this.updateJobStatus(jobId, 'rendering', 'Rendering final video...');
            const { videoUrl } = await this.deps.videoRenderer.render(manifest);



            // Complete the job
            const completedJob = this.deps.jobManager.updateJob(jobId, {
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
            this.deps.jobManager.failJob(jobId, errorMessage);

            // Send error notification to Telegram
            if (job.telegramChatId && this.deps.notificationClient) {
                const friendlyError = this.getFriendlyErrorMessage(errorMessage);
                await this.deps.notificationClient.sendNotification(
                    job.telegramChatId,
                    `❌ *Oops! Something went wrong*\n\n${friendlyError}\n\nPlease try again or contact support if the issue persists.`
                );
            }

            // Notify callback of failure
            if (job.callbackUrl) {
                const failedJob = this.deps.jobManager.getJob(jobId);
                if (failedJob) {
                    await this.notifyCallback(failedJob);
                }
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
        let result = await this.deps.ttsClient.synthesize(text);
        let speed = 1.0;

        // Check if we need speed adjustment
        const diff = Math.abs(result.durationSeconds - targetDuration);
        if (diff > 1.5) {
            speed = calculateSpeedAdjustment(result.durationSeconds, targetDuration);
            if (speed !== 1.0) {
                result = await this.deps.ttsClient.synthesize(text, { speed });
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
    private async generateImages(segments: Segment[]): Promise<Segment[]> {
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
                // Try primary image client (OpenRouter) first
                if (this.deps.primaryImageClient) {
                    const { imageUrl } = await this.deps.primaryImageClient.generateImage(segment.imagePrompt);
                    results.push({ ...segment, imageUrl });
                    continue;
                }
            } catch (error) {
                console.warn(`Primary image client failed for segment ${index}, falling back to DALL-E:`, error);
            }

            // Fallback to DALL-E
            const { imageUrl } = await this.deps.fallbackImageClient.generateImage(segment.imagePrompt);
            results.push({ ...segment, imageUrl });
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
