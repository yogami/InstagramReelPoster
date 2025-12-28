/**
 * Transcription step - handles audio transcription.
 * Complexity: 2
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ITranscriptionClient } from '../../../domain/ports/ITranscriptionClient';
import { JobManager } from '../../JobManager';
import { TrainingDataCollector } from '../../../infrastructure/training/TrainingDataCollector';
import { getConfig } from '../../../config';

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

        // Personal Clone: Collect voice sample for training if enabled
        const config = getConfig();
        if (config.featureFlags.personalCloneTrainingMode && transcript) {
            try {
                const collector = new TrainingDataCollector();
                await collector.collectVoiceSample(
                    context.job.sourceAudioUrl,
                    transcript,
                    context.job.targetDurationSeconds || 30 // Estimate if not set yet
                );
                console.log('[PersonalClone] Collected voice sample for training');
            } catch (err) {
                console.warn('[PersonalClone] Failed to collect voice sample:', err);
            }
        }

        return { ...context, transcript };
    }
}
