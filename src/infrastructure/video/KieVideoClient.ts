import axios from 'axios';
import {
    IAnimatedVideoClient,
    AnimatedVideoOptions,
    AnimatedVideoResult
} from '../../domain/ports/IAnimatedVideoClient';

/**
 * Kie.ai video generation client that wraps various video models (Kling, Luma, etc.)
 */
export class KieVideoClient implements IAnimatedVideoClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly defaultModel: string;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.kie.ai/api/v1',
        defaultModel: string = 'KLING_V2_5_TURBO',
        pollIntervalMs: number = 10000, // Video takes longer than music
        maxPollAttempts: number = 60 // ~600 seconds (10 mins) max
    ) {
        if (!apiKey) {
            throw new Error('Kie.ai API key is required');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.defaultModel = defaultModel;
        this.pollIntervalMs = pollIntervalMs;
        this.maxPollAttempts = maxPollAttempts;
    }

    /**
     * Generates an animated video by starting a Kie.ai task and polling for completion.
     */
    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        const jobId = await this.createTask(options);
        console.log(`[Kie.ai] Task created: ${jobId}. Polling for result...`);

        const videoUrl = await this.pollForCompletion(jobId);

        return {
            videoUrl,
            durationSeconds: options.durationSeconds
        };
    }

    /**
     * Creates a video generation task on Kie.ai.
     */
    private async createTask(options: AnimatedVideoOptions): Promise<string> {
        // Construct prompt: Theme + Mood + Storyline
        const prompt = this.buildPrompt(options);

        // Kie.ai unified task creation endpoint
        const endpoint = `${this.baseUrl}/jobs/createTask`;

        try {
            const response = await axios.post(
                endpoint,
                {
                    model: this.defaultModel,
                    input: {
                        prompt: prompt.substring(0, 1000), // Documented max length
                        duration: options.durationSeconds <= 5 ? "5" : "10", // String as per docs
                        aspect_ratio: '9:16',
                        sound: false // Mandatory boolean
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Documented response: { "code": 200, "data": { "taskId": "..." } }
            const jobId = response.data?.data?.taskId || response.data?.taskId || response.data?.id;
            if (!jobId) {
                console.error('[Kie.ai] Response body:', JSON.stringify(response.data));
                throw new Error('Kie.ai did not return a job ID');
            }

            return jobId;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.response?.data?.message || error.message;
                throw new Error(`Failed to create Kie.ai video task: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Polls Kie.ai for the status of a job.
     */
    private async pollForCompletion(jobId: string): Promise<string> {
        const statusEndpoint = `${this.baseUrl}/jobs/status/${jobId}`;

        for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
            try {
                const response = await axios.get(statusEndpoint, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                });

                const data = response.data;
                // Kie.ai unified API nesting: { code: 200, data: { state: 'success', resultJson: '...', ... } }
                const resultData = data.data || data;
                const state = (resultData.state || resultData.status || '').toLowerCase();

                if (state === 'completed' || state === 'success' || state === 'succeeded') {
                    // Result URL is often in resultJson (stringified)
                    let videoUrl = resultData.video_url || resultData.videoUrl;

                    if (!videoUrl && resultData.resultJson) {
                        try {
                            const result = JSON.parse(resultData.resultJson);
                            if (result.resultUrls && result.resultUrls.length > 0) {
                                videoUrl = result.resultUrls[0];
                            }
                        } catch (e) {
                            console.warn('[Kie.ai] Failed to parse resultJson:', e);
                        }
                    }

                    if (!videoUrl) {
                        throw new Error('Kie.ai task completed but no video URL found in response');
                    }
                    console.log(`[Kie.ai] Generation complete: ${videoUrl}`);
                    return videoUrl;
                }

                if (state === 'failed' || state === 'error' || state === 'fail') {
                    const errorMsg = resultData.failMsg || resultData.error || resultData.message || 'Unknown provider error';
                    throw new Error(`Kie.ai video generation failed: ${errorMsg}`);
                }

                // Still processing (may be 'processing', 'pending', etc.)
                const currentStatus = state || 'queued';
                if (attempt % 3 === 0) {
                    console.log(`[Kie.ai] Task ${jobId} status: ${currentStatus} (Attempt ${attempt}/${this.maxPollAttempts})...`);
                }

                await this.sleep(this.pollIntervalMs);
            } catch (error) {
                // If 404, assume it's still propagating on their end for a few attempts
                if (axios.isAxiosError(error) && error.response?.status === 404 && attempt < 15) {
                    if (attempt % 5 === 0) {
                        console.log(`[Kie.ai] Task ${jobId} is still initializing on server (Attempt ${attempt}/${this.maxPollAttempts})...`);
                    }
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }

                if (axios.isAxiosError(error)) {
                    // Don't warn on 404s unless we've exceeded the grace period
                    if (error.response?.status === 404) {
                        console.log(`[Kie.ai] Status check returned 404. Waiting for task to propagate...`);
                    } else {
                        console.warn(`[Kie.ai] Polling warning (Task ${jobId}): ${error.message}`);
                    }
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }
                throw error;
            }
        }

        throw new Error(`Kie.ai video generation timed out after ${this.maxPollAttempts * this.pollIntervalMs / 1000}s`);
    }

    private buildPrompt(options: AnimatedVideoOptions): string {
        let prompt = `A cinematic animated video about ${options.theme}.`;
        if (options.mood) {
            prompt += ` Mood: ${options.mood}.`;
        }
        if (options.storyline) {
            prompt += ` Visual Storyline: ${options.storyline}`;
        }

        // Add style weight to ensure it's not "real" if we are in animated mode
        prompt += ' Style: high quality 3D animation, vivid colors, smooth motion, cinematic lighting.';

        return prompt;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
