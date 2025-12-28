
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ILlmClient, ReelPlan, SegmentContent } from '../../../domain/ports/ILlmClient';
import { JobManager } from '../../JobManager';
import { ParableBeat } from '../../../domain/entities/Parable';

export class PlanningStep implements PipelineStep {
    readonly name = 'Planning';

    constructor(
        private readonly llmClient: ILlmClient,
        private readonly jobManager: JobManager
    ) { }

    shouldSkip(context: JobContext): boolean {
        return !!context.plan;
    }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, transcript, contentMode } = context;
        const jobId = context.jobId;

        let plan: ReelPlan;
        let segmentContent: SegmentContent[] | undefined;

        if (contentMode === 'parable') {
            console.log(`[${jobId}] Planning PARABLE...`);
            try {
                // 1. Extract Intent
                let parableIntent = job.parableIntent;
                const planningSource = job.providedCommentary || transcript!;
                if (!parableIntent && this.llmClient.extractParableIntent) {
                    parableIntent = await this.llmClient.extractParableIntent(planningSource);
                    await this.jobManager.updateJob(jobId, { parableIntent });
                }

                if (!parableIntent) throw new Error('Failed to extract parable intent');

                // 2. Choose Source
                let sourceChoice = job.parableScriptPlan?.sourceChoice;
                if (!sourceChoice) {
                    if (parableIntent.sourceType === 'theme-only' && this.llmClient.chooseParableSource) {
                        sourceChoice = await this.llmClient.chooseParableSource(parableIntent);
                    } else {
                        sourceChoice = {
                            culture: parableIntent.culturalPreference || 'generic-eastern',
                            archetype: 'sage',
                            rationale: 'Default selection'
                        };
                    }
                }

                // 3. Generate Script
                const targetDuration = Math.min(job.targetDurationRange.max, 45);
                if (!this.llmClient.generateParableScript) throw new Error('LLM Client does not support parable scripting');

                const parableScriptPlan = await this.llmClient.generateParableScript(
                    parableIntent,
                    sourceChoice!,
                    targetDuration
                );
                await this.jobManager.updateJob(jobId, { parableScriptPlan });

                // 4. Map to segments
                segmentContent = parableScriptPlan.beats.map((beat: ParableBeat) => ({
                    commentary: beat.narration,
                    imagePrompt: beat.imagePrompt,
                    caption: beat.textOnScreen
                }));

                // 5. Create Plan
                plan = {
                    targetDurationSeconds: parableScriptPlan.beats.reduce((sum: number, b: ParableBeat) => sum + b.approxDurationSeconds, 0),
                    segmentCount: parableScriptPlan.beats.length,
                    musicTags: ['ambient', 'spiritual', 'meditative'],
                    musicPrompt: `Ambient meditative music for a ${sourceChoice!.culture} ${sourceChoice!.archetype} story`,
                    mood: 'contemplative',
                    summary: `A ${sourceChoice!.archetype} story about ${parableIntent.coreTheme}`,
                    mainCaption: parableIntent.moral
                };

            } catch (err) {
                console.warn(`[${jobId}] Parable planning failed, falling back to standard:`, err);
                plan = await this.llmClient.planReel(transcript!, {
                    minDurationSeconds: job.targetDurationRange.min,
                    maxDurationSeconds: job.targetDurationRange.max,
                    moodOverrides: job.moodOverrides,
                });
            }
        } else {
            plan = await this.llmClient.planReel(transcript!, {
                minDurationSeconds: job.targetDurationRange.min,
                maxDurationSeconds: job.targetDurationRange.max,
                moodOverrides: job.moodOverrides,
            });
        }

        console.log(`[${jobId}] Plan: target=${plan.targetDurationSeconds}s, segments=${plan.segmentCount}`);

        await this.jobManager.updateJob(jobId, {
            targetDurationSeconds: plan.targetDurationSeconds,
            mainCaption: plan.mainCaption
        });

        return {
            ...context,
            plan,
            segmentContent: segmentContent || context.segmentContent,
            parableScriptPlan: (context as any).parableScriptPlan || (job as any).parableScriptPlan
        };
    }
}
