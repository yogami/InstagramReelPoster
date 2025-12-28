
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ImageGenerationService } from '../../services/ImageGenerationService';
import { JobManager } from '../../JobManager';

export class ImageStep implements PipelineStep {
    readonly name = 'Images';

    constructor(
        private readonly imageService: ImageGenerationService,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        // Skip if animated video mode AND not parable (parables use images for video)
        const isParable = context.contentMode === 'parable';
        const isAnimated = (context.isAnimatedMode || false) && !isParable;
        return isAnimated;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, segments } = context;

        if (!segments || segments.length === 0) {
            console.warn(`[${job.id}] No segments for image generation`);
            return context;
        }

        console.log(`[${job.id}] Generating images for ${segments.length} segments...`);

        // We modify the segments array in-place (or map to new one)
        // ImageGenerationService handles the complexity
        const updatedSegments = await this.imageService.generateForSegments(segments, job.id);

        await this.jobManager.updateJob(job.id, {
            segments: updatedSegments
        });

        return { ...context, segments: updatedSegments };
    }
}
