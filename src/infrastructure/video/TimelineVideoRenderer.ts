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
        const timelineEdit = await this.mapManifestToTimelineEdit(manifest);
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
    private async mapManifestToTimelineEdit(manifest: ReelManifest): Promise<TimelineEdit> {
        // Track 1: Images (bottom layer)
        // Track 1: Visuals (Video or Images)
        let visualClips: TimelineClip[];

        // Calculate when visuals should end to make room for branding end-card
        let visualEndTime = manifest.durationSeconds;
        if (manifest.branding && manifest.segments && manifest.segments.length > 0) {
            const lastSegment = manifest.segments[manifest.segments.length - 1];
            // Match the logic in createBrandingTrack: branding starts 1.5s into last scene
            visualEndTime = lastSegment.start + 1.5;
        }

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

        // Truncate visuals to make room for end-card
        visualClips = visualClips.filter(c => c.start < visualEndTime).map(c => {
            if (c.start + c.length > visualEndTime) {
                return { ...c, length: Math.max(0, visualEndTime - c.start) };
            }
            return c;
        });

        // Add Branding End-Card as a sequential visual on Track 1
        if (manifest.branding) {
            // Pre-fetch logo and convert to base64 data URI for reliable rendering
            let logoDataUri: string | undefined;
            if (manifest.branding.logoUrl) {
                logoDataUri = await this.fetchImageAsBase64(manifest.branding.logoUrl);
            }
            const brandingTrackData = this.createBrandingTrack(manifest, logoDataUri);
            if (brandingTrackData && brandingTrackData.clips.length > 0) {
                const clip = brandingTrackData.clips[0];
                visualClips.push({
                    ...clip,
                    start: visualEndTime,
                    length: Math.max(0, manifest.durationSeconds - visualEndTime),
                    transition: { in: 'fade' }
                });
            }
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
            length: Math.min(manifest.durationSeconds, visualEndTime), // Stop captions when branding starts
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

        // Track 4: Overlays (Rating/QR)
        if (manifest.overlays && manifest.overlays.length > 0) {
            const overlayTracks = this.createOverlayTracks(manifest, visualEndTime);
            tracks.push(...overlayTracks);
        }

        // Track 5: Logo (Top Layer) - Use HTML to prevent upscaling blur
        if (manifest.logoUrl && !manifest.logoUrl.toLowerCase().endsWith('.ico')) {
            const logoClip: TimelineClip = {
                asset: {
                    type: 'image',
                    src: manifest.logoUrl
                },
                start: manifest.logoPosition === 'end'
                    ? Math.max(0, manifest.durationSeconds - 5)
                    : 0,
                length: Math.min(
                    manifest.logoPosition === 'overlay' ? manifest.durationSeconds : (manifest.logoPosition === 'end' ? 5 : 3),
                    Math.max(0, visualEndTime - (manifest.logoPosition === 'end' ? Math.max(0, manifest.durationSeconds - 5) : 0))
                ),
                position: 'topRight',
                offset: {
                    x: -0.02, // Slight padding from edge
                    y: 0.02
                },
                transition: {
                    in: 'fade',
                    out: 'fade'
                },
                fit: 'contain',
                scale: 0.25 // 25% of screen width/height, crisp.
            };
            tracks.push({ clips: [logoClip] });
        }

        // Track 6: Captions/Subtitles
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
     * Creates tracks for overlays (Rating Badge, QR Code).
     */
    private createOverlayTracks(manifest: ReelManifest, visualEndTime: number): { clips: TimelineClip[] }[] {
        if (!manifest.overlays || manifest.overlays.length === 0) return [];

        const clips: TimelineClip[] = manifest.overlays
            .filter(o => o.start < visualEndTime)
            .map(overlay => {
                const end = Math.min(overlay.end, visualEndTime);
                const length = Math.max(0, end - overlay.start);

                if (length <= 0) return null;

                if (overlay.type === 'rating_badge') {
                    return {
                        asset: {
                            type: 'html' as const,
                            html: `
                            <div style="font-family: 'Montserrat', sans-serif; background: rgba(0,0,0,0.85); color: white; padding: 15px 30px; border-radius: 50px; display: flex; align-items: center; gap: 15px; font-size: 50px; border: 3px solid white; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
                                <span style="font-weight: 800; letter-spacing: -1px;">${overlay.content}</span>
                            </div>
                        `,
                            width: 400,
                            height: 150,
                        },
                        start: overlay.start,
                        length: length,
                        position: 'center', // Currently fixed
                        offset: { x: 0.25, y: -0.2 }, // Top-Right quadrant
                        scale: 1.0,
                        transition: { in: 'slideRight', out: 'fade' }
                    };
                } else if (overlay.type === 'qr_code') {
                    // QR Code for "Sold Out" / Reservation
                    return {
                        asset: {
                            type: 'image' as const,
                            src: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(overlay.content)}&bgcolor=255-255-255&color=0-0-0&margin=10`,
                        },
                        start: overlay.start,
                        length: length,
                        position: 'center',
                        scale: 0.35,
                        offset: { x: 0, y: 0 }, // Dead center
                        transition: { in: 'zoom', out: 'fade' },
                        effect: 'zoomIn' // Attention grabber (valid enum)
                    };
                }
                return null;
            }).filter(Boolean) as TimelineClip[];

        return [{ clips }];
    }

    /**
     * Creates a track for branding/contact info overlay.
     * @param manifest The reel manifest with branding info
     * @param logoDataUri Optional pre-fetched logo as base64 data URI for reliable rendering
     */
    private createBrandingTrack(manifest: ReelManifest, logoDataUri?: string): TimelineTrack | null {
        const branding = manifest.branding;
        if (!branding) return null;

        const details: { icon: string, text: string }[] = [];
        if (branding.address) details.push({ icon: '📍', text: branding.address });

        // Handle potentially long hours text
        if (branding.hours) {
            // Limit to first 200 chars to avoid layout break
            const hoursShort = branding.hours.length > 200 ? branding.hours.substring(0, 197) + '...' : branding.hours;
            details.push({ icon: '🕒', text: hoursShort });
        }

        if (branding.phone) details.push({ icon: '📞', text: branding.phone });

        // Email is lower priority if space is tight (max 4 rows)
        if (branding.email && details.length < 4) details.push({ icon: '✉️', text: branding.email });

        // Only show if we have something
        if (details.length === 0) return null;

        const midPoint = Math.ceil(details.length / 2);
        const topDetails = details.slice(0, midPoint);
        const bottomDetails = details.slice(midPoint);

        const html = `
            <div class="container">
                <div class="top-details">
                    ${topDetails.map(d => `
                        <div class="row">
                            <span class="icon">${d.icon}</span>
                            <span class="text">${d.text}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="logo-section">
                    ${logoDataUri
                ? `<img src="${logoDataUri}" class="center-logo" />`
                : (branding.logoUrl
                    ? `<img src="${branding.logoUrl}" class="center-logo" />`
                    : `<h1 class="business-name">${branding.businessName}</h1>`)}
                </div>

                <div class="bottom-details">
                    ${bottomDetails.map(d => `
                        <div class="row">
                            <span class="icon">${d.icon}</span>
                            <span class="text">${d.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const css = `
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body, html { width: 100%; height: 100%; overflow: hidden; background: #000000; }
            
            .container {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                height: 100%;
                background: #000000;
                padding: 100px 60px;
            }

            .top-details, .bottom-details {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 30px;
                width: 100%;
            }

            .logo-section {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                padding: 40px 0;
            }

            .center-logo {
                max-width: 800px;
                max-height: 500px;
                object-fit: contain;
                filter: drop-shadow(0 0 40px rgba(255,255,255,0.15));
            }

            .business-name {
                font-family: 'Montserrat', sans-serif;
                font-size: 84px;
                font-weight: 900;
                color: #FACC15;
                text-align: center;
                text-transform: uppercase;
                letter-spacing: 6px;
                line-height: 1.1;
                padding: 40px;
                border: 4px solid #FACC15;
                border-radius: 20px;
                background: rgba(250, 204, 21, 0.05);
            }

            .row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 24px;
                color: #FFFFFF;
                font-family: 'Montserrat', sans-serif;
                background: #111111;
                border: 2px solid #333333;
                padding: 20px 40px;
                border-radius: 60px;
                width: fit-content;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }

            .icon { font-size: 44px; }
            .text {
                font-size: 34px;
                font-weight: 700;
                text-align: center;
            }
        `;

        // Show for the duration of the last segment (or last 5 seconds if no segments)
        let duration = 5;
        let start = Math.max(0, manifest.durationSeconds - duration);

        if (manifest.segments && manifest.segments.length > 0) {
            const lastSegment = manifest.segments[manifest.segments.length - 1];
            // Start 1.5s into the last scene so we see the visual first, then the card dominates.
            start = lastSegment.start + 1.5;
            duration = (lastSegment.end - lastSegment.start) - 1.5;
        }

        return {
            clips: [{
                asset: {
                    type: 'html',
                    html,
                    css,
                    width: 1080,
                    height: 1920,
                    background: '#000000'
                },
                start: 0, // Duration managed by the caller
                length: 0, // Duration managed by the caller
                position: 'center',
                fit: 'cover', // Use cover for full-screen card
                scale: 1.0
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
                const data = error.response?.data;
                const message = data?.message || data?.error || error.message;
                const details = data ? JSON.stringify(data) : '';
                throw new Error(`Timeline render failed to start: ${message}. Details: ${details}`);
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

    /**
     * Fetches an image from URL and converts it to a base64 data URI.
     * This is necessary because the Timeline API cannot fetch external images
     * within HTML assets during server-side rendering.
     * 
     * @param imageUrl The URL of the image to fetch
     * @returns Base64 data URI or undefined if fetch fails
     */
    private async fetchImageAsBase64(imageUrl: string): Promise<string | undefined> {
        try {
            console.log(`[Timeline] Fetching logo for base64 conversion: ${imageUrl}`);

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 10000, // 10 second timeout
                headers: {
                    'Accept': 'image/*'
                }
            });

            const buffer = Buffer.from(response.data, 'binary');
            const contentType = response.headers['content-type'] || 'image/png';
            const base64 = buffer.toString('base64');
            const dataUri = `data:${contentType};base64,${base64}`;

            console.log(`[Timeline] Logo converted to base64 (${(base64.length / 1024).toFixed(1)} KB)`);
            return dataUri;
        } catch (error) {
            console.warn(`[Timeline] Failed to fetch logo for base64 conversion, falling back to URL:`,
                error instanceof Error ? error.message : error);
            return undefined;
        }
    }
}
