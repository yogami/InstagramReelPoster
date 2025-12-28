/**
 * Content Mode Detection step - determines direct-message vs parable mode.
 * Complexity: 3
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ILLMClient } from '../../../domain/ports/ILLMClient';
import { JobManager } from '../../JobManager';
import { ContentMode } from '../../../domain/entities/Parable';

export class ContentModeStep implements PipelineStep {
    readonly name = 'ContentModeDetection';

    constructor(
        private readonly llmClient: ILLMClient,
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
            const result = await this.llmClient.detectContentMode(context.transcript!);
            contentMode = result.contentMode;
            console.log(`[${context.jobId}] Content Mode: ${contentMode.toUpperCase()} (detected)`);
        }

        await this.jobManager.updateJob(context.jobId, { contentMode });

        return { ...context, contentMode };
    }
}
