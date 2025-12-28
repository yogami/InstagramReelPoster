import axios from 'axios';
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import {
    IAnimatedVideoClient,
    AnimatedVideoOptions,
    AnimatedVideoResult
} from '../../domain/ports/IAnimatedVideoClient';

/**
 * VideoGen video generation client that wraps various video models (Kling, Luma, etc.)
 */
export class MultiModelVideoClient implements IAnimatedVideoClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly defaultModel: string;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.kie.ai/api/v1',
        defaultModel: string = 'kling-2.6/text-to-video',
        pollIntervalMs: number = 10000, // Video takes longer than music
        maxPollAttempts: number = 180 // ~1800 seconds (30 mins) max for 1-minute videos
    ) {
        if (!apiKey) {
            throw new Error('VideoGen API key is required');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        this.defaultModel = defaultModel || 'kling-2.6/text-to-video';
        this.pollIntervalMs = pollIntervalMs;
        this.maxPollAttempts = maxPollAttempts;
    }

    /**
     * Generates an animated video by starting a VideoGen task and polling for completion.
     */
    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        const jobId = await this.createTask(options);
        console.log(`[VideoGen] Task created: ${jobId}. Polling for result...`);

        const videoUrl = await this.pollForCompletion(jobId);

        return {
            videoUrl,
            durationSeconds: options.durationSeconds
        };
    }

    /**
     * Creates a video generation task on VideoGen.
     */
    private async createTask(options: AnimatedVideoOptions): Promise<string> {
        // Construct prompt: Theme + Mood + Storyline
        const prompt = this.buildPrompt(options);

        // VideoGen unified task creation endpoint
        const endpoint = `${this.baseUrl}/jobs/createTask`;
        console.log(`[VideoGen] Creating task at: ${endpoint} with model: ${this.defaultModel}`);

        try {
            const payload = {
                model: this.defaultModel,
                input: {
                    prompt: prompt.substring(0, 1000),
                    duration: options.durationSeconds <= 5 ? "5" : "10", // MUST be string "5" or "10"
                    aspect_ratio: '9:16',
                    sound: false // REQUIRED boolean
                }
            };

            const response = await axios.post(
                endpoint,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Detailed check for VideoGen error codes
            const data = response.data;
            if (data.code !== 200) {
                const errorDesc = data.msg || data.message || 'Unknown error';
                console.error(`[VideoGen] API Error (${data.code}): ${errorDesc}`);
                throw new Error(`VideoGen API error ${data.code}: ${errorDesc}`);
            }

            const jobId = data.data?.taskId || data.taskId || data.id;
            if (!jobId) {
                console.error('[VideoGen] Missing taskId in response:', JSON.stringify(data));
                throw new Error('VideoGen did not return a job ID');
            }

            return jobId;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const data = error.response?.data;
                const message = data?.msg || data?.message || data?.error?.message || error.message;
                throw new Error(`Failed to create VideoGen video task: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Polls VideoGen for the status of a job.
     */
    private async pollForCompletion(jobId: string): Promise<string> {
        // Updated to use the recordInfo endpoint with query parameter as per docs
        const statusEndpoint = `${this.baseUrl}/jobs/recordInfo?taskId=${jobId}`;

        for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
            try {
                const response = await axios.get(statusEndpoint, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    }
                });

                const data = response.data;
                // VideoGen API response: { code: 200, data: { state: 'success', resultJson: '...', ... } }
                const resultData = data.data;
                if (!resultData) {
                    console.warn(`[VideoGen] Polling response missing data field:`, JSON.stringify(data));
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }

                const state = (resultData.state || resultData.status || '').toLowerCase();
                console.log(`[VideoGen] Task ${jobId} state: ${state} (Attempt ${attempt}/${this.maxPollAttempts})`);

                if (state === 'success' || state === 'completed' || state === 'succeeded') {
                    // Result URL is often in resultJson (stringified)
                    let videoUrl = resultData.video_url || resultData.videoUrl;

                    if (!videoUrl && resultData.resultJson) {
                        try {
                            const result = JSON.parse(resultData.resultJson);
                            if (result.resultUrls && result.resultUrls.length > 0) {
                                videoUrl = result.resultUrls[0];
                            }
                        } catch (e) {
                            console.warn('[VideoGen] Failed to parse resultJson:', e);
                        }
                    }

                    if (!videoUrl) {
                        throw new Error('VideoGen task completed but no video URL found in response');
                    }
                    console.log(`[VideoGen] Generation complete: ${videoUrl}`);
                    return videoUrl;
                }

                if (state === 'failed' || state === 'error' || state === 'fail') {
                    const errorMsg = resultData.failMsg || resultData.error || resultData.message || 'Unknown provider error';
                    throw new Error(`VideoGen video generation failed: ${errorMsg}`);
                }

                // Still processing (may be 'processing', 'pending', etc.)
                const currentStatus = state || 'queued';
                if (attempt % 3 === 0) {
                    console.log(`[VideoGen] Task ${jobId} status: ${currentStatus} (Attempt ${attempt}/${this.maxPollAttempts})...`);
                }

                await this.sleep(this.pollIntervalMs);
            } catch (error) {
                // If 404, assume it's still propagating on their end for a few attempts
                if (axios.isAxiosError(error) && error.response?.status === 404 && attempt < 15) {
                    if (attempt % 5 === 0) {
                        console.log(`[VideoGen] Task ${jobId} is still initializing on server (Attempt ${attempt}/${this.maxPollAttempts})...`);
                    }
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }

                if (axios.isAxiosError(error)) {
                    // 404 Grace Period (Propagation)
                    if (error.response?.status === 404) {
                        if (attempt > 30) {
                            throw new Error(`VideoGen task ${jobId} not found after 5 minutes of polling. It may have been deleted or the ID is invalid.`);
                        }
                        console.log(`[VideoGen] Task ${jobId} is not yet visible (Attempt ${attempt}/${this.maxPollAttempts})...`);
                    } else {
                        console.warn(`[VideoGen] Polling warning (Task ${jobId}): ${error.message}`);
                    }
                    await this.sleep(this.pollIntervalMs);
                    continue;
                }
                throw error;
            }
        }

        throw new Error(`VideoGen video generation timed out after ${this.maxPollAttempts * this.pollIntervalMs / 1000}s`);
    }

    private buildPrompt(options: AnimatedVideoOptions): string {
        let prompt = `A stylized 2D cartoon animation about ${options.theme}.`;
        if (options.mood) {
            prompt += ` Mood: ${options.mood}.`;
        }
        if (options.storyline) {
            prompt += ` Visual Storyline: ${options.storyline}`;
        }

        // Enforce cheaper, simpler cartoon style
        prompt += ' Style: high quality 2D digital animation, cel-shaded, flat colors, clean line art, stylized characters. NO realism, NO 3D, NO photorealistic details.';

        return prompt;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
