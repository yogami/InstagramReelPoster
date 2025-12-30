
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { IAnimatedVideoClient } from '../../../domain/ports/IAnimatedVideoClient';
import { MediaStorageClient } from '../../../infrastructure/storage/MediaStorageClient';
import { JobManager } from '../../JobManager';

export class AnimatedVideoStep implements PipelineStep {
    readonly name = 'AnimatedVideo';

    constructor(
        private readonly animatedClient: IAnimatedVideoClient,
        private readonly jobManager: JobManager,
        private readonly imageService: any, // Using any for now to avoid circular or complex imports
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
        const plan = parableScriptPlan as any;

        // Run if explicitly animated
        if (isAnimatedMode) return false;

        // Run if parable and has beats (which require video generation)
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

        console.log(`[${jobId}] Generating animated video (Tiered Mode)...`);
        await this.jobManager.updateJob(jobId, { currentStep: 'Generating animated video...' });

        const isParable = contentMode === 'parable';
        const plan = parableScriptPlan as any;

        const maxClipDuration = 10;
        const videoUrls: string[] = [];

        if (isParable && plan && plan.beats && plan.beats.length > 0) {
            // PARABLE MODE: Real AI Video (High Quality, Sequential)
            console.log(`[${jobId}] Parable mode: Queueing ${plan.beats.length} real video clips...`);

            for (let i = 0; i < plan.beats.length; i++) {
                const beat = plan.beats[i];
                const beatDuration = Math.min(beat.approxDurationSeconds || 10, maxClipDuration);

                const url = await this.generateClip({
                    durationSeconds: beatDuration,
                    theme: beat.textOnScreen || beat.narration.substring(0, 100),
                    storyline: beat.narration,
                    mood: beat.role === 'moral' ? 'inspiring' : beat.role === 'turn' ? 'dramatic' : 'contemplative',
                }, `parable_${jobId}_beat${i + 1}`);
                videoUrls.push(url);
            }
        } else {
            // DIRECT-MESSAGE MODE: "Turbo Video" (Fast Flux Images + AI Motion)
            // This restores the speed of the Kling+Shotstack version.
            const duration = voiceoverDuration || job.targetDurationSeconds || 60;
            const clipsNeeded = Math.ceil(duration / maxClipDuration);
            const clipDuration = duration / clipsNeeded;

            console.log(`[${jobId}] Direct-Message mode: Using "Turbo Video" for sub-30s generation (Sequential)...`);

            const segments = context.segments || [];

            for (let i = 0; i < clipsNeeded; i++) {
                const startTime = i * clipDuration;
                const relevantSegment = segments.find(s => (s.startSeconds <= startTime && s.endSeconds > startTime))
                    || segments[Math.min(i, segments.length - 1)];

                const prompt = relevantSegment ? relevantSegment.imagePrompt : job.transcript?.substring(0, 200);

                // Use generateTurboClip which creates a high-quality Image with metadata for the renderer to apply motion
                const url = await this.generateTurboClip({
                    durationSeconds: clipDuration,
                    theme: prompt || 'Abstract interpretation',
                    mood: job.moodOverrides?.[0] || 'cinematic'
                }, `turbo_${jobId}_clip${i + 1}`);
                videoUrls.push(url);

                // Small delay to prevent rate limits/concurrency issues
                if (i < clipsNeeded - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }

        await this.jobManager.updateJob(jobId, {
            animatedVideoUrls: videoUrls
        });

        return { ...context, animatedVideoUrls: videoUrls };
    }

    private async generateTurboClip(options: any, publicId: string): Promise<string> {
        try {
            console.log(`[AnimatedVideo] Generating Turbo Clip (Image-based): ${options.theme.substring(0, 50)}...`);

            // Generate a high-quality Flux image instead of a heavy Video clip
            const result = await this.imageService.generateImage(options.theme, {
                quality: 'hd',
                style: options.mood === 'cinematic' ? 'natural' : 'vivid'
            });

            const imageUrl = result.imageUrl;

            // To notify the renderer that this is an image that needs "Ken Burns" motion.
            // We use a "turbo:" prefix that the Beam renderer will strip but use for logic.
            return `turbo:${imageUrl}`;
        } catch (err) {
            console.error(`[AnimatedVideo] Turbo generation failed, falling back to Mock:`, err);
            return 'https://res.cloudinary.com/djol0rpn5/video/upload/v1734612999/samples/elephants.mp4';
        }
    }

    private async generateClip(options: any, publicId: string): Promise<string> {
        const animatedResult = await this.animatedClient.generateAnimatedVideo({
            ...options,
            storyline: options.storyline || options.theme
        });
        let videoUrl = animatedResult.videoUrl;

        if (this.storageClient) {
            videoUrl = await this.uploadToCloudinary(videoUrl, publicId);
        }

        return videoUrl;
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
