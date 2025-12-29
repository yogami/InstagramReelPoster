/**
 * Segment represents a single story beat within a reel.
 * Each segment has a portion of the voiceover and an associated image.
 */
export interface Segment {
    /** Zero-based index of the segment */
    index: number;
    /** Start time in seconds from the beginning of the reel */
    startSeconds: number;
    /** End time in seconds from the beginning of the reel */
    endSeconds: number;
    /** The voiceover commentary for this segment (1-2 sentences) */
    commentary: string;
    /** The prompt used to generate the image for this segment */
    imagePrompt: string;
    /** URL of the generated image (populated after image generation) */
    imageUrl?: string;
    /** Optional caption/subtitle for this segment */
    caption?: string;
    /** FLUX optimization: zoom/pan effect for post-production motion */
    zoomEffect?: 'slow_zoom_in' | 'slow_zoom_out' | 'ken_burns_left' | 'ken_burns_right' | 'static';
}

/**
 * Creates a new Segment with validated properties.
 */
export function createSegment(params: {
    index: number;
    startSeconds: number;
    endSeconds: number;
    commentary: string;
    imagePrompt: string;
    imageUrl?: string;
    caption?: string;
    zoomEffect?: 'slow_zoom_in' | 'slow_zoom_out' | 'ken_burns_left' | 'ken_burns_right' | 'static';
}): Segment {
    if (params.index < 0) {
        throw new Error('Segment index must be non-negative');
    }
    if (params.startSeconds < 0) {
        throw new Error('Segment startSeconds must be non-negative');
    }
    if (params.endSeconds <= params.startSeconds) {
        throw new Error('Segment endSeconds must be greater than startSeconds');
    }
    if (!params.commentary.trim()) {
        throw new Error('Segment commentary cannot be empty');
    }
    if (!params.imagePrompt.trim()) {
        throw new Error('Segment imagePrompt cannot be empty');
    }

    return {
        index: params.index,
        startSeconds: params.startSeconds,
        endSeconds: params.endSeconds,
        commentary: params.commentary.trim(),
        imagePrompt: params.imagePrompt.trim(),
        imageUrl: params.imageUrl,
        caption: params.caption?.trim(),
        zoomEffect: params.zoomEffect,
    };
}

/**
 * Calculates the duration of a segment in seconds.
 */
export function getSegmentDuration(segment: Segment): number {
    return segment.endSeconds - segment.startSeconds;
}
