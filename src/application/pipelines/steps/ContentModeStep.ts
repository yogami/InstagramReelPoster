/**
 * Content Mode Detection step - determines direct-message vs parable mode.
 * Complexity: 3
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ILlmClient } from '../../../domain/ports/ILlmClient';
import { JobManager } from '../../JobManager';
import { ContentMode } from '../../../domain/entities/Parable';

export class ContentModeStep implements PipelineStep {
    readonly name = 'ContentModeDetection';

    constructor(
        private readonly llmClient: ILlmClient,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        return !!context.contentMode && context.contentMode !== 'direct-message';
    }

    async execute(context: JobContext): Promise<JobContext> {
        let contentMode: ContentMode = 'direct-message';

        // Check for explicit forceMode
        if (context.forceMode === 'parable') {
            contentMode = 'parable';
            console.log(`[${context.jobId}] Content Mode: PARABLE (forced)`);
        } else if (context.forceMode === 'direct') {
            contentMode = 'direct-message';
            console.log(`[${context.jobId}] Content Mode: DIRECT-MESSAGE (forced)`);
        } else if (this.llmClient.detectContentMode) {
            const combinedText = `${context.job.description || ''}\n${context.transcript || ''}`.trim();
            const result = await this.llmClient.detectContentMode(combinedText);
            contentMode = result.contentMode;
            console.log(`[${context.jobId}] Content Mode: ${contentMode.toUpperCase()} (detected)`);
        }

        await this.jobManager.updateJob(context.jobId, { contentMode });

        return { ...context, contentMode };
    }
}
