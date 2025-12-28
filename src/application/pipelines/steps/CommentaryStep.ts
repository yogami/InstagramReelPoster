
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { ILlmClient, SegmentContent, ReelPlan } from '../../../domain/ports/ILlmClient';
import { JobManager } from '../../JobManager';
import { getConfig } from '../../../config';
import { TrainingDataCollector } from '../../../infrastructure/training/TrainingDataCollector';
import { estimateSpeakingDuration, needsTextAdjustment } from '../../../domain/services/DurationCalculator';

export class CommentaryStep implements PipelineStep {
    readonly name = 'Commentary';

    constructor(
        private readonly llmClient: ILlmClient,
        private readonly jobManager: JobManager
    ) { }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, plan, transcript, contentMode } = context;

        // SKIP if already done (resuming)
        if (context.segmentContent && context.segmentContent.length > 0) {
            console.log(`[${context.jobId}] Skipping commentary generation: already exists`);
            return context;
        }

        if (!plan) throw new Error('Reel plan required for commentary generation');

        let segmentContent: SegmentContent[] | null = null;

        // CHECK: User-provided commentary override
        if (job.providedCommentary) {
            console.log(`[${job.id}] Using user-provided commentary (${job.providedCommentary.length} chars)`);

            // Adjust commentary to fit target duration
            const adjustedCommentary = this.adjustProvidedCommentaryForDuration(
                job.providedCommentary,
                plan.targetDurationSeconds
            );

            // Create a single segment with the user's text
            segmentContent = [{
                commentary: adjustedCommentary,
                imagePrompt: adjustedCommentary.substring(0, 300),
                caption: adjustedCommentary.substring(0, 150)
            }];

            console.log(`[${job.id}] User commentary adjusted to ${adjustedCommentary.length} chars`);
        } else if (contentMode !== 'parable') {
            // Standard generation
            console.log(`[${job.id}] Generating commentary...`);
            segmentContent = await this.llmClient.generateSegmentContent(plan, transcript!);
        } else {
            console.log(`[${job.id}] Parable mode commentary handled in planning or context`);
            // segmentContent will be null here if not already in context
        }

        if (segmentContent) {
            const isParablePreGenerated = contentMode === 'parable';
            const isUserProvided = !!job.providedCommentary;

            // 1. Initial Validation
            if (!isParablePreGenerated && !isUserProvided) {
                this.validateSegmentCount(segmentContent, plan.segmentCount, 'Initial Generation');
            }

            // 2. Adjustment Phase
            if (!isParablePreGenerated && !isUserProvided) {
                segmentContent = await this.adjustCommentaryIfNeeded(plan, segmentContent);
                this.validateSegmentCount(segmentContent, plan.segmentCount, 'Adjustment Phase');
            }

            // Personal Clone: Collect text samples for training if enabled
            const config = getConfig();
            if (config.featureFlags.personalCloneTrainingMode) {
                try {
                    const collector = new TrainingDataCollector();
                    for (const segment of segmentContent) {
                        if (segment.commentary) {
                            await collector.collectTextSample(segment.commentary, 'commentary');
                        }
                    }
                    console.log('[PersonalClone] Collected text samples for training');
                } catch (err) {
                    console.warn('[PersonalClone] Failed to collect text samples:', err);
                }
            }

            await this.jobManager.updateJob(job.id, {
                // Persistent metadata if needed
            });
        }

        return { ...context, segmentContent: segmentContent || [] };
    }

    private async adjustCommentaryIfNeeded(
        plan: ReelPlan,
        segmentContent: SegmentContent[]
    ): Promise<SegmentContent[]> {
        const fullText = segmentContent.map((s) => s.commentary).join(' ');
        const estimate = estimateSpeakingDuration(fullText);
        const adjustment = needsTextAdjustment(estimate.estimatedSeconds, plan.targetDurationSeconds);

        if (adjustment === 'ok') {
            return segmentContent;
        }

        console.log(`[CommentaryStep] Text length adjustment needed: ${adjustment}`);
        return this.llmClient.adjustCommentaryLength(
            segmentContent,
            adjustment,
            plan.targetDurationSeconds
        );
    }

    private validateSegmentCount(segments: SegmentContent[], expected: number, stage: string): void {
        if (!Array.isArray(segments)) {
            throw new Error(`[${stage}] LLM returned non-array segment content: ${typeof segments}`);
        }

        if (segments.length !== expected) {
            throw new Error(
                `Segment count mismatch: Planned ${expected}, but generated ${segments.length}`
            );
        }

        // Additional sanity check: ensure no empty commentaries
        for (let i = 0; i < segments.length; i++) {
            if (!segments[i].commentary || segments[i].commentary.trim().length < 5) {
                throw new Error(`[${stage}] Segment ${i + 1} has missing or too-short commentary.`);
            }
        }
    }

    private adjustProvidedCommentaryForDuration(commentary: string, targetDurationSeconds: number): string {
        const config = getConfig();
        const speakingRateWps = config.speakingRateWps || 1.66;
        const maxWords = Math.floor(targetDurationSeconds * speakingRateWps * 0.95);

        const words = commentary.trim().split(/\s+/);

        if (words.length <= maxWords) {
            return commentary.trim();
        }

        const truncatedWords = words.slice(0, maxWords);
        let truncatedText = truncatedWords.join(' ');

        const lastSentenceEnd = Math.max(
            truncatedText.lastIndexOf('.'),
            truncatedText.lastIndexOf('!'),
            truncatedText.lastIndexOf('?')
        );

        const minUsablePosition = truncatedText.length * 0.7;
        if (lastSentenceEnd > minUsablePosition) {
            truncatedText = truncatedText.substring(0, lastSentenceEnd + 1);
        } else {
            truncatedText = truncatedText + '...';
        }

        return truncatedText;
    }
}
