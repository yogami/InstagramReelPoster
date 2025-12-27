import { Segment } from './Segment';
import { ReelManifest } from './ReelManifest';
import { HookPlan } from './Growth';
import { ContentMode, ForceMode, ParableIntent, ParableScriptPlan } from './Parable';
import { WebsitePromoInput, WebsiteAnalysis, BusinessCategory, PromoScriptPlan } from './WebsitePromo';

/**
 * Possible statuses for a ReelJob.
 */
export type ReelJobStatus =
    | 'pending'
    | 'transcribing'
    | 'detecting_intent'
    | 'planning'
    | 'generating_commentary'
    | 'synthesizing_voiceover'
    | 'selecting_music'
    | 'generating_images'
    | 'generating_animated_video'
    | 'generating_subtitles'
    | 'building_manifest'
    | 'rendering'
    | 'uploading'
    | 'completed'
    | 'failed';

/**
 * Reel mode controls duration optimization strategy.
 * - 'discovery': Optimized for reach (10-20s), higher completion rates
 * - 'deep-dive': Longer format (25-40s), for series and complex topics
 */
export type ReelMode = 'discovery' | 'deep-dive';

/**
 * Input parameters for creating a new reel job.
 */
export interface ReelJobInput {
    /** URL to the source audio file (user's voice note) - optional if transcript provided */
    sourceAudioUrl?: string;
    /** Direct text transcript (bypasses transcription step) - alternative to sourceAudioUrl */
    transcript?: string;
    /** Optional target duration range in seconds */
    targetDurationRange?: {
        min: number;
        max: number;
    };
    /** Optional mood overrides for the reel */
    moodOverrides?: string[];
    /** Optional callback URL for webhook notification */
    callbackUrl?: string;
    /** Optional Telegram chat ID for user notifications */
    telegramChatId?: number;
    /** Optional trend context to bend hooks toward current macro topics */
    trendContext?: string;
    /** Optional series name for increased session watch time */
    seriesName?: string;
    /** Optional series number (e.g., "Part 3 of 10") */
    seriesNumber?: number;
    /** Optional reel mode: 'discovery' (10-20s) or 'deep-dive' (25-40s) */
    reelMode?: ReelMode;
    /** Force content mode: 'direct', 'parable', or 'website-promo' (overrides auto-detection) */
    forceMode?: ForceMode;
    /** Website promo input (alternative to sourceAudioUrl/transcript) */
    websitePromoInput?: WebsitePromoInput;
    /** Optional language for the reel (e.g., 'en', 'de') */
    language?: string;
    /** Optional voice ID for TTS synthesis */
    voiceId?: string;
}

/**
 * ReelJob represents the full state of a reel generation job.
 */
export interface ReelJob {
    /** Unique identifier for the job */
    id: string;
    /** Current status of the job */
    status: ReelJobStatus;
    /** Current processing step description */
    currentStep?: string;
    /** URL to the source audio file */
    sourceAudioUrl: string;
    /** Callback URL for webhook notification */
    callbackUrl?: string;
    /** Telegram chat ID for user notifications */
    telegramChatId?: number;
    /** Target duration range in seconds */
    targetDurationRange: {
        min: number;
        max: number;
    };
    moodOverrides?: string[];
    /** Optional trend context */
    trendContext?: string;
    /** Optional series name */
    seriesName?: string;
    /** Optional series number */
    seriesNumber?: number;
    /** Optional reel mode */
    reelMode?: ReelMode;

    // Populated during processing:
    /** Transcribed text from the source audio */
    transcript?: string;
    /** Target duration chosen by the LLM */
    targetDurationSeconds?: number;
    /** The primary, viral-style caption for the final video post (generated during planning) */
    mainCaption?: string;
    /** Segments (story beats) for the reel */
    segments?: Segment[];
    /** Full commentary text (concatenated from segments) */
    fullCommentary?: string;
    /** URL to the generated voiceover audio */
    voiceoverUrl?: string;
    /** Actual duration of the voiceover in seconds */
    voiceoverDurationSeconds?: number;
    /** URL to the selected/generated music */
    musicUrl?: string;
    /** Duration of the selected music in seconds */
    musicDurationSeconds?: number;
    /** Source of the music: 'catalog', 'internal', or 'ai' */
    musicSource?: 'catalog' | 'internal' | 'ai';
    /** URL to the generated subtitles file */
    subtitlesUrl?: string;
    /** The complete manifest sent to Shortstack */
    manifest?: ReelManifest;
    /** URL to the final rendered video */
    finalVideoUrl?: string;

