
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { IHookAndStructureService } from '../../../domain/ports/IHookAndStructureService';
import { JobManager } from '../../JobManager';

export class HookStep implements PipelineStep {
    readonly name = 'Hook';

    constructor(
        private readonly hookService: IHookAndStructureService,
        private readonly jobManager: JobManager
    ) { }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, transcript, plan, contentMode } = context;

        if (contentMode === 'parable' || (contentMode as string) === 'promo') {
            console.log(`[${job.id}] Skipping Hook optimization for ${contentMode} mode`);
            return context;
        }

        if (!plan) throw new Error('Plan required for Hook optimization');
        if (!transcript) throw new Error('Transcript required for Hook optimization');

        console.log(`[${job.id}] Optimizing hook and structure...`);

        const hookPlan = await this.hookService.optimizeStructure(transcript, plan);

        // Fix 12: HookPlan should NOT override enforced segment count
        // DO NOT override plan.segmentCount
        // Retention: We keep the LLM's planned segment count to avoid mismatch during generation

        await this.jobManager.updateJob(job.id, { hookPlan });

        return { ...context, hookPlan };
    }
}
