
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { IAnimatedVideoClient } from '../../../domain/ports/IAnimatedVideoClient';
import { MediaStorageClient } from '../../../infrastructure/storage/MediaStorageClient';
import { JobManager } from '../../JobManager';

export class AnimatedVideoStep implements PipelineStep {
    readonly name = 'AnimatedVideo';

    constructor(
        private readonly animatedClient: IAnimatedVideoClient,
        private readonly jobManager: JobManager,
        private readonly storageClient?: MediaStorageClient
    ) { }

    shouldSkip(context: JobContext): boolean {
        // Skip if NOT in animated mode, OR if parable content mode (logic says parable uses IMAGE rendering usually, UNLESS beats triggers it?)
        // Orchestrator logic:
        // const isParableContent = contentMode === 'parable';
        // const isAnimated = currentJob.isAnimatedVideoMode && !isParableContent;
        // BUT also logic: "if (isAnimated && this.deps.animatedVideoClient)"
        // AND logic for parable: "if (isParableContent && parableScriptPlan ... beats ...)"

        // So step is relevant if:
        // 1. isAnimated is true (non-parable animated)
        // 2. OR isParableContent AND has beats for multi-clip parable

        // Let's refine based on context
        const { isAnimatedMode, contentMode, parableScriptPlan } = context;
        const isParable = contentMode === 'parable';

        // Standard Animated
        if (isAnimatedMode && !isParable) return false;

        // Parable Animated (Multi-clip)
        // We cast parableScriptPlan to known type or check properties
        const plan = parableScriptPlan as any;
        if (isParable && plan && plan.beats && plan.beats.length > 0) return false;

        return true;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, voiceoverDuration, contentMode, parableScriptPlan } = context;
        const jobId = job.id;

        // Skip if already done
        if (context.animatedVideoUrl || (context.animatedVideoUrls && context.animatedVideoUrls.length > 0)) {
            return context;
        }

        console.log(`[${jobId}] Generating animated video...`);
        await this.jobManager.updateJob(jobId, { currentStep: 'Generating animated video...' });

        const isParable = contentMode === 'parable';
        const plan = parableScriptPlan as any;

        const videoUrls: string[] = [];
        const maxClipDuration = 10;

        if (isParable && plan && plan.beats && plan.beats.length > 0) {
            // MULTI-CLIP PARABLE MODE
            console.log(`[${jobId}] Parable mode: Generating ${plan.beats.length} video clips...`);

            for (let i = 0; i < plan.beats.length; i++) {
                const beat = plan.beats[i];
                const beatDuration = Math.min(beat.approxDurationSeconds || 10, maxClipDuration);

                console.log(`[${jobId}] Generating beat ${i + 1}/${plan.beats.length}: ${beatDuration}s`);

                const animatedResult = await this.animatedClient.generateAnimatedVideo({
                    durationSeconds: beatDuration,
                    theme: beat.textOnScreen || beat.narration.substring(0, 100),
                    storyline: beat.narration,
                    mood: beat.role === 'moral' ? 'inspiring' : beat.role === 'turn' ? 'dramatic' : 'contemplative',
                });

                let videoUrl = animatedResult.videoUrl;
                if (this.storageClient) {
                    videoUrl = await this.uploadToCloudinary(videoUrl, `parable_${jobId}_beat${i + 1}`);
                }
                videoUrls.push(videoUrl);
            }
        } else {
            // STANDARD MULTI-CLIP MODE
            const duration = voiceoverDuration || job.targetDurationSeconds || 60;
            const clipsNeeded = Math.ceil(duration / maxClipDuration);
            const clipDuration = duration / clipsNeeded;

            console.log(`[${jobId}] Multi-clip mode: ${clipsNeeded} clips x ${clipDuration.toFixed(1)}s = ${duration}s total`);

            // We need descriptions for each clip.
            // If we have segments, use them. If not, use transcript/summary.
            const segments = context.segments || [];

            for (let i = 0; i < clipsNeeded; i++) {
                // Try to match segment to clip time
                const startTime = i * clipDuration;
                // Find segment active at startTime
                const relevantSegment = segments.find(s => (s.startSeconds <= startTime && s.endSeconds > startTime))
                    || segments[Math.min(i, segments.length - 1)]; // Fallback

                const prompt = relevantSegment ? relevantSegment.imagePrompt : job.transcript?.substring(0, 200);

                console.log(`[${jobId}] Generating clip ${i + 1}/${clipsNeeded}: ${clipDuration.toFixed(1)}s`);

                const animatedResult = await this.animatedClient.generateAnimatedVideo({
                    durationSeconds: clipDuration,
                    theme: prompt || 'Abstract interpretation',
                    storyline: prompt || 'Abstract visual',
                    mood: job.moodOverrides?.[0] || 'cinematic'
                });

                let videoUrl = animatedResult.videoUrl;
                if (this.storageClient) {
                    videoUrl = await this.uploadToCloudinary(videoUrl, `animated_${jobId}_clip${i + 1}`);
                }
                videoUrls.push(videoUrl);
            }
        }

        await this.jobManager.updateJob(jobId, {
            animatedVideoUrls: videoUrls
        });

        return { ...context, animatedVideoUrls: videoUrls };
    }

    private async uploadToCloudinary(url: string, publicId: string): Promise<string> {
        if (!this.storageClient) return url;
        try {
            console.log(`[AnimatedVideo] Persisting to Cloudinary: ${publicId}`);
            const result = await this.storageClient.uploadVideo(url, {
                folder: 'instagram-reels/animated-clips',
                publicId: `${publicId}_${Date.now()}`
            });
            return result.url;
        } catch (err) {
            console.error(`[AnimatedVideo] Upload failed:`, err);
            return url;
        }
    }
}
