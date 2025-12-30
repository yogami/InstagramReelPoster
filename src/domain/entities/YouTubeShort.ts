/**
 * YouTube Shorts Domain Entities
 *
 * Types and interfaces for YouTube Shorts video generation mode.
 * Supports structured script input with timestamps, visuals, and narration.
 */

/**
 * A single scene in a YouTube Short.
 * Each scene has timing, visual prompt, and narration.
 */
export interface YouTubeScene {
    /** Start timestamp (e.g., "0:00") */
    startTime: string;
    /** End timestamp (e.g., "0:10") */
    endTime: string;
    /** Scene title/label (e.g., "The Collision") */
    title: string;
    /** Visual/image generation prompt */
    visualPrompt: string;
    /** Spoken narration text */
    narration: string;
    /** Calculated duration in seconds */
    durationSeconds?: number;
}

/**
 * Input for creating a YouTube Short job.
 */
export interface YouTubeShortInput {
    /** Video title (e.g., "The Geological Birth of India") */
    title: string;
    /** Total target runtime in seconds */
    totalDurationSeconds: number;
    /** Tone/style (e.g., "Epic & Fast-Paced") */
    tone?: string;
    /** Array of scenes with timing and content */
    scenes: YouTubeScene[];
}

/**
 * Complete script plan for a YouTube Short.
 */
export interface YouTubeShortScriptPlan {
    /** Mode discriminator */
    mode: 'youtube-short';
    /** Video title */
    title: string;
    /** Parsed scenes */
    scenes: YouTubeScene[];
    /** Total duration in seconds */
    totalDurationSeconds: number;
    /** Tone/style */
    tone?: string;
}

/**
 * Parses timestamp string (e.g., "0:25") to seconds.
 */
export function parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

/**
 * Type guard for YouTubeShortInput.
 */
export function isYouTubeShortInput(obj: unknown): obj is YouTubeShortInput {
    if (!obj || typeof obj !== 'object') return false;
    const input = obj as Record<string, unknown>;
    return (
        typeof input.title === 'string' &&
        input.title.length > 0 &&
        typeof input.totalDurationSeconds === 'number' &&
        input.totalDurationSeconds > 0 &&
        Array.isArray(input.scenes) &&
        input.scenes.length > 0
    );
}

/**
 * Type guard for YouTubeShortScriptPlan.
 */
export function isYouTubeShortScriptPlan(obj: unknown): obj is YouTubeShortScriptPlan {
    if (!obj || typeof obj !== 'object') return false;
    const plan = obj as Record<string, unknown>;
    return (
        plan.mode === 'youtube-short' &&
        typeof plan.title === 'string' &&
        Array.isArray(plan.scenes) &&
        plan.scenes.length > 0
    );
}
