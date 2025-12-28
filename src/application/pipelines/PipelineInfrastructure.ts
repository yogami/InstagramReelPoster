/**
 * Pipeline infrastructure for decomposing complex orchestration logic.
 * Each step has a single responsibility and complexity ≤3.
 */

import { ReelJob } from '../../domain/entities/ReelJob';
import { ReelPlan, SegmentContent } from '../../domain/ports/ILlmClient';
import { Segment } from '../../domain/entities/Segment';
import { ContentMode } from '../../domain/entities/Parable';

/**
 * JobContext carries all state through the pipeline.
 * Immutable pattern: each step returns a new context.
 */
export interface JobContext {
    readonly jobId: string;
    readonly job: ReelJob;

    // Transcription
    transcript?: string;

    // Mode Detection
    isAnimatedMode?: boolean;
    storyline?: string;
    contentMode?: ContentMode;
    forceMode?: string;

    // Planning
    plan?: ReelPlan;
    segmentContent?: SegmentContent[];
    parableIntent?: unknown;
    parableScriptPlan?: unknown;

    // Assets
    voiceoverUrl?: string;
    voiceoverDuration?: number;
    musicUrl?: string;
    musicDurationSeconds?: number;
    segments?: Segment[];

    // Video
    animatedVideoUrl?: string;
    animatedVideoUrls?: string[];

    // Caption
    captionBody?: string;
    hashtags?: string[];

    // Manifest
    subtitlesUrl?: string;
    manifestGenerated?: boolean;

    // Final
    finalVideoUrl?: string;
}

/**
 * Pipeline step interface.
 * Each step has exactly one responsibility.
 */
export interface PipelineStep {
    readonly name: string;
    execute(context: JobContext): Promise<JobContext>;
    shouldSkip?(context: JobContext): boolean;
}

/**
 * Creates initial context from job.
 */
export function createJobContext(jobId: string, job: ReelJob): JobContext {
    return {
        jobId,
        job,
        transcript: job.transcript,
        contentMode: job.contentMode,
        voiceoverUrl: job.voiceoverUrl,
        voiceoverDuration: job.voiceoverDurationSeconds,
        musicUrl: job.musicUrl,
        musicDurationSeconds: job.musicDurationSeconds,
        segments: job.segments,
        animatedVideoUrl: job.animatedVideoUrl,
        animatedVideoUrls: job.animatedVideoUrls,
        captionBody: job.captionBody,
        hashtags: job.hashtags,
        parableIntent: job.parableIntent,
        parableScriptPlan: job.parableScriptPlan,
        isAnimatedMode: job.isAnimatedVideoMode,
    };
}

/**
 * Executes a pipeline of steps sequentially.
 */
export async function executePipeline(
    context: JobContext,
    steps: PipelineStep[],
    onStepComplete?: (step: string, context: JobContext) => Promise<void>
): Promise<JobContext> {
    let currentContext = context;

    for (const step of steps) {
        if (step.shouldSkip?.(currentContext)) {
            console.log(`[Pipeline] Skipping ${step.name}`);
            continue;
        }

        console.log(`[Pipeline] Executing ${step.name}...`);
        currentContext = await step.execute(currentContext);

        if (onStepComplete) {
            await onStepComplete(step.name, currentContext);
        }
    }

    return currentContext;
}
