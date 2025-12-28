/**
 * Music Selection step - selects or generates background music.
 * Complexity: 2
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { MusicSelector } from '../../MusicSelector';
import { JobManager } from '../../JobManager';

export class MusicStep implements PipelineStep {
    readonly name = 'MusicSelection';

    constructor(
        private readonly musicSelector: MusicSelector,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        return !!context.musicUrl;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const musicResult = await this.musicSelector.selectMusic(
            context.plan!.musicTags,
            context.voiceoverDuration!,
            context.plan!.musicPrompt
        );

        if (!musicResult) {
            console.log(`[${context.jobId}] No music selected`);
            return context;
        }

        const { track, source } = musicResult;

        await this.jobManager.updateJob(context.jobId, {
            musicUrl: track.audioUrl,
            musicSource: source,
            musicDurationSeconds: track.durationSeconds
        });

        console.log(`[${context.jobId}] Music selected: ${track.durationSeconds}s from ${source}`);

        return {
            ...context,
            musicUrl: track.audioUrl,
            musicDurationSeconds: track.durationSeconds
        };
    }
}
