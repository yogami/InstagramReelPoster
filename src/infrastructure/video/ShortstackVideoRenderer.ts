import axios from 'axios';
import { IVideoRenderer, RenderResult } from '../../domain/ports/IVideoRenderer';
import { ReelManifest } from '../../domain/entities/ReelManifest';

/**
 * Shotstack Edit API Types
 * Based on https://shotstack.io/docs/api/
 */
interface ShotstackEdit {
    timeline: ShotstackTimeline;
    output: ShotstackOutput;
    callback?: string;
}

interface ShotstackTimeline {
    soundtrack?: ShotstackSoundtrack;
    background?: string;
    tracks: ShotstackTrack[];
}

interface ShotstackSoundtrack {
    src: string;
    effect?: 'fadeIn' | 'fadeOut' | 'fadeInFadeOut';
    volume?: number;
}

interface ShotstackTrack {
    clips: ShotstackClip[];
}

interface ShotstackClip {
    asset: ShotstackAsset;
    start: number;
    length: number;
    fit?: 'cover' | 'contain' | 'crop' | 'none';
    position?: 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left' | 'topLeft' | 'center';
    transition?: {
        in?: 'fade' | 'reveal' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'carouselLeft' | 'carouselRight' | 'carouselUp' | 'carouselDown' | 'shuffleTopRight' | 'shuffleRightTop' | 'shuffleRightBottom' | 'shuffleBottomRight' | 'shuffleBottomLeft' | 'shuffleLeftBottom' | 'shuffleLeftTop' | 'shuffleTopLeft' | 'zoom';
        out?: 'fade' | 'reveal' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'carouselLeft' | 'carouselRight' | 'carouselUp' | 'carouselDown' | 'shuffleTopRight' | 'shuffleRightTop' | 'shuffleRightBottom' | 'shuffleBottomRight' | 'shuffleBottomLeft' | 'shuffleLeftBottom' | 'shuffleLeftTop' | 'shuffleTopLeft' | 'zoom';
    };
    effect?: 'zoomIn' | 'zoomOut' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown';
    offset?: {
        x?: number;
        y?: number;
    };
}

type ShotstackAsset =
    | ShotstackImageAsset
    | ShotstackVideoAsset
    | ShotstackAudioAsset
    | ShotstackCaptionAsset;

interface ShotstackVideoAsset {
    type: 'video';
    src: string;
    trim?: number;
    volume?: number;
}

interface ShotstackImageAsset {
    type: 'image';
    src: string;
}

interface ShotstackAudioAsset {
    type: 'audio';
    src: string;
    trim?: number;
    volume?: number;
    speed?: number;
    effect?: 'fadeIn' | 'fadeOut' | 'fadeInFadeOut';
}

interface ShotstackCaptionAsset {
    type: 'caption';
    src: string;
    font?: {
        family?: string;
        color?: string;
        size?: number;
        lineHeight?: number;
        stroke?: string;
        strokeWidth?: number;
    };
    background?: {
        color?: string;
        opacity?: number;
        padding?: number;
        borderRadius?: number;
    };
    margin?: {
        top?: number;
        left?: number;
        right?: number;
        bottom?: number;
    };
}

interface ShotstackOutput {
    format: 'mp4' | 'gif' | 'jpg' | 'png' | 'bmp' | 'mp3';
    resolution?: 'preview' | 'mobile' | 'sd' | 'hd' | '1080' | '4k';
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
    fps?: number;
    quality?: 'low' | 'medium' | 'high';
}

/**
 * Shotstack video rendering client.
 * API Reference: https://shotstack.io/docs/api/
 */