    /** Whether this reel uses animated video instead of images */
    isAnimatedVideoMode?: boolean;
    /** URL to the generated animated video (for animated mode) */
    animatedVideoUrl?: string;
    /** Multiple URLs to animated videos (to be concatenated) */
    animatedVideoUrls?: string[];

    /** Error message if the job failed */
    error?: string;

    // Phase 2 Growth Layer:
    /** Optimized hook plan */
    hookPlan?: HookPlan;
    /** Voice ID used for TTS synthesis */
    voiceId?: string;
    /** Expanded caption body (re-generated for virality) */
    captionBody?: string;
    /** Array of optimized hashtags */
    hashtags?: string[];

    // Parable Mode:
    /** Content mode: direct-message or parable */
    contentMode?: ContentMode;
    /** Extracted parable intent (if parable mode) */
    parableIntent?: ParableIntent;
    /** Parable script plan (if parable mode) */
    parableScriptPlan?: ParableScriptPlan;

    // Website Promo Mode:
    /** Website promo input (if website-promo mode) */
    websitePromoInput?: WebsitePromoInput;
    /** Scraped website analysis results */
    websiteAnalysis?: WebsiteAnalysis;
    /** Detected business category */
    businessCategory?: BusinessCategory;
    /** Generated promo script plan */
    promoScriptPlan?: PromoScriptPlan;
    /** Forced generation mode */
    forceMode?: ForceMode;
    /** Language for the reel */
    language?: string;

    /** Timestamps */
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Creates a new ReelJob with initial state.
 */
export function createReelJob(
    id: string,
    input: ReelJobInput,
    defaultDurationRange: { min: number; max: number }
): ReelJob {
    if (!id.trim()) {
        throw new Error('ReelJob id cannot be empty');
    }

    // Validate: either sourceAudioUrl, transcript, or websitePromoInput must be provided
    const hasAudio = input.sourceAudioUrl && input.sourceAudioUrl.trim().length > 0;
    const hasTranscript = input.transcript && input.transcript.trim().length > 0;
    const hasWebsitePromo = input.websitePromoInput && input.websitePromoInput.websiteUrl.trim().length > 0;

    if (!hasAudio && !hasTranscript && !hasWebsitePromo) {
        throw new Error('ReelJob requires either sourceAudioUrl, transcript, or websitePromoInput');
    }

    // Validate consent for website promo
    if (hasWebsitePromo && !input.websitePromoInput!.consent) {
        throw new Error('websitePromoInput requires consent to be true');
    }

    const now = new Date();
    const durationRange = input.targetDurationRange ?? defaultDurationRange;

    if (durationRange.min <= 0 || durationRange.max <= 0) {
        throw new Error('Duration range values must be positive');
    }
    if (durationRange.min > durationRange.max) {
        throw new Error('Duration range min cannot be greater than max');
    }

    return {
        id: id.trim(),
        status: 'pending',
        sourceAudioUrl: hasAudio ? input.sourceAudioUrl!.trim() : '',
        transcript: hasTranscript ? input.transcript!.trim() : undefined,
        targetDurationRange: durationRange,
        moodOverrides: input.moodOverrides,
        callbackUrl: input.callbackUrl,
        telegramChatId: input.telegramChatId,
        trendContext: input.trendContext,
        seriesName: input.seriesName,
        seriesNumber: input.seriesNumber,
        reelMode: input.reelMode,
        forceMode: input.forceMode,
        websitePromoInput: hasWebsitePromo ? input.websitePromoInput : undefined,
        language: input.language || 'en',
        voiceId: input.voiceId,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Updates a ReelJob's status and step, returning a new object.
 */
export function updateJobStatus(
    job: ReelJob,
    status: ReelJobStatus,
    currentStep?: string
): ReelJob {
    return {
        ...job,
        status,
        currentStep,
        updatedAt: new Date(),
    };
}

/**
 * Marks a job as failed with an error message.
 */
export function failJob(job: ReelJob, error: string): ReelJob {
    return {
        ...job,
        status: 'failed',
        error,
        updatedAt: new Date(),
    };
}

/**
 * Marks a job as completed with all final URLs.
 */
export function completeJob(
    job: ReelJob,
    finalVideoUrl: string,
    manifest: ReelManifest
): ReelJob {
    return {
        ...job,
        status: 'completed',
        finalVideoUrl,
        manifest,
        currentStep: undefined,
        updatedAt: new Date(),
    };
}

/**
 * Checks if a job is in a terminal state.
 */
export function isJobTerminal(job: ReelJob): boolean {
    return job.status === 'completed' || job.status === 'failed';
}
