/**
 * MediaAsset Domain Entity
 *
 * Represents a media asset (image/video) used in reel generation.
 * Tracks the source of the asset for prioritized sourcing.
 */

/**
 * Source of a media asset - used for prioritization.
 * Priority order: user > scraped > ai
 */
export type MediaSource = 'user' | 'scraped' | 'ai';

/**
 * A media asset used in reel generation.
 */
export interface MediaAsset {
    /** URL to the media asset */
    url: string;

    /** Source of the asset (determines priority) */
    source: MediaSource;

    /** Width in pixels */
    width?: number;

    /** Height in pixels */
    height?: number;

    /** Alt text or description */
    altText?: string;

    /** Scene index this asset is assigned to (if assigned) */
    assignedToScene?: number;
}

/**
 * Creates a MediaAsset from a user-provided URL.
 */
export function createUserMediaAsset(url: string, altText?: string): MediaAsset {
    return {
        url,
        source: 'user',
        altText,
    };
}

/**
 * Creates a MediaAsset from a scraped website image.
 */
export function createScrapedMediaAsset(
    url: string,
    width: number,
    height: number,
    altText?: string
): MediaAsset {
    return {
        url,
        source: 'scraped',
        width,
        height,
        altText,
    };
}

/**
 * Creates a MediaAsset from an AI-generated image.
 */
export function createAIMediaAsset(url: string): MediaAsset {
    return {
        url,
        source: 'ai',
    };
}

/**
 * Priority value for sorting - lower is higher priority.
 */
const SOURCE_PRIORITY: Record<MediaSource, number> = {
    user: 0,
    scraped: 1,
    ai: 2,
};

/**
 * Sorts media assets by source priority (user > scraped > ai).
 */
export function sortMediaByPriority(assets: MediaAsset[]): MediaAsset[] {
    return [...assets].sort(
        (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
    );
}

/**
 * Checks if an asset meets minimum resolution requirements.
 */
export function meetsMinimumResolution(
    asset: MediaAsset,
    minWidth: number = 800,
    minHeight: number = 600
): boolean {
    if (!asset.width || !asset.height) {
        // If dimensions unknown, assume it meets requirements (user uploads)
        return asset.source === 'user';
    }
    return asset.width >= minWidth && asset.height >= minHeight;
}
