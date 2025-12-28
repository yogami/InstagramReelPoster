
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { IVideoRenderer } from '../../../domain/ports/IVideoRenderer';
import { createReelManifest } from '../../../domain/entities/ReelManifest';
import { JobManager } from '../../JobManager';

export class RenderStep implements PipelineStep {
    readonly name = 'Render';

    constructor(
        private readonly videoRenderer: IVideoRenderer,
        private readonly jobManager: JobManager
    ) { }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, segments, voiceoverUrl, musicUrl, subtitlesUrl } = context;

        if (context.finalVideoUrl) {
            return context;
        }

        console.log(`[${job.id}] Rendering final video...`);

        if (!voiceoverUrl) throw new Error('Voiceover URL required for rendering');

        // Ensure segments exist (or we rely on animatedVideoUrl for manifest logic)
        if (!segments && !context.animatedVideoUrls && !context.animatedVideoUrl) {
            console.warn(`[${job.id}] No segments or video for rendering`);
        }

        // Only pass segments if they actually have images (prevents crash in Animated mode)
        const validSegments = segments?.every(s => s.imageUrl) ? segments : undefined;

        const manifest = createReelManifest({
            durationSeconds: context.voiceoverDuration || job.targetDurationSeconds || 60,
            segments: validSegments,
            animatedVideoUrl: context.animatedVideoUrl,
            animatedVideoUrls: context.animatedVideoUrls,
            voiceoverUrl: voiceoverUrl,
            musicUrl: musicUrl,
            musicDurationSeconds: context.musicDurationSeconds,
            subtitlesUrl: subtitlesUrl || '',
        });

        const result = await this.videoRenderer.render(manifest);
        const finalVideoUrl = result.videoUrl;

        await this.jobManager.updateJob(job.id, {
            finalVideoUrl,
            status: 'completed',
        });

        return { ...context, finalVideoUrl };
    }
}
