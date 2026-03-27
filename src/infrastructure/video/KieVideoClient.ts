import axios from 'axios';
import { IAnimatedVideoClient, AnimatedVideoOptions, AnimatedVideoResult } from '../../domain/ports/IAnimatedVideoClient';

/**
 * Kie.ai (Kling 3.0) text-to-video client.
 * Generates cinematic 9:16 vertical video from a text prompt.
 *
 * API spec (verified 2026-02-19):
 *   POST https://api.kie.ai/api/v1/jobs/createTask
 *   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=xxx
 *
 * Model: kling-3.0/video (latest flagship for cinematic quality)
 * For stoiccole-tier micro dramas and relationship psychology content.
 */
export class KieVideoClient implements IAnimatedVideoClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.kie.ai/api/v1',
        model: string = 'kling-v1-6/video',
        pollIntervalMs: number = 10000,
        maxPollAttempts: number = 90
    ) {
        if (!apiKey) throw new Error('Kie.ai API key is required');
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.model = model;
        this.pollIntervalMs = pollIntervalMs;
        this.maxPollAttempts = maxPollAttempts;
    }

    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        const { theme, mood, durationSeconds } = options;
        const prompt = `${theme}. ${mood || ''}. Cinematic, high production value, Instagram Reel format.`;

        console.log(`[KieVideo] Generating "${this.model}" video (${durationSeconds}s)...`);

        const taskId = await this.startGeneration(prompt, durationSeconds);
        console.log(`[KieVideo] Task: ${taskId}`);

        const videoUrl = await this.pollForCompletion(taskId);
        console.log(`[KieVideo] ✅ Done: ${videoUrl}`);

        return { videoUrl, durationSeconds };
    }

    private async startGeneration(prompt: string, durationSeconds: number): Promise<string> {
        // Kling supports 5s or 10s per clip
        const clipDuration = durationSeconds >= 8 ? '10s' : '5s';

        // Try Kling 3.0 first (best quality), fall back to older model on failure
        const modelAttempts = [
            {
                model: 'kling-3.0/video',
                payload: (p: string) => ({
                    model: 'kling-3.0/video',
                    input: {
                        // Kling 3.0 requires multi_shots even for text-to-video
                        multi_shots: [{ prompt: p }],
                        negative_prompt: 'cartoon, anime, watermark, text overlay, blur, overexposed, low quality',
                        aspect_ratio: '9:16',
                        duration: clipDuration,
                        mode: 'std',
                    },
                }),
            },
            {
                model: this.model,
                payload: (p: string) => ({
                    model: this.model,
                    input: {
                        prompt: p,
                        negative_prompt: 'cartoon, anime, watermark, text overlay, blur',
                        duration: clipDuration,
                        aspect_ratio: '9:16',
                        mode: 'std',
                    },
                }),
            },
        ];

        let lastError: Error | null = null;

        for (const attempt of modelAttempts) {
            try {
                const response = await axios.post(
                    `${this.baseUrl}/jobs/createTask`,
                    attempt.payload(prompt),
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );

                if (response.data.code === 200) {
                    const taskId = response.data.data?.taskId;
                    if (!taskId) throw new Error('No taskId in Kie.ai response');
                    console.log(`[KieVideo] Started with model: ${attempt.model} → task: ${taskId}`);
                    return taskId;
                }

                lastError = new Error(`Kie.ai error (${attempt.model}): ${response.data.msg}`);
                console.warn(`[KieVideo] ${attempt.model} failed: ${response.data.msg} — trying next...`);
            } catch (err) {
                if (axios.isAxiosError(err)) {
                    lastError = new Error(`Kie.ai request failed (${attempt.model}): ${err.response?.data?.msg || err.message}`);
                } else {
                    lastError = err as Error;
                }
                console.warn(`[KieVideo] ${attempt.model} threw: ${lastError.message} — trying next...`);
            }
        }

        throw lastError || new Error('All Kling model attempts failed');
    }


    private async pollForCompletion(taskId: string): Promise<string> {
        for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
            await this.sleep(this.pollIntervalMs);
            try {
                const response = await axios.get(
                    `${this.baseUrl}/jobs/recordInfo`,
                    {
                        params: { taskId },
                        headers: { 'Authorization': `Bearer ${this.apiKey}` },
                    }
                );

                const data = response.data.data;
                const state: string = data?.state || 'unknown';
                console.log(`[KieVideo] Poll ${attempt + 1}/${this.maxPollAttempts}: ${state}`);

                if (state === 'success') {
                    let urls: string[] = [];
                    try {
                        urls = JSON.parse(data.resultJson || '[]');
                    } catch {
                        urls = [data.resultJson];
                    }

                    const videoUrl = Array.isArray(urls) ? urls[0] : data.resultJson;
                    if (!videoUrl) throw new Error('Kie.ai success but no result URL');
                    return videoUrl;
                }

                if (state === 'fail') {
                    throw new Error(`Kie.ai video failed: ${data?.failMsg || 'Unknown error'}`);
                }
            } catch (err) {
                if (axios.isAxiosError(err) && err.response?.status === 404) continue;
                throw err;
            }
        }

        throw new Error(`Kie.ai video timed out after ${(this.maxPollAttempts * this.pollIntervalMs / 1000).toFixed(0)}s`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
