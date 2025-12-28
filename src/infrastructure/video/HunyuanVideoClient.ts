import axios from 'axios';
import {
    IAnimatedVideoClient,
    AnimatedVideoOptions,
    AnimatedVideoResult
} from '../../domain/ports/IAnimatedVideoClient';

/**
 * HunyuanVideo client using Beam.cloud H100 GPU endpoint.
 * Cost-effective alternative to Kie.ai for video generation.
 */
export class HunyuanVideoClient implements IAnimatedVideoClient {
    private readonly apiKey: string;
    private readonly endpointUrl: string;
    private readonly timeout: number;

    constructor(
        apiKey: string,
        endpointUrl: string,
        timeout: number = 1800000 // 30 minutes max for video generation
    ) {
        if (!apiKey) {
            throw new Error('Beam.cloud API key is required for HunyuanVideo');
        }
        if (!endpointUrl) {
            throw new Error('HunyuanVideo endpoint URL is required');
        }
        this.apiKey = apiKey;
        this.endpointUrl = endpointUrl;
        this.timeout = timeout;
    }

    /**
     * Generates an animated video using HunyuanVideo on Beam.cloud H100.
     */
    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        const prompt = this.buildPrompt(options);

        console.log(`[HunyuanVideo] Generating video with prompt: ${prompt.substring(0, 80)}...`);
        console.log(`[HunyuanVideo] Duration: ${options.durationSeconds}s`);

        try {
            const response = await axios.post(
                this.endpointUrl,
                {
                    prompt,
                    duration_seconds: Math.min(options.durationSeconds, 5), // Max 5s per HunyuanVideo limits
                    width: 720,
                    height: 1280,
                    fps: 24,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: this.timeout,
                }
            );

            const videoUrl = this.extractVideoUrl(response.data);
            console.log(`[HunyuanVideo] Video generated successfully`);

            return {
                videoUrl,
                durationSeconds: options.durationSeconds
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error || error.response?.data?.message || error.message;
                console.error(`[HunyuanVideo] Generation failed:`, error.response?.data || error.message);
                throw new Error(`HunyuanVideo generation failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Builds a detailed prompt from the video options.
     */
    private buildPrompt(options: AnimatedVideoOptions): string {
        const parts: string[] = [];

        // Add theme
        if (options.theme) {
            parts.push(options.theme);
        }

        // Add storyline
        if (options.storyline) {
            parts.push(options.storyline);
        }

        // Add mood
        if (options.mood) {
            parts.push(`Mood: ${options.mood}`);
        }

        // Add quality hints for better generation
        parts.push('High quality, cinematic, smooth motion, 4K, professional video');

        return parts.join('. ');
    }

    /**
     * Extracts the video URL from the Beam.cloud response.
     */
    private extractVideoUrl(data: any): string {
        if (data?.video_url) return data.video_url;
        if (data?.url) return data.url;
        if (data?.output?.video_url) return data.output.video_url;
        if (data?.result?.url) return data.result.url;

        throw new Error(`Could not extract video URL from HunyuanVideo response: ${JSON.stringify(data).substring(0, 300)}`);
    }
}
