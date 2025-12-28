/**
 * Transcription step - handles audio transcription.
 * Complexity: 2
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ITranscriptionClient } from '../../../domain/ports/ITranscriptionClient';
import { JobManager } from '../../JobManager';

export class TranscriptionStep implements PipelineStep {
    readonly name = 'Transcription';

    constructor(
        private readonly transcriptionClient: ITranscriptionClient,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        return !!context.transcript;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const transcript = await this.transcriptionClient.transcribe(context.job.sourceAudioUrl);
        await this.jobManager.updateJob(context.jobId, { transcript });

        console.log(`[${context.jobId}] TRANSCRIPT: "${transcript}"`);

        return { ...context, transcript };
    }
}
