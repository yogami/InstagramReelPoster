/**
 * Planning step - creates the reel plan structure.
 * Complexity: 3
 */

import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ILLMClient } from '../../../domain/ports/ILLMClient';
import { JobManager } from '../../JobManager';
import { ReelPlan } from '../../../domain/ports/ILLMClient';

export class PlanningStep implements PipelineStep {
    readonly name = 'Planning';

    constructor(
        private readonly llmClient: ILLMClient,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        return !!context.plan;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, transcript, contentMode } = context;

        let plan: ReelPlan;

        if (contentMode === 'parable') {
            plan = await this.createParablePlan(context);
        } else {
            plan = await this.llmClient.planReel(transcript!, {
                minDurationSeconds: job.targetDurationRange.min,
                maxDurationSeconds: job.targetDurationRange.max,
                moodOverrides: job.moodOverrides,
            });
        }

        console.log(`[${context.jobId}] Plan: target=${plan.targetDurationSeconds}s, segments=${plan.segmentCount}`);

        await this.jobManager.updateJob(context.jobId, {
            targetDurationSeconds: plan.targetDurationSeconds,
            mainCaption: plan.mainCaption
        });

        return { ...context, plan };
    }

    private async createParablePlan(context: JobContext): Promise<ReelPlan> {
        // Parable plan is generated from parableScriptPlan in a separate step
        // This is a placeholder that returns a basic plan
        return {
            targetDurationSeconds: context.job.targetDurationRange.max,
            segmentCount: 4,
            musicTags: ['ambient', 'spiritual', 'meditative'],
            musicPrompt: 'Ambient meditative music',
            mood: 'contemplative',
            summary: 'A spiritual parable',
            mainCaption: ''
        };
    }
}
