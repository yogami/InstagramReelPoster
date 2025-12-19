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
}

/**
 * ReelManifest is the internal representation of the data needed to render a reel.
 * This is the canonical format used by the application layer.
 * The ShortstackClient will map this to whatever format Shortstack expects.
 */
export interface ReelManifest {
    /** Total duration of the reel in seconds */
    durationSeconds: number;
    /** Array of segments with timing and image information */
    segments: ManifestSegment[];
    /** URL to the voiceover audio file */
    voiceoverUrl: string;
    /** URL to the background music file (optional) */
    musicUrl?: string;
    /** Duration of the background music in seconds */
    musicDurationSeconds?: number;
    /** URL to the subtitles file (SRT or VTT) */
    subtitlesUrl: string;
}

/**
 * Creates a ReelManifest from domain Segments and asset URLs.
 */
export function createReelManifest(params: {
    durationSeconds: number;
    segments: Segment[];
    voiceoverUrl: string;
    musicUrl?: string;
    musicDurationSeconds?: number;
    subtitlesUrl: string;
}): ReelManifest {
    if (params.durationSeconds <= 0) {
        throw new Error('Manifest durationSeconds must be positive');
    }
    if (params.segments.length === 0) {
        throw new Error('Manifest must have at least one segment');
    }
    if (!params.voiceoverUrl.trim()) {
        throw new Error('Manifest voiceoverUrl cannot be empty');
    }
    // Music is optional - no validation needed
    if (!params.subtitlesUrl.trim()) {
        throw new Error('Manifest subtitlesUrl cannot be empty');
    }

    // Validate all segments have imageUrl
    for (const segment of params.segments) {
        if (!segment.imageUrl) {
            throw new Error(`Segment ${segment.index} is missing imageUrl`);
        }
    }

    const manifestSegments: ManifestSegment[] = params.segments.map(seg => ({
        index: seg.index,
        start: seg.startSeconds,
        end: seg.endSeconds,
        imageUrl: seg.imageUrl!,
        caption: seg.caption,
    }));

    return {
        durationSeconds: params.durationSeconds,
        segments: manifestSegments,
        voiceoverUrl: params.voiceoverUrl.trim(),
        musicUrl: params.musicUrl?.trim(),
        musicDurationSeconds: params.musicDurationSeconds,
        subtitlesUrl: params.subtitlesUrl.trim(),
    };
}
