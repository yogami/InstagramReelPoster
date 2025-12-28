/**
 * Intent Detection step - determines if reel should use images or animated video.
 * Complexity: 3
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ILLMClient } from '../../../domain/ports/ILLMClient';
import { JobManager } from '../../JobManager';

export class IntentDetectionStep implements PipelineStep {
    readonly name = 'IntentDetection';

    constructor(
        private readonly llmClient: ILLMClient,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        return context.isAnimatedMode !== undefined;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const result = await this.llmClient.detectReelMode(context.transcript!);

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
