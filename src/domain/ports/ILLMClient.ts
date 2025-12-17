import { Segment } from '../entities/Segment';

/**
 * ReelPlan represents the LLM's planning output for a reel.
 */
export interface ReelPlan {
    /** Target duration for the reel in seconds */
    targetDurationSeconds: number;
    /** Number of segments (story beats) */
    segmentCount: number;
    /** Synthesized music search tags */
    musicTags: string[];
    /** Music prompt for AI generation fallback */
    musicPrompt: string;
    /** Mood/tone for the reel */
    mood: string;
    /** Brief summary of the reel concept */
    summary: string;
}

/**
 * SegmentContent represents the LLM's generated content for a segment.
 */
export interface SegmentContent {
    /** The commentary text (1-2 sentences) */
    commentary: string;
    /** Image generation prompt */
    imagePrompt: string;
    /** Optional caption for subtitles */
    caption?: string;
}

/**
 * PlanningConstraints are passed to the LLM for planning.
 */
export interface PlanningConstraints {
    minDurationSeconds: number;
    maxDurationSeconds: number;
    moodOverrides?: string[];
}

/**
 * ILLMClient - Port for LLM services.
 * Handles reel planning, commentary generation, and prompt synthesis.
 * Implementations: OpenAILLMClient
 */
export interface ILLMClient {
    /**
     * Plans the structure of a reel based on the transcript.
     * @param transcript The transcribed user voice note
     * @param constraints Duration and mood constraints
     * @returns Reel plan with target duration, segment count, and music tags
     */
    planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan>;

    /**
     * Generates commentary and image prompts for each segment.
     * @param plan The reel plan
     * @param transcript Original transcript for context
     * @returns Array of segment content
     */
    generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]>;

    /**
     * Adjusts commentary length to better match target duration.
     * @param segments Current segments
     * @param direction Whether to make text shorter or longer
     * @param targetDurationSeconds Target duration
     * @returns Adjusted segment content
     */
    adjustCommentaryLength(
        segments: SegmentContent[],
        direction: 'shorter' | 'longer',
        targetDurationSeconds: number
    ): Promise<SegmentContent[]>;
}
