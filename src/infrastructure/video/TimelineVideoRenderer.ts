import axios from 'axios';
import * as QRCode from 'qrcode';
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
            // Image Path - FLUX Optimization: Use segment-level or manifest-level zoom effects
            visualClips = manifest.segments.map((segment, index) => {
                const zoomEffect = this.resolveZoomEffect(segment.zoomEffect, index, manifest.zoomType, manifest.zoomSequence);
                return {
                    asset: {
                        type: 'image' as const,
                        src: segment.imageUrl,
                    },
                    start: segment.start,
                    length: segment.end - segment.start,
                    fit: 'contain' as const,
                    transition: {
                        in: index === 0 ? 'fade' as const : undefined,
                        out: 'fade' as const,
                    },
                    effect: zoomEffect,
                };
            });
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

            // Generate QR code for the booking/reservation link
            let qrCodeDataUri: string | undefined;
            if (manifest.branding.qrCodeUrl) {
                qrCodeDataUri = await this.generateQrCode(manifest.branding.qrCodeUrl);
            }

            const brandingTrackData = this.createBrandingTrack(manifest, logoDataUri, qrCodeDataUri);
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
     * Resolves the zoom effect for a segment based on segment-level, manifest-level, or default.
     * Maps FLUX zoom types to Timeline API effect types.
     * 
     * @param segmentZoom Segment-level zoom effect (highest priority if explicit)
     * @param segmentIndex Index of the segment (for alternating mode)
     * @param manifestZoom Manifest-level default zoom type (fallback)
     * @param zoomSequence Manifest-level zoom sequence (priority over manifestZoom)
     * @returns Timeline API effect type
     */
    private resolveZoomEffect(
        segmentZoom: string | undefined,
        segmentIndex: number,
        manifestZoom: string | undefined,
        zoomSequence: string[] | undefined
    ): 'zoomIn' | 'zoomOut' | 'slideLeft' | 'slideRight' | undefined {
        // Priority:
        // 1. zoomSequence (if available for this index) - Enforces plan-level variety
        // 2. segmentZoom (if manually set/overridden in segment)
        // 3. manifestZoom (default fallback)

        let zoomType = segmentZoom || manifestZoom;

        // If a sequence exists, use it for this index
        if (zoomSequence && zoomSequence.length > segmentIndex) {
            zoomType = zoomSequence[segmentIndex];
        }

        switch (zoomType) {
            case 'slow_zoom_in':
                return 'zoomIn';
            case 'slow_zoom_out':
                return 'zoomOut';
            case 'ken_burns':
                // Ken Burns approximated as alternating zoom in/out
                return segmentIndex % 2 === 0 ? 'zoomIn' : 'zoomOut';
            case 'ken_burns_left':
                return 'slideLeft';
            case 'ken_burns_right':
                return 'slideRight';
            case 'alternating':
                // Alternate between zoom in and out for visual variety
                return segmentIndex % 2 === 0 ? 'zoomIn' : 'zoomOut';
            case 'static':
                return undefined; // No effect for static images
            default:
                // Default to zoom in for visual dynamism
                return 'zoomIn';
        }
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
     * Creates a track for branding/contact info overlay with QR-dominant layout.
     * Layout: CTA text (top) -> QR Code (center, 55%) -> Contact + Small Logo (bottom)
     * @param manifest The reel manifest with branding info
     * @param logoDataUri Optional pre-fetched logo as base64 data URI for reliable rendering
     * @param qrCodeDataUri Optional pre-generated QR code as base64 data URI
     */
    private createBrandingTrack(
        manifest: ReelManifest,
        logoDataUri?: string,
        qrCodeDataUri?: string
    ): TimelineTrack | null {
        const branding = manifest.branding;
        if (!branding) return null;

        // Build contact details for bottom-left
        const contactParts: string[] = [];
        if (branding.address) {
            // Shorten address to first part
            const shortAddr = branding.address.split(',')[0].trim();
            contactParts.push(`📍 ${shortAddr}`);
        }
        if (branding.hours) {
            // Extract just the first line of hours
            const shortHours = branding.hours.split('\n')[0].substring(0, 30);
            contactParts.push(`🕒 ${shortHours}`);
        }
        if (branding.phone) {
            contactParts.push(`📞 ${branding.phone}`);
        }
        if (branding.email) {
            contactParts.push(`✉️ ${branding.email}`);
        }

        // Determine CTA text - Only use restaurant-specific CTA if QR code exists
        // For non-restaurant sites, use generic "Mehr erfahren" (Learn more)
        const ctaText = qrCodeDataUri ? 'TISCH RESERVIEREN? SCAN!' : 'MEHR ERFAHREN';
        const showCTA = qrCodeDataUri || contactParts.length > 0;

        // Build QR section - this is the DOMINANT element
        const qrSection = qrCodeDataUri
            ? `<img src="${qrCodeDataUri}" class="qr-code" alt="Scan to book" />`
            : `<div class="qr-placeholder">📲 Link in Bio</div>`;

        // Build logo section (small, bottom-right)
        const logoSection = logoDataUri
            ? `<img src="${logoDataUri}" class="small-logo" />`
            : (branding.logoUrl
                ? `<img src="${branding.logoUrl}" class="small-logo" />`
                : `<span class="brand-text">${branding.businessName.substring(0, 30)}</span>`);

        const html = `
            <div class="container">
                <!-- TOP: CTA Text (only if QR or contact info exists) -->
                ${showCTA ? `
                <div class="cta-section">
                    <h1 class="cta-text">${ctaText}</h1>
                </div>
                ` : ''}
                
                <!-- CENTER: QR Code (DOMINANT) -->
                <div class="qr-section">
                    ${qrSection}
                </div>
                
                <!-- BOTTOM: Contact Left + Logo Right -->
                <div class="bottom-section">
                    <div class="contact-info">
                        ${contactParts.map(c => `<span class="contact-line">${c}</span>`).join('')}
                    </div>
                    <div class="logo-corner">
                        ${logoSection}
                    </div>
                </div>
            </div>
        `;

        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;900&display=swap');
            
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body, html { width: 100%; height: 100%; overflow: hidden; background: #000000; }
            
            .container {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                height: 100%;
                background: linear-gradient(180deg, #0a0a0a 0%, #000000 50%, #0a0a0a 100%);
                padding: 80px 50px 60px 50px;
            }

            /* TOP: CTA Text (15% of screen) */
            .cta-section {
                flex: 0 0 15%;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
            }

            .cta-text {
                font-family: 'Montserrat', sans-serif;
                font-size: 52px;
                font-weight: 900;
                color: #FACC15;
                text-align: center;
                text-transform: uppercase;
                letter-spacing: 3px;
                text-shadow: 0 0 30px rgba(250, 204, 21, 0.5);
                animation: pulse-text 1.5s ease-in-out infinite;
            }

            @keyframes pulse-text {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.02); opacity: 0.9; }
            }

            /* CENTER: QR Code (55% of screen) - DOMINANT */
            .qr-section {
                flex: 0 0 55%;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                padding: 20px;
            }

            .qr-code {
                width: 550px;
                height: 550px;
                min-width: 450px;
                min-height: 450px;
                background: white;
                border-radius: 20px;
                padding: 25px;
                border: 8px solid #FACC15;
                box-shadow: 0 0 60px rgba(250, 204, 21, 0.4), 0 0 120px rgba(250, 204, 21, 0.2);
                animation: pulse-qr 0.8s ease-in-out infinite;
            }

            @keyframes pulse-qr {
                0%, 100% { transform: scale(1); box-shadow: 0 0 60px rgba(250, 204, 21, 0.4); }
                50% { transform: scale(1.02); box-shadow: 0 0 100px rgba(250, 204, 21, 0.6); }
            }

            .qr-placeholder {
                font-family: 'Montserrat', sans-serif;
                font-size: 64px;
                color: #888888;
                text-align: center;
            }

            /* BOTTOM: Contact + Logo (30% of screen) */
            .bottom-section {
                flex: 0 0 30%;
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                width: 100%;
                gap: 30px;
            }

            .contact-info {
                display: flex;
                flex-direction: column;
                gap: 12px;
                flex: 1;
            }

            .contact-line {
                font-family: 'Montserrat', sans-serif;
                font-size: 24px;
                font-weight: 700;
                color: #FFFFFF;
                background: rgba(255,255,255,0.1);
                padding: 12px 20px;
                border-radius: 12px;
                word-wrap: break-word;
                overflow-wrap: break-word;
                line-height: 1.3;
            }

            .logo-corner {
                flex: 0 0 auto;
                display: flex;
                align-items: flex-end;
                justify-content: flex-end;
            }

            .small-logo {
                max-width: 150px;
                max-height: 150px;
                object-fit: contain;
                border-radius: 12px;
                background: rgba(255,255,255,0.1);
                padding: 10px;
            }

            .brand-text {
                font-family: 'Montserrat', sans-serif;
                font-size: 20px;
                font-weight: 900;
                color: #FACC15;
                text-transform: uppercase;
                max-width: 200px;
                word-wrap: break-word;
                text-align: right;
                line-height: 1.2;
            }
        `;

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
                fit: 'cover',
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

    /**
     * Generates a QR code as a base64 data URI.
     * 
     * @param url The URL to encode in the QR code
     * @returns Base64 data URI of the QR code image, or undefined if generation fails
     */
    private async generateQrCode(url: string): Promise<string | undefined> {
        try {
            console.log(`[Timeline] Generating QR code for: ${url}`);

            const dataUri = await QRCode.toDataURL(url, {
                width: 400,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                errorCorrectionLevel: 'M'
            });

            console.log(`[Timeline] QR code generated (${(dataUri.length / 1024).toFixed(1)} KB)`);
            return dataUri;
        } catch (error) {
            console.warn(`[Timeline] Failed to generate QR code:`,
                error instanceof Error ? error.message : error);
            return undefined;
        }
    }
}
