import axios from 'axios';
import {
    IAnimatedVideoClient,
    AnimatedVideoOptions,
    AnimatedVideoResult
} from '../../domain/ports/IAnimatedVideoClient';

/**
 * Beam.cloud video generation client using Mochi model.
 * Generates short video clips from text prompts.
 */
export class MochiVideoClient implements IAnimatedVideoClient {
    private readonly apiKey: string;
    private readonly endpointUrl: string;
    private readonly timeout: number;

    constructor(
        apiKey: string,
        endpointUrl: string,
        timeout: number = 600000 // 10 minutes - video takes longer than images
    ) {
        if (!apiKey) {
            throw new Error('Remote API key is required');
        }
        if (!endpointUrl) {
            throw new Error('Remote video endpoint URL is required');
        }
        this.apiKey = apiKey;
        this.endpointUrl = endpointUrl;
        this.timeout = timeout;
    }

    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        const prompt = this.buildPrompt(options);

        try {
            console.log(`[Mochi] Generating video: "${prompt.substring(0, 60)}..."`);
            const startTime = Date.now();

            const response = await axios.post(
                this.endpointUrl,
                {
                    prompt,
                    duration_seconds: Math.min(options.durationSeconds, 6),
                    aspect_ratio: '9:16',
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

            console.log(`[Mochi] Video generated in ${elapsed}s`);

            return {
                videoUrl,
                durationSeconds: options.durationSeconds,
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error || error.response?.data?.message || error.message;
                console.error(`[Mochi] Generation failed:`, error.response?.data || error.message);
                throw new Error(`Remote Mochi generation failed: ${message}`);
            }
            throw error;
        }
    }

    private buildPrompt(options: AnimatedVideoOptions): string {
        let prompt = `A stylized 2D animation about ${options.theme}.`;
        if (options.mood) {
            prompt += ` Mood: ${options.mood}.`;
        }
        if (options.storyline) {
            prompt += ` Storyline: ${options.storyline}`;
        }
        prompt += ' Style: high quality 2D animation, smooth motion, cinematic lighting.';
        return prompt;
    }

    private extractVideoUrl(data: any): string {
        // Support multiple response formats
        if (data?.video_url) return data.video_url;
        if (data?.url) return data.url;
        if (data?.video_base64) return data.video_base64;
        if (data?.output?.video_url) return data.output.video_url;
        if (data?.videos && data.videos.length > 0) {
            const vid = data.videos[0];
            return typeof vid === 'string' ? vid : vid.url || vid.video_url;
        }

        throw new Error(`Could not extract video URL from Mochi response: ${JSON.stringify(data).substring(0, 300)}`);
    }
}
