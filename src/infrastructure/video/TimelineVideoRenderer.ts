import axios from 'axios';
/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { IVideoRenderer, RenderResult } from '../../domain/ports/IVideoRenderer';
import { ReelManifest } from '../../domain/entities/ReelManifest';

/**
 * Timeline Edit API Types
 * Based on https://timeline.io/docs/api/
 */
interface TimelineEdit {
    timeline: TimelineTimeline;
    output: TimelineOutput;
    callback?: string;
}

interface TimelineTimeline {
    soundtrack?: TimelineSoundtrack;
    background?: string;
    tracks: TimelineTrack[];
}

interface TimelineSoundtrack {
    src: string;
    effect?: 'fadeIn' | 'fadeOut' | 'fadeInFadeOut';
    volume?: number;
}

interface TimelineTrack {
    clips: TimelineClip[];
}

interface TimelineClip {
    asset: TimelineAsset;
    start: number;
    length: number;
    fit?: 'cover' | 'contain' | 'crop' | 'none';
    position?: 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left' | 'topLeft' | 'center';
    transition?: {
        in?: 'fade' | 'reveal' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'carouselLeft' | 'carouselRight' | 'carouselUp' | 'carouselDown' | 'shuffleTopRight' | 'shuffleRightTop' | 'shuffleRightBottom' | 'shuffleBottomRight' | 'shuffleBottomLeft' | 'shuffleLeftBottom' | 'shuffleLeftTop' | 'shuffleTopLeft' | 'zoom';
        out?: 'fade' | 'reveal' | 'wipeLeft' | 'wipeRight' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'carouselLeft' | 'carouselRight' | 'carouselUp' | 'carouselDown' | 'shuffleTopRight' | 'shuffleRightTop' | 'shuffleRightBottom' | 'shuffleBottomRight' | 'shuffleBottomLeft' | 'shuffleLeftBottom' | 'shuffleLeftTop' | 'shuffleTopLeft' | 'zoom';
    };
    effect?: 'zoomIn' | 'zoomOut' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown';
    scale?: number;
    offset?: {
        x?: number;
        y?: number;
    };
}

type TimelineAsset =
    | TimelineImageAsset
    | TimelineVideoAsset
    | TimelineAudioAsset
    | TimelineCaptionAsset
    | TimelineHtmlAsset;

interface TimelineHtmlAsset {
    type: 'html';
    html: string;
    css?: string;
    width?: number;
    height?: number;
    background?: string;
}

interface TimelineVideoAsset {
    type: 'video';
    src: string;
    trim?: number;
    volume?: number;
}

interface TimelineImageAsset {
    type: 'image';
    src: string;
}

interface TimelineAudioAsset {
    type: 'audio';
    src: string;
    trim?: number;
    volume?: number;
    speed?: number;
    effect?: 'fadeIn' | 'fadeOut' | 'fadeInFadeOut';
}

