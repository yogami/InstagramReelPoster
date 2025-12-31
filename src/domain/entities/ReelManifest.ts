import { Segment } from './Segment';

/**
 * ManifestSegment is the simplified segment format for the render manifest.
 */
export interface ManifestSegment {
    index: number;
    start: number;
    end: number;
    imageUrl: string;
    caption?: string;
    /** FLUX optimization: zoom/pan effect for this segment */
    zoomEffect?: 'slow_zoom_in' | 'slow_zoom_out' | 'ken_burns_left' | 'ken_burns_right' | 'static';
    /** SOTA Visual Style (e.g. quote_animation) */
    visualStyle?: string;
}

/**
 * ReelManifest is the internal representation of the data needed to render a reel.
 * This is the canonical format used by the application layer.
 * The ShortstackClient will map this to whatever format Shortstack expects.
 */
export interface ReelManifest {
    /** Total duration of the reel in seconds */
    durationSeconds: number;
    /** Array of segments with timing and image information (optional for animated video) */
    segments?: ManifestSegment[];
    /** URL to the generated animated video (instead of segments) */
    animatedVideoUrl?: string;
    /** Multiple URLs to animated videos (to be concatenated) */
    animatedVideoUrls?: string[];
    /** URL to the voiceover audio file */
    voiceoverUrl: string;
    /** URL to the background music file (optional) */
    musicUrl?: string;
    /** Duration of the background music in seconds */
    musicDurationSeconds?: number;
    /** URL to the subtitles file (SRT or VTT) */
    subtitlesUrl: string;
    /** URL to the company logo image */
    logoUrl?: string;
    /** Where to place the logo (beginning, end, or overlay) */
    logoPosition?: 'beginning' | 'end' | 'overlay';
    /** Branding details for info slides (address, hours, etc.) */
    branding?: {
        logoUrl?: string;
        businessName: string;
        address?: string;
        hours?: string;
        phone?: string;
        email?: string;
        ctaText?: string; // Specific Call-To-Action text (e.g. "Book Now", "Shop Local")
        qrCodeUrl?: string;  // URL for QR code (reservation/booking link)
    };
    /** specialized overlays like rating badges or QR codes */
    overlays?: ManifestOverlay[];
    /** FLUX optimization: default zoom type for all segments */
    zoomType?: 'slow_zoom_in' | 'slow_zoom_out' | 'ken_burns' | 'alternating' | 'static';
    /** FLUX optimization: zoom sequence for finer control */
    zoomSequence?: ('slow_zoom_in' | 'slow_zoom_out' | 'ken_burns_left' | 'ken_burns_right' | 'static')[];
}

export interface ManifestOverlay {
    type: 'rating_badge' | 'qr_code';
    content: string; // The rating "4.8" or the URL for QR
    start: number;
    end: number;
    position: 'top_right' | 'bottom_right' | 'center';
}

/**
 * Creates a ReelManifest from domain Segments and asset URLs.
 */
export function createReelManifest(params: {
    durationSeconds: number;
    segments?: Segment[];
    animatedVideoUrl?: string;
    animatedVideoUrls?: string[];
    voiceoverUrl: string;
    musicUrl?: string;
    musicDurationSeconds?: number;
    subtitlesUrl: string;
    logoUrl?: string;
    logoPosition?: 'beginning' | 'end' | 'overlay';
    zoomType?: 'slow_zoom_in' | 'slow_zoom_out' | 'ken_burns' | 'alternating' | 'static';
    zoomSequence?: ('slow_zoom_in' | 'slow_zoom_out' | 'ken_burns_left' | 'ken_burns_right' | 'static')[];
}): ReelManifest {
    if (params.durationSeconds <= 0) {
        throw new Error('Manifest durationSeconds must be positive');
    }

    // Validation: Must have EITHER segments OR animatedVideoUrl
    const hasSegments = params.segments && params.segments.length > 0;
    const hasAnimatedVideo = !!params.animatedVideoUrl || (params.animatedVideoUrls && params.animatedVideoUrls.length > 0);

    if (!hasSegments && !hasAnimatedVideo) {
        throw new Error('Manifest must have either segments or animatedVideoUrl(s)');
    }

    if (!params.voiceoverUrl.trim()) {
        throw new Error('Manifest voiceoverUrl cannot be empty');
    }
    // Music and subtitles are optional - no validation needed

    let manifestSegments: ManifestSegment[] | undefined;

    // Validate segments if provided
    if (hasSegments && params.segments) {
        const isAnimated = !!params.animatedVideoUrl || (params.animatedVideoUrls && params.animatedVideoUrls.length > 0);

        for (const segment of params.segments) {
            if (!segment.imageUrl && !isAnimated) {
                throw new Error(`Segment ${segment.index} is missing imageUrl`);
            }
        }

        manifestSegments = params.segments.map(seg => ({
            index: seg.index,
            start: seg.startSeconds,
            end: seg.endSeconds,
            imageUrl: seg.imageUrl || '', // Allow empty if animated
            caption: seg.caption,
            zoomEffect: seg.zoomEffect, // Pass through segment-level zoom
            visualStyle: seg.visualStyle,
        }));
    }

    return {
        durationSeconds: params.durationSeconds,
        segments: manifestSegments,
        animatedVideoUrl: params.animatedVideoUrl,
        animatedVideoUrls: params.animatedVideoUrls,
        voiceoverUrl: params.voiceoverUrl.trim(),
        musicUrl: params.musicUrl?.trim(),
        musicDurationSeconds: params.musicDurationSeconds,
        subtitlesUrl: params.subtitlesUrl.trim(),
        logoUrl: params.logoUrl,
        logoPosition: params.logoPosition,
        zoomType: params.zoomType,
        zoomSequence: params.zoomSequence,
    };
}
