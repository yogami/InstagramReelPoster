/**
 * Intent Detection step - determines if reel should use images or animated video.
 * Complexity: 3
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ILlmClient } from '../../../domain/ports/ILlmClient';
import { JobManager } from '../../JobManager';

export class IntentDetectionStep implements PipelineStep {
    readonly name = 'IntentDetection';

    constructor(
        private readonly llmClient: ILlmClient,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        return context.isAnimatedMode !== undefined;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const combinedText = `${context.job.description || ''}\n${context.transcript || ''}`.trim();
        const result = await this.llmClient.detectReelMode(combinedText);

        console.log(`[${context.jobId}] Reel Mode: ${result.isAnimatedMode ? 'ANIMATED VIDEO' : 'IMAGES'}`);

        await this.jobManager.updateJob(context.jobId, {
            isAnimatedVideoMode: result.isAnimatedMode
        });

        return {
            ...context,
            isAnimatedMode: result.isAnimatedMode,
            storyline: result.storyline
        };
    }
}
