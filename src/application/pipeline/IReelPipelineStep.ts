/**
 * Pipeline Step Interface (Phase 3 Preparation)
 * 
 * This interface defines the contract for individual pipeline steps
 * in the reel generation workflow. The ReelOrchestrator can be
 * decomposed into discrete steps implementing this interface.
 */

import { ReelJob } from '../domain/entities/ReelJob';
import { Segment } from '../domain/entities/Segment';
import { ReelPlan, SegmentContent } from '../domain/ports/ILLMClient';
import { ReelManifest } from '../domain/entities/ReelManifest';

/**
 * Shared context passed between pipeline steps.
 */
export interface PipelineContext {
    // Job information
    jobId: string;
    job: ReelJob;

    // Transcription
    sourceAudioUrl?: string;
    transcript?: string;

    // Planning
    plan?: ReelPlan;

    // Content Generation
    segmentContent?: SegmentContent[];

    // Voiceover
    voiceoverUrl?: string;
    voiceoverDuration?: number;

    // Segments with timing
    segments?: Segment[];

    // Music
    musicTrack?: {
        audioUrl: string;
        durationSeconds: number;
        source: 'catalog' | 'ai' | 'internal';
    };

    // Subtitles
    subtitlesUrl?: string;

    // Final output
    manifest?: ReelManifest;
    finalVideoUrl?: string;

    // Error handling
    error?: Error;
}

/**
 * Interface for pipeline steps.
 * Each step receives the context, performs its work, and returns the updated context.
 */
export interface IReelPipelineStep {
    /** Human-readable name of this step */
    readonly name: string;

    /** The job status to set when this step starts */
    readonly statusName: ReelJob['status'];

    /** User-friendly description of what this step does */
    readonly description: string;

    /**
     * Executes this pipeline step.
     * @param context The shared pipeline context
     * @returns Updated context after this step completes
     * @throws Error if the step fails
     */
    execute(context: PipelineContext): Promise<PipelineContext>;

    /**
     * Optional cleanup method if the step needs to release resources.
     */
    cleanup?(context: PipelineContext): Promise<void>;
}

/**
 * Pipeline Step Factory - Creates the ordered list of steps for reel processing.
 * 
 * Future implementation will create instances of:
 * 1. TranscriptionStep
 * 2. PlanningStep
 * 3. ContentGenerationStep
 * 4. VoiceoverStep
 * 5. MusicStep
 * 6. ImageGenerationStep
 * 7. SubtitleStep
 * 8. RenderStep
 * 9. UploadStep
 * 10. NotificationStep
 */
export function createReelPipeline(): IReelPipelineStep[] {
    // TODO: Implement individual step classes
    // For now, return empty array - the orchestrator still uses monolithic processJob()
    return [];
}
