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
}

type ShotstackAsset =
    | ShotstackImageAsset
    | ShotstackAudioAsset
    | ShotstackCaptionAsset;

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
        const imageClips: ShotstackClip[] = manifest.segments.map((segment, index) => ({
            asset: {
                type: 'image' as const,
                src: segment.imageUrl,
            },
            start: segment.start,
            length: segment.end - segment.start,
            fit: 'cover' as const,
            transition: {
                in: index === 0 ? 'fade' as const : undefined,
                out: 'fade' as const,
            },
            effect: 'zoomIn' as const,
        }));

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

        // Track 3: Captions/Subtitles (top layer)
        const captionClip: ShotstackClip = {
            asset: {
                type: 'caption' as const,
                src: manifest.subtitlesUrl,
                font: {
                    family: 'Open Sans',
                    color: '#ffffff',
                    size: 28,
                    lineHeight: 1.2,
                    stroke: '#000000',
                    strokeWidth: 1,
                },
                background: {
                    color: '#000000',
                    opacity: 0.6,
                    padding: 12,
                    borderRadius: 8,
                },
                margin: {
                    bottom: 0.1,
                    left: 0.05,
                    right: 0.05,
                },
            },
            start: 0,
            length: manifest.durationSeconds,
        };

        return {
            timeline: {
                // Background music as soundtrack (separate from tracks)
                soundtrack: {
                    src: manifest.musicUrl,
                    effect: 'fadeInFadeOut',
                    volume: 0.3, // Lower than voiceover
                },
                background: '#000000',
                tracks: [
                    // Tracks are rendered back-to-front (first track is on top)
                    { clips: [captionClip] },    // Top: Subtitles
                    { clips: [voiceoverClip] },  // Middle: Voiceover audio
                    { clips: imageClips },        // Bottom: Images
                ],
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
