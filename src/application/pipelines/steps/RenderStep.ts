
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

        // Ensure we have something to render
        if (!segments && !context.animatedVideoUrls && !context.animatedVideoUrl) {
            console.warn(`[${job.id}] No segments or video for rendering - manifest will likely fail`);
        }

        const manifest = createReelManifest({
            durationSeconds: context.voiceoverDuration || job.targetDurationSeconds || 60,
            segments: segments, // Pass segments directly, createReelManifest handles validation
            animatedVideoUrl: context.animatedVideoUrl,
            animatedVideoUrls: context.animatedVideoUrls,
            voiceoverUrl: voiceoverUrl,
            musicUrl: musicUrl,
            musicDurationSeconds: context.musicDurationSeconds,
            subtitlesUrl: subtitlesUrl || '',
        });

        const result = await this.videoRenderer.render(manifest);
        let finalVideoUrl = result.videoUrl;

        // Waiting 5s for final video propagation
        console.log('Waiting 5s for final video propagation...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        await this.jobManager.updateJob(job.id, {
            finalVideoUrl,
            status: 'completed',
        });

        return { ...context, finalVideoUrl };
    }
}
