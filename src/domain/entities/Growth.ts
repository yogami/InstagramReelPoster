/**
 * Hook style classification for analytics.
 */
export type HookStyle = 'call-out' | 'question' | 'paradox' | 'statement' | 'shocking-fact' | 'other';

/**
 * Content mode for analytics segmentation.
 */
export type { ContentMode } from './Parable';

/**
 * Structure for optimized reel hooks.
 */
export interface HookPlan {
    chosenHook: string;
    alternativeHooks: string[];
    targetDurationSeconds: number;
    segmentCount: number;
    /** Hook style/tone for analytics tracking */
    hookStyle?: HookStyle;
    segmentsHint?: Array<{
        index: number;
        role: "hook" | "body" | "payoff";
    }>;
}

/**
 * Structure for social captions and hashtags.
 */
export interface CaptionAndTags {
    captionBody: string;   // 2–4 short lines, ends with save/share CTA
    hashtags: string[];    // 9–11 tags
    /** Optional series info added to caption */
    seriesTag?: string;
}

/**
 * Structure for per-reel performance metrics.
 */
export interface ReelAnalytics {
    reelId: string;                // internal job or external IG ID
    hookUsed: string;
    /** Hook style for pattern analysis */
    hookStyle?: HookStyle;
    targetDurationSeconds: number;
    actualDurationSeconds: number;
    postedAt: string;
    /** Topic cluster for slicing data */
    topicCluster?: string;
    /** Content mode for performance comparison */
    contentMode?: 'direct-message' | 'parable';

    // social metrics (filled later via Make.com/IG export)
    views?: number;
    avgWatchTimeSeconds?: number;
    completionRate?: number;       // 0–1
    saves?: number;
    shares?: number;
    likes?: number;
    comments?: number;
    /** Calculated: saves per 1k views */
    savesPerThousand?: number;
    /** Calculated: shares per 1k views */
    sharesPerThousand?: number;
}
