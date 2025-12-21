/**
 * Structure for optimized reel hooks.
 */
export interface HookPlan {
    chosenHook: string;
    alternativeHooks: string[];
    targetDurationSeconds: number;
    segmentCount: number;
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
}

/**
 * Structure for per-reel performance metrics.
 */
export interface ReelAnalytics {
    reelId: string;                // internal job or external IG ID
    hookUsed: string;
    targetDurationSeconds: number;
    actualDurationSeconds: number;
    postedAt: string;

    // social metrics (filled later via Make.com/IG export)
    views?: number;
    avgWatchTimeSeconds?: number;
    completionRate?: number;       // 0–1
    saves?: number;
    shares?: number;
    likes?: number;
    comments?: number;
}
