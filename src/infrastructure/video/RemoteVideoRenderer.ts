/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable complexity */
import axios from 'axios';
import { IVideoRenderer, RenderResult } from '../../domain/ports/IVideoRenderer';
import { ReelManifest } from '../../domain/entities/ReelManifest';

/**
 * Beam.cloud video renderer using FFmpeg serverless endpoint.
 * Sends the manifest to a Beam.cloud endpoint which runs FFmpeg for compositing.
 */
export class RemoteVideoRenderer implements IVideoRenderer {
    private readonly apiKey: string;
    private readonly endpointUrl: string;
    private readonly timeout: number;

    constructor(
        apiKey: string,
        endpointUrl: string,
        timeout: number = 900000 // 15 minutes max for rendering (allows internal 9min cap to trigger first)
    ) {
        if (!apiKey) {
            throw new Error('Remote API key is required');
        }
        if (!endpointUrl) {
            throw new Error('Remote render endpoint URL is required');
        }
        this.apiKey = apiKey;
        this.endpointUrl = endpointUrl;
        this.timeout = timeout;
    }

    async render(manifest: ReelManifest): Promise<RenderResult> {
        try {
            console.log(`[Beam.cloud FFmpeg] Starting render...`);
            const startTime = Date.now();

            // Send manifest to Beam.cloud FFmpeg endpoint
            const response = await axios.post(
                this.endpointUrl,
                {
                    voiceover_url: manifest.voiceoverUrl,
                    music_url: manifest.musicUrl || null,
                    subtitles_url: manifest.subtitlesUrl,
                    segments: manifest.segments?.map(s => ({
                        image_url: s.imageUrl,
                        start: s.start,
                        end: s.end,
                    })),
                    animated_video_url: manifest.animatedVideoUrl || null,
                    animated_video_urls: manifest.animatedVideoUrls || null,
                    duration_seconds: manifest.durationSeconds,
                    music_duration_seconds: manifest.musicDurationSeconds || null,
                    logo_url: manifest.logoUrl || null,
                    logo_position: manifest.logoPosition || null,
                    branding: manifest.branding || null,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: this.timeout,
                }
            );

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const videoUrl = this.extractVideoUrl(response.data);

            console.log(`[Beam.cloud FFmpeg] Render completed in ${elapsed}s`);

            return {
                videoUrl,
                renderId: response.data.render_id || 'beam-render',
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error || error.response?.data?.message || error.message;
                console.error(`[Beam.cloud FFmpeg] Render failed:`, error.response?.data || error.message);
                throw new Error(`Remote render failed: ${message}`);
            }
            throw error;
        }
    }

    private extractVideoUrl(data: any): string {
        if (data?.video_url) return data.video_url;
        if (data?.url) return data.url;
        if (data?.output?.video_url) return data.output.video_url;
        if (data?.result?.url) return data.result.url;

        throw new Error(`Could not extract video URL from Remote render response: ${JSON.stringify(data).substring(0, 300)}`);
    }
}