interface TimelineCaptionAsset {
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

interface TimelineOutput {
    format: 'mp4' | 'gif' | 'jpg' | 'png' | 'bmp' | 'mp3';
    resolution?: 'preview' | 'mobile' | 'sd' | 'hd' | '1080' | '4k';
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
    fps?: number;
    quality?: 'low' | 'medium' | 'high';
}

/**
 * Timeline video rendering client.
 * API Reference: https://timeline.io/docs/api/
 */
export class TimelineVideoRenderer implements IVideoRenderer {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.timeline.io/v1',
        pollIntervalMs: number = 5000,
        maxPollAttempts: number = 120
    ) {
        if (!apiKey) {
            throw new Error('Timeline API key is required');
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
        const timelineEdit = this.mapManifestToTimelineEdit(manifest);
        const renderId = await this.startRender(timelineEdit);
        const videoUrl = await this.pollForCompletion(renderId);

        return {
            videoUrl,
            renderId,
        };
    }

    /**
     * Maps our internal ReelManifest to Timeline Edit API format.
     */
    private mapManifestToTimelineEdit(manifest: ReelManifest): TimelineEdit {
        // Track 1: Images (bottom layer)
        // Track 1: Visuals (Video or Images)
        let visualClips: TimelineClip[];

        if (manifest.animatedVideoUrls && manifest.animatedVideoUrls.length > 0) {
            // Multiple Animated Videos Path
            const videos = manifest.animatedVideoUrls;
            const singleDuration = manifest.durationSeconds / videos.length;
            visualClips = [];

            for (let i = 0; i < videos.length; i++) {
                const url = videos[i];
                const isTurbo = url.startsWith('turbo:');
                const cleanUrl = url.replace('turbo:', '');
                const start = i * singleDuration;
                const length = singleDuration;

                visualClips.push({
                    asset: {
                        type: isTurbo ? 'image' : 'video',
                        src: cleanUrl,
                        volume: isTurbo ? undefined : 0,
                    },
                    start: start,
                    length: length,
                    fit: 'cover',
                    effect: isTurbo ? 'zoomIn' : undefined,
                });
            }
        } else if (manifest.animatedVideoUrl) {
            // Animated Video Path - Timeline doesn't support 'loop: true' for video assets.
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
        const voiceoverClip: TimelineClip = {
            asset: {
                type: 'audio' as const,
                src: manifest.voiceoverUrl,
                volume: 1.0,
            },
            start: 0,
            length: manifest.durationSeconds,
        };

        // Track 3: Captions/Subtitles (top layer) - Simplified for stage API compatibility
        const captionClip: TimelineClip = {
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
        const musicClips: TimelineClip[] = [];
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

        // Build tracks in Bottom-to-Top render order
        const tracks: { clips: TimelineClip[] }[] = [];

        // Track 1: Visuals (Bottom Layer)
        tracks.push({ clips: visualClips });

        // Track 2: Background Music (if available)
        if (musicClips.length > 0) {
            tracks.push({ clips: musicClips });
        }

        // Track 3: Voiceover audio
        tracks.push({ clips: [voiceoverClip] });

        // Track 4: Branding/Contact Info Overlay
        if (manifest.branding) {
            const brandingTrack = this.createBrandingTrack(manifest);
            if (brandingTrack) {
                tracks.push(brandingTrack);
            }
        }

        // Track 5: Logo (Top Layer)
        if (manifest.logoUrl) {
            const logoClip: TimelineClip = {
                asset: {
                    type: 'image',
                    src: manifest.logoUrl,
                },
                start: manifest.logoPosition === 'end'
                    ? Math.max(0, manifest.durationSeconds - 5)
                    : 0,
                length: manifest.logoPosition === 'overlay'
                    ? manifest.durationSeconds
                    : (manifest.logoPosition === 'end' ? 5 : 3),
                position: 'topRight',
                offset: {
                    x: -0.05,
                    y: 0.05
                },
                transition: {
                    in: 'fade',
                    out: 'fade'
                },
                fit: 'contain',
                scale: 0.2
            };
            tracks.push({ clips: [logoClip] });
        }

        // Track 6: Captions/Subtitles (Topmost Layer)
        if (manifest.subtitlesUrl) {
            tracks.push({ clips: [captionClip] });
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
     * Creates a track for branding/contact info overlay.
     */
    private createBrandingTrack(manifest: ReelManifest): TimelineTrack | null {
        if (!manifest.branding) return null;

        const b = manifest.branding;
        const details: string[] = [];

        // Prioritize address and hours, then phone/email
        if (b.address) details.push(`📍 ${b.address}`);
        if (b.hours) details.push(`🕒 ${b.hours}`);
        if (b.phone) details.push(`📞 ${b.phone}`);
        if (b.email && details.length < 3) details.push(`✉️ ${b.email}`);

        if (details.length === 0) return null;

        const html = `
            <div class="contact-card">
                <h1>${b.businessName}</h1>
                ${details.map(d => `<p>${d}</p>`).join('')}
            </div>
        `;

        const css = `
            .contact-card {
                font-family: 'Montserrat', sans-serif;
                color: #FFFFFF;
                background-color: rgba(0, 0, 0, 0.85);
                padding: 40px;
                border-radius: 20px;
                text-align: center;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                width: 80%;
                border: 2px solid rgba(255, 255, 255, 0.2);
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            h1 {
                font-size: 42px;
                margin: 0 0 20px 0;
                color: #FACC15; /* Yellow-400 */
                text-transform: uppercase;
                letter-spacing: 2px;
                font-weight: 800;
            }
            p {
                font-size: 28px;
                margin: 8px 0;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
            }
        `;

        // Show for the last 5 seconds (or max 1/3 of video if short)
        const duration = Math.min(5, manifest.durationSeconds / 3);
        const start = Math.max(0, manifest.durationSeconds - duration);

        return {
            clips: [{
                asset: {
                    type: 'html',
                    html,
                    css,
                    width: 1080,
                    height: 1920
                },
                start,
                length: duration,
                position: 'center',
                transition: {
                    in: 'slideUp',
                    out: 'fade'
                },
                fit: 'contain',
                scale: 0.9
            }]
        };
    }

    /**
     * Starts a render job.
     */
    private async startRender(edit: TimelineEdit): Promise<string> {
        try {
            const payload = JSON.stringify(edit);
            console.log(`[Timeline] Request payload size: ${(payload.length / 1024).toFixed(2)} KB`);

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
                throw new Error('No render ID returned from Timeline');
            }

            console.log(`[Timeline] Render started: ${renderId}`);
            return renderId;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[Timeline] Error response:', JSON.stringify(error.response?.data, null, 2));
                const message = error.response?.data?.message ||
                    error.response?.data?.error ||
                    error.message;
                throw new Error(`Timeline render failed to start: ${message}`);
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
                console.log(`[Timeline] Render ${renderId} status: ${status}`);

                if (status === 'done') {
                    const videoUrl = response.data?.response?.url;
                    if (!videoUrl) {
                        throw new Error('No video URL in completed response');
                    }
                    return videoUrl;
                }

                if (status === 'failed') {
                    const error = response.data?.response?.error || 'Unknown error';
                    throw new Error(`Timeline render failed: ${error}`);
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

        throw new Error(`Timeline render timed out after ${this.maxPollAttempts * this.pollIntervalMs / 1000}s`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
