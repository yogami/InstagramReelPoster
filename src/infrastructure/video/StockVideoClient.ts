/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';
import { IAnimatedVideoClient, AnimatedVideoResult, AnimatedVideoOptions } from '../../domain/ports/IAnimatedVideoClient';

/**
 * Stock Video Client
 * Searches for free stock videos using the Stock API.
 * Implements IAnimatedVideoClient for testing purposes.
 */
export class StockVideoClient implements IAnimatedVideoClient {
    private readonly apiKey: string;
    private readonly baseUrl: string = 'https://pixabay.com/api/videos/';

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('Stock API key is required');
        }
        this.apiKey = apiKey;
    }

    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        try {
            const query = this.cleanPromptForSearch(options.theme);
            console.log(`[StockVideo] Searching for: "${query}"`);

            const response = await axios.get(this.baseUrl, {
                params: {
                    key: this.apiKey,
                    q: query,
                    video_type: 'film',
                    per_page: 3,
                    safesearch: true,
                    // min_height: 1080 // Prefer HD?
                }
            });

            const hits = response.data.hits;

            if (!hits || hits.length === 0) {
                // Try broader search
                if (query.split(' ').length > 1) {
                    const broadQuery = query.split(' ')[0];
                    console.log(`[StockVideo] No results, retrying with broader query: "${broadQuery}"`);
                    const retryResponse = await axios.get(this.baseUrl, {
                        params: {
                            key: this.apiKey,
                            q: broadQuery,
                            video_type: 'film',
                            per_page: 3,
                            safesearch: true
                        }
                    });
                    if (retryResponse.data.hits && retryResponse.data.hits.length > 0) {
                        return this.selectVideo(retryResponse.data.hits, options.durationSeconds);
                    }
                }
                throw new Error(`No videos found on Stock for query: ${query}`);
            }

            return this.selectVideo(hits, options.durationSeconds);

        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[StockVideo] API Error:', error.response?.data || error.message);
                throw new Error(`Stock video search failed: ${error.message}`);
            }
            throw error;
        }
    }

    private selectVideo(hits: any[], targetDuration: number): AnimatedVideoResult {
        // Pick a random hit
        const randomHit = hits[Math.floor(Math.random() * hits.length)];

        // Stock returns 'videos' object with sizes
        // We prefer 'large' or 'medium'
        const videoUrl = randomHit.videos.large.url || randomHit.videos.medium.url || randomHit.videos.small.url;
        const duration = randomHit.duration; // Stock gives duration in seconds

        console.log(`[StockVideo] Selected video: ${videoUrl} (Duration: ${duration}s)`);

        return {
            videoUrl: videoUrl,
            durationSeconds: targetDuration // We return the requested duration as the "valid" duration for the pipeline, even if source differs (Timeline handles looping/cutting? No, Timeline cuts if length < duration, but if length > duration we are fine. If length < duration it will just freeze? Or loop? Timeline clip defaults to HOLD last frame usually. We'll cross that bridge).
        };
    }

    private cleanPromptForSearch(prompt: string): string {
        return prompt
            .replace(/create an animated video about/gi, '')
            .replace(/video of/gi, '')
            .replace(new RegExp('[.,/#!$%^&*;:{}=\\-_`~()]', 'g'), '')
            .replace(/\s{2,}/g, ' ')
            .trim()
            .substring(0, 100);
    }
}
