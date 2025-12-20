import { Segment } from './Segment';
import { ReelManifest } from './ReelManifest';

/**
 * Possible statuses for a ReelJob.
 */
export type ReelJobStatus =
    | 'pending'
    | 'transcribing'
    | 'planning'
    | 'generating_commentary'
    | 'synthesizing_voiceover'
    | 'selecting_music'
    | 'generating_images'
    | 'generating_subtitles'
    | 'building_manifest'
    | 'rendering'
    | 'uploading'
    | 'completed'
    | 'failed';

/**
 * Input parameters for creating a new reel job.
 */
export interface ReelJobInput {
    /** URL to the source audio file (user's voice note) */
    sourceAudioUrl: string;
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
    /** Optional mood overrides */
    moodOverrides?: string[];

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

    /** Error message if the job failed */
    error?: string;

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
    if (!input.sourceAudioUrl.trim()) {
        throw new Error('ReelJob sourceAudioUrl cannot be empty');
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
        sourceAudioUrl: input.sourceAudioUrl.trim(),
        targetDurationRange: durationRange,
        moodOverrides: input.moodOverrides,
        callbackUrl: input.callbackUrl,
        telegramChatId: input.telegramChatId,
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
