
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ISubtitlesClient } from '../../../domain/ports/ISubtitlesClient';
import { JobManager } from '../../JobManager';

export class SubtitlesStep implements PipelineStep {
    readonly name = 'Subtitles';

    constructor(
        private readonly subtitlesClient: ISubtitlesClient,
        private readonly jobManager: JobManager
    ) { }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, voiceoverUrl } = context;

        // Skip if already done
        if (context.subtitlesUrl) return context;

        if (!voiceoverUrl) {
            console.warn(`[${job.id}] Missing voiceoverUrl for subtitles`);
            return context;
        }

        console.log(`[${job.id}] Generating subtitles...`);
        const { subtitlesUrl } = await this.subtitlesClient.generateSubtitles(voiceoverUrl);

        await this.jobManager.updateJob(job.id, {
            subtitlesUrl
        });

        return { ...context, subtitlesUrl };
    }
}
