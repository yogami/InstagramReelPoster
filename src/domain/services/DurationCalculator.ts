import { getConfig } from '../../config';

/**
 * DurationCalculator provides utilities for estimating and adjusting
 * voiceover duration based on word count and speaking rate.
 */

export interface DurationEstimate {
    estimatedSeconds: number;
    wordCount: number;
    speakingRate: number;
}

/**
 * Estimates the speaking duration for a given text.
 * @param text The text to estimate duration for
 * @param speakingRateWps Optional override for words per second
 */
export function estimateSpeakingDuration(
    text: string,
    speakingRateWps?: number
): DurationEstimate {
    const config = getConfig();
    const rate = speakingRateWps ?? config.speakingRateWps;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const estimatedSeconds = wordCount / rate;

    return {
        estimatedSeconds,
        wordCount,
        speakingRate: rate,
    };
}

/**
 * Calculates the target word count for a desired duration.
 * @param targetSeconds Desired duration in seconds
 * @param speakingRateWps Optional override for words per second
 */
export function calculateTargetWordCount(
    targetSeconds: number,
    speakingRateWps?: number
): number {
    const config = getConfig();
    const rate = speakingRateWps ?? config.speakingRateWps;
    // Target 99% of the duration to allow for natural pauses while staying in the 95-100% range
    return Math.floor(targetSeconds * 0.99 * rate);
}

/**
 * Checks if the estimated duration is within acceptable tolerance of the target.
 * @param estimatedSeconds The estimated duration
 * @param targetSeconds The target duration
 * @param toleranceSeconds Acceptable deviation (default: 0.5)
 */
export function isDurationWithinTolerance(
    estimatedSeconds: number,
    targetSeconds: number,
    toleranceSeconds: number = 0.5
): boolean {
    return Math.abs(estimatedSeconds - targetSeconds) <= toleranceSeconds;
}

/**
 * Calculates the TTS speed adjustment needed to match target duration.
 * @param actualDuration The actual voiceover duration from TTS
 * @param targetDuration The desired duration
 * @param minSpeed Minimum allowed speed (default: 0.85)
 * @param maxSpeed Maximum allowed speed (default: 1.25)
 * @returns Speed adjustment factor, clamped to [minSpeed, maxSpeed]
 */
export function calculateSpeedAdjustment(
    actualDuration: number,
    targetDuration: number,
    minSpeed: number = 0.85,
    maxSpeed: number = 1.25
): number {
    if (targetDuration <= 0 || actualDuration <= 0) {
        return 1.0;
    }

    // Speed = actual / target (if actual is longer, we need to speed up)
    const rawSpeed = actualDuration / targetDuration;
    return Math.max(minSpeed, Math.min(maxSpeed, rawSpeed));
}

/**
 * Determines whether text needs to be adjusted to better match target duration.
 * @param estimatedSeconds Estimated speaking duration
 * @param targetSeconds Target duration
 * @param tolerancePercent Maximum acceptable deviation as a percentage (default: 0.03 = 3%)
 */
export function needsTextAdjustment(
    estimatedSeconds: number,
    targetSeconds: number,
    tolerancePercent: number = 0.05
): 'shorter' | 'longer' | 'ok' {
    const deviation = (estimatedSeconds - targetSeconds) / targetSeconds;

    // Strict requirement: 95% to 100% of video length.
    // Deviation must be between -0.05 and 0.0
    // We use a slightly smaller tolerance for the check to trigger adjustment early.
    if (deviation > 0) {
        return 'shorter';
    }
    if (deviation < -tolerancePercent) {
        return 'longer';
    }
    return 'ok';
}

/**
 * Distributes total duration across N segments evenly.
 * @param totalDuration Total reel duration in seconds
 * @param segmentCount Number of segments
 * @returns Array of segment durations
 */
export function distributeSegmentDurations(
    totalDuration: number,
    segmentCount: number
): number[] {
    if (segmentCount <= 0) {
        return [];
    }

    const baseDuration = totalDuration / segmentCount;
    return Array(segmentCount).fill(baseDuration);
}

/**
 * Calculates start and end times for segments given their durations.
 * @param durations Array of segment durations
 * @returns Array of { start, end } objects
 */
export function calculateSegmentTimings(
    durations: number[]
): Array<{ start: number; end: number }> {
    const timings: Array<{ start: number; end: number }> = [];
    let currentTime = 0;

    for (const duration of durations) {
        timings.push({
            start: currentTime,
            end: currentTime + duration,
        });
        currentTime += duration;
    }

    return timings;
}

/**
 * Truncates text to fit within a target speaking duration.
 * Attempts to truncate at sentence boundaries for natural speech.
 * @param text The text to truncate
 * @param maxSeconds Maximum allowed duration
 * @param speakingRateWps Optional override for words per second
 * @returns Truncated text that fits within duration
 */
export function truncateToFitDuration(
    text: string,
    maxSeconds: number,
    speakingRateWps?: number
): string {
    if (!text || text.trim().length === 0) {
        return '';
    }

    const config = getConfig();
    const rate = speakingRateWps ?? config.speakingRateWps;
    const maxWords = Math.floor(maxSeconds * rate);

    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) {
        return text.trim();
    }

    // Truncate to max words
    const truncatedWords = words.slice(0, maxWords);
    let truncated = truncatedWords.join(' ');

    // Try to find the last sentence boundary
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclaim = truncated.lastIndexOf('!');
    const lastBoundary = Math.max(lastPeriod, lastQuestion, lastExclaim);

    // If we found a sentence boundary and it's not too early (at least 50% of text)
    if (lastBoundary > truncated.length * 0.5) {
        truncated = truncated.substring(0, lastBoundary + 1);
    }

    return truncated.trim();
}