export class ShortstackVideoRenderer implements IVideoRenderer {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.shotstack.io/v1',
        pollIntervalMs: number = 5000,
        maxPollAttempts: number = 120
    ) {
        if (!apiKey) {
            throw new Error('Shotstack API key is required');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.pollIntervalMs = pollIntervalMs;
        this.maxPollAttempts = maxPollAttempts;
    }

    /**
     * Submits a manifest for video rendering and waits for completion.
     */
    async render(manifest: ReelManifest): Promise<RenderResult> {
        const shotstackEdit = this.mapManifestToShotstackEdit(manifest);
        const renderId = await this.startRender(shotstackEdit);
        const videoUrl = await this.pollForCompletion(renderId);

        return {
            videoUrl,
            renderId,
        };
    }

    /**
     * Maps our internal ReelManifest to Shotstack Edit API format.
     */
    private mapManifestToShotstackEdit(manifest: ReelManifest): ShotstackEdit {
        // Track 1: Images (bottom layer)
        // Track 1: Visuals (Video or Images)
        let visualClips: ShotstackClip[];

        if (manifest.animatedVideoUrls && manifest.animatedVideoUrls.length > 0) {
            // Multiple Animated Videos Path
            const videos = manifest.animatedVideoUrls;
            const singleDuration = manifest.durationSeconds / videos.length;
            visualClips = [];

            for (let i = 0; i < videos.length; i++) {
                const start = i * singleDuration;
                const length = singleDuration;

                visualClips.push({
                    asset: {
                        type: 'video',
                        src: videos[i],
                        volume: 0,
                    },
                    start: start,
                    length: length,
                    fit: 'cover',
                });
            }
        } else if (manifest.animatedVideoUrl) {
            // Animated Video Path - Shortstack doesn't support 'loop: true' for video assets.
            // We must repeat the clip multiple times to fill the full duration.
            // Assuming the source video is at least 5-10s (standard for Kling/Luma).
            const sourceDuration = 10; // Conservative estimate, or we could fetch it.
            const loops = Math.ceil(manifest.durationSeconds / sourceDuration);
            visualClips = [];

            for (let i = 0; i < loops; i++) {
                const start = i * sourceDuration;
                // Don't go past total duration
                const length = Math.min(sourceDuration, manifest.durationSeconds - start);

                if (length <= 0) break;

                visualClips.push({
                    asset: {
                        type: 'video',
                        src: manifest.animatedVideoUrl,
                        volume: 0,
                    },
                    start: start,
                    length: length,
                    fit: 'cover',
                });
            }
        } else if (manifest.segments) {
            // Image Path
            visualClips = manifest.segments.map((segment, index) => ({
                asset: {
                    type: 'image',
                    src: segment.imageUrl,
                },
                start: segment.start,
                length: segment.end - segment.start,
                fit: 'contain',
                transition: {
                    in: index === 0 ? 'fade' : undefined,
                    out: 'fade',
                },
                effect: 'zoomIn',
            }));
        } else {
            throw new Error('Manifest has neither animatedVideoUrl nor segments');
        }

        // Track 2: Voiceover audio (middle layer)
        const voiceoverClip: ShotstackClip = {
            asset: {
                type: 'audio' as const,
                src: manifest.voiceoverUrl,
                volume: 1.0,
            },
            start: 0,
            length: manifest.durationSeconds,
        };

        // Track 3: Captions/Subtitles (top layer) - Simplified for stage API compatibility
        const captionClip: ShotstackClip = {
            asset: {
                type: 'caption' as const,
                src: manifest.subtitlesUrl,
                font: {
                    family: 'Montserrat',
                    size: 48,
                    color: '#FFFFFF',
                    lineHeight: 1.2
                },
                background: {
                    color: '#000000',
                    opacity: 0.6,
                    padding: 20
                }
            },
            start: 0,
            length: manifest.durationSeconds,
            position: 'bottom',
            offset: {
                y: 0.15 // Offset from bottom (normalized ~15% up?)
            }
        };

        // Track 4: Background Music (optional - only if musicUrl is provided)
        const musicClips: ShotstackClip[] = [];
        if (manifest.musicUrl && manifest.musicDurationSeconds) {
            const musicUrl = manifest.musicUrl; // Narrow type
            const musicDuration = manifest.musicDurationSeconds; // Narrow type
            const musicClipCount = Math.ceil(manifest.durationSeconds / musicDuration);

            for (let i = 0; i < musicClipCount; i++) {
                const start = i * musicDuration;
                const length = Math.min(musicDuration, manifest.durationSeconds - start);
                if (length > 0) {
                    musicClips.push({
                        asset: {
                            type: 'audio' as const,
                            src: musicUrl,
                            volume: 0.1, // Lowered to avoid interference with commentary
                            effect: i === 0 ? 'fadeIn' : (i === musicClipCount - 1 ? 'fadeOut' : undefined),
                        },
                        start,
                        length,
                    });
                }
            }
        }

        // Build tracks - only include music track if we have music clips
        const tracks: { clips: ShotstackClip[] }[] = [
            { clips: [captionClip] },    // Top: Subtitles
            { clips: [voiceoverClip] },  // Middle: Voiceover audio
            { clips: visualClips },      // Bottom: Visuals (Video or Images)
        ];

        // Insert music track if available (between voiceover and images)
        if (musicClips.length > 0) {
            tracks.splice(2, 0, { clips: musicClips });
        }

        return {
            timeline: {
                background: '#000000',
                tracks,
            },
            output: {
                format: 'mp4',
                resolution: '1080',
                aspectRatio: '9:16', // Portrait for reels
                fps: 30,
                quality: 'high',
            },
        };
    }

    /**
     * Starts a render job.
     */
    private async startRender(edit: ShotstackEdit): Promise<string> {
        try {
            const payload = JSON.stringify(edit);
            console.log(`[Shotstack] Request payload size: ${(payload.length / 1024).toFixed(2)} KB`);

            const response = await axios.post(
                `${this.baseUrl}/render`,
                edit,
                {
                    headers: {
                        'x-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const renderId = response.data?.response?.id;
            if (!renderId) {
                throw new Error('No render ID returned from Shotstack');
            }

            console.log(`[Shotstack] Render started: ${renderId}`);
            return renderId;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[Shotstack] Error response:', JSON.stringify(error.response?.data, null, 2));
                const message = error.response?.data?.message ||
                    error.response?.data?.error ||
                    error.message;
                throw new Error(`Shotstack render failed to start: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Polls for render completion.
     */
    private async pollForCompletion(renderId: string): Promise<string> {
        for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
            try {
                const response = await axios.get(
                    `${this.baseUrl}/render/${renderId}`,
                    {
                        headers: {
                            'x-api-key': this.apiKey,
                        },
                    }
                );

                const status = response.data?.response?.status;
                console.log(`[Shotstack] Render ${renderId} status: ${status}`);

                if (status === 'done') {
                    const videoUrl = response.data?.response?.url;
                    if (!videoUrl) {
                        throw new Error('No video URL in completed response');
                    }
                    return videoUrl;
                }

                if (status === 'failed') {
                    const error = response.data?.response?.error || 'Unknown error';
                    throw new Error(`Shotstack render failed: ${error}`);
                }

                // Status is 'queued', 'fetching', 'rendering', or 'saving' - continue polling
                await this.sleep(this.pollIntervalMs);
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    // Render not found yet, continue polling
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }
                throw error;
            }
        }

        throw new Error(`Shotstack render timed out after ${this.maxPollAttempts * this.pollIntervalMs / 1000}s`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
