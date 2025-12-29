import { Segment } from '../entities/Segment';
import { HookPlan, CaptionAndTags } from '../entities/Growth';
import {
    ContentMode,
    ParableIntent,
    ParableSourceChoice,
    ParableScriptPlan,
} from '../entities/Parable';
import {
    BusinessCategory,
    WebsiteAnalysis,
    CategoryPromptTemplate,
    PromoScriptPlan,
} from '../entities/WebsitePromo';

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
    /** The primary, viral-style caption for the final video post */
    mainCaption: string;
    /** Zoom effect type for static image reels (FLUX optimization) */
    zoomType?: 'slow_zoom_in' | 'slow_zoom_out' | 'ken_burns' | 'alternating' | 'static';
}

/**
 * SegmentContent represents the LLM's generated content for a segment.
 */
export interface SegmentContent {
    /** The commentary text (1-2 sentences) */
    commentary: string;
    /** Image generation prompt (100-140 words with visual specs) */
    imagePrompt: string;
    /** Optional caption for subtitles */
    caption?: string;

    /** Visual specifications for image generation */
    visualSpecs?: {
        shot: 'close-up' | 'medium' | 'wide';
        lens: '35mm' | '50mm' | '85mm';
        framing: 'rule-of-thirds' | 'centered' | 'leading-lines';
        angle: 'eye-level' | 'low' | 'high';
        lighting: 'soft-warm' | 'hard-cool' | 'dramatic' | 'natural';
        colorGrade: 'vivid-cinematic' | 'teal-orange' | 'warm-filmic' | 'rich-natural';
    };

    /** Continuity tags for sequential prompting (visual consistency + motion) */
    continuityTags?: {
        location: string;
        timeOfDay: string;
        dominantColor: string;
        heroProp: string;
        wardrobeDetail: string;
        /** Zoom/pan effect for this segment (FLUX optimization) */
        zoomEffect?: 'slow_zoom_in' | 'slow_zoom_out' | 'ken_burns_left' | 'ken_burns_right' | 'static';
        /** Caption overlay position */
        captionPosition?: 'bottom_center' | 'top_left' | 'center';
    };

    /** Brief summary of narrative progression (cause→effect) */
    deltaSummary?: string;
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
 * Result from reel mode detection (animated vs images).
 */
export interface ReelModeDetectionResult {
    /** Whether the user wants an animated video instead of static images */
    isAnimatedMode: boolean;
    /** Optional storyline if the user specified one */
    storyline?: string;
    /** Reason for the detection decision */
    reason: string;
}

/**
 * Result from content mode detection (direct-message vs parable).
 */
export interface ContentModeDetectionResult {
    /** Whether the content should be direct commentary or a parable */
    contentMode: ContentMode;
    /** Reason for the detection decision */
    reason: string;
}

/**
 * ILlmClient - Port for LLM services.
 * Handles reel planning, commentary generation, and prompt synthesis.
 * Implementations: GptLlmClient, LocalLlmClient
 */
export interface ILlmClient {
    /**
     * Detects whether the user wants an animated video reel based on their transcript.
     * @param transcript The transcribed user voice note
     * @returns Detection result with isAnimatedMode flag and optional storyline
     */
    detectReelMode(transcript: string): Promise<ReelModeDetectionResult>;

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

    /**
     * Generates multiple hook options for the reel.
     * @param transcript Full transcript
     * @param plan Current reel plan
     * @param trendContext Optional trend context to bend hooks toward current topics
     * @returns Array of optimized hooks
     */
    generateHooks(transcript: string, plan: ReelPlan, trendContext?: string): Promise<string[]>;

    /**
     * Generates an expanded caption and hashtags optimized for virality.
     * @param fullScript Final voiceover script
     * @param summary Core story summary
     * @returns Optimized caption and hashtags
     */
    generateCaptionAndTags(fullScript: string, summary: string): Promise<CaptionAndTags>;

    // ============================================
    // PARABLE MODE METHODS
    // ============================================

    /**
     * Detects whether the transcript is story-oriented (parable) or direct commentary.
     * @param transcript The transcribed user voice note
     * @returns Detection result with contentMode and reason
     */
    detectContentMode?(transcript: string): Promise<ContentModeDetectionResult>;

    /**
     * Extracts parable intent from transcript.
     * @param transcript The transcribed user voice note
     * @returns Extracted intent with theme, moral, and constraints
     */
    extractParableIntent?(transcript: string): Promise<ParableIntent>;

    /**
     * Chooses story-world for theme-only parables.
     * @param intent The extracted parable intent
     * @returns Selected culture and archetype with rationale
     */
    chooseParableSource?(intent: ParableIntent): Promise<ParableSourceChoice>;

    /**
     * Generates complete parable script with 4-beat structure.
     * @param intent The extracted parable intent
     * @param sourceChoice The selected story-world
     * @param targetDurationSeconds Target duration for the parable
     * @returns Complete parable script plan
     */
    generateParableScript?(
        intent: ParableIntent,
        sourceChoice: ParableSourceChoice,
        targetDurationSeconds: number
    ): Promise<ParableScriptPlan>;

    /**
     * Generates hooks specifically for parable content.
     * @param parableScript The generated parable script
     * @param trendContext Optional trend context
     * @returns Array of parable-specific hooks
     */
    generateParableHooks?(
        parableScript: ParableScriptPlan,
        trendContext?: string
    ): Promise<string[]>;

    /**
     * Generates captions optimized for parable content.
     * @param parableScript The generated parable script
     * @param summary Core story summary
     * @returns Optimized caption and hashtags for parable
     */
    generateParableCaptionAndTags?(
        parableScript: ParableScriptPlan,
        summary: string
    ): Promise<CaptionAndTags>;

    // ============================================
    // INTELLIGENT MUSIC SELECTION
    // ============================================

    /**
     * Selects music tags based on content analysis.
     * Analyzes transcript, mood, and cultural context to pick optimal music tags.
     * @param transcript The content transcript or summary
     * @param mood Mood/tone from the reel plan
     * @param culture Optional detected culture (indian, chinese, japanese, etc.)
     * @returns Array of 3-5 music tags that best match the content
     */
    selectMusicTags?(
        transcript: string,
        mood: string,
        culture?: string,
        context?: string
    ): Promise<string[]>;

    // ============================================
    // WEBSITE PROMO MODE METHODS
    // ============================================

    /**
     * Detects business category from scraped website content.
     * Uses LLM analysis to understand the business type.
     * @param analysis Scraped website analysis
     * @returns Detected business category
     */
    detectBusinessCategory?(analysis: WebsiteAnalysis): Promise<BusinessCategory>;

    /**
     * Generates a promotional reel script from website content.
     * Creates hook → showcase → CTA structure based on category template.
     * @param analysis Scraped website content
     * @param category Detected or provided business category
     * @param template Category-specific prompt template
     * @param businessName Business name
     * @returns Generated promo script plan
     */
    generatePromoScript?(
        analysis: WebsiteAnalysis,
        category: BusinessCategory,
        template: CategoryPromptTemplate,
        businessName: string,
        language: string
    ): Promise<PromoScriptPlan>;
}
