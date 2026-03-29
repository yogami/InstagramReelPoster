import axios from 'axios';

/**
 * Kie.ai Kling AI Avatar lip-sync client.
 * Takes a character portrait image + audio → animated talking head video.
 *
 * Uses the same Kie.ai API as KieVideoClient but with the avatar model:
 *   POST https://api.kie.ai/api/v1/jobs/createTask
 *   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=xxx
 *
 * Model: kling/ai-avatar-standard (Standard lip-sync)
 * Fallback: kling/ai-avatar-pro (Pro quality)
 */
export interface KieAvatarOptions {
    imageUrl: string;    // Public URL to character portrait image
    audioUrl: string;    // Public URL to audio file (MP3)
    model?: string;      // Default: kling/ai-avatar-standard
}

export interface KieAvatarResult {
    videoUrl: string;
    taskId: string;
}

export class KieAvatarClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.kie.ai/api/v1',
        pollIntervalMs: number = 10000,
        maxPollAttempts: number = 90
    ) {
        if (!apiKey) throw new Error('Kie.ai API key is required');
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.pollIntervalMs = pollIntervalMs;
        this.maxPollAttempts = maxPollAttempts;
    }

    /**
     * Generate a talking head video from a character portrait + audio.
     */
    async generateAvatar(options: KieAvatarOptions): Promise<KieAvatarResult> {
        const model = options.model || 'kling/ai-avatar-standard';
        console.log(`[KieAvatar] Starting ${model} generation...`);

        const taskId = await this.createTask(model, options.imageUrl, options.audioUrl);
        console.log(`[KieAvatar] Task created: ${taskId}`);

        const videoUrl = await this.pollForCompletion(taskId);
        console.log(`[KieAvatar] ✅ Done: ${videoUrl}`);

        return { videoUrl, taskId };
    }

    private async createTask(model: string, imageUrl: string, audioUrl: string, prompt?: string): Promise<string> {
        const payload = {
            model,
            input: {
                image_url: imageUrl,
                audio_url: audioUrl,
                prompt: prompt || 'A person talking naturally with expressive facial movements and lip sync',
            },
        };

        const response = await axios.post(
            `${this.baseUrl}/jobs/createTask`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data.code === 200) {
            const taskId = response.data.data?.taskId;
            if (!taskId) throw new Error('No taskId in Kie.ai avatar response');
            return taskId;
        }

        throw new Error(`Kie.ai avatar creation failed: ${response.data.msg || JSON.stringify(response.data)}`);
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
                console.log(`[KieAvatar] Poll ${attempt + 1}/${this.maxPollAttempts}: ${state}`);

                if (state === 'success') {
                    // Parse resultJson — may be a JSON string with resultUrls array
                    let videoUrl: string;
                    try {
                        const result = JSON.parse(data.resultJson);
                        if (result.resultUrls && result.resultUrls.length > 0) {
                            videoUrl = result.resultUrls[0];
                        } else if (Array.isArray(result)) {
                            videoUrl = result[0];
                        } else {
                            videoUrl = data.resultJson;
                        }
                    } catch {
                        // resultJson might be a plain URL string
                        const urls = JSON.parse(data.resultJson || '[]');
                        videoUrl = Array.isArray(urls) ? urls[0] : data.resultJson;
                    }

                    if (!videoUrl) throw new Error('Kie.ai avatar success but no result URL');
                    return videoUrl;
                }

                if (state === 'fail') {
                    throw new Error(`Kie.ai avatar failed: ${data?.failMsg || 'Unknown error'}`);
                }
            } catch (err) {
                if (axios.isAxiosError(err) && err.response?.status === 404) continue;
                throw err;
            }
        }

        throw new Error(`Kie.ai avatar timed out after ${(this.maxPollAttempts * this.pollIntervalMs / 1000).toFixed(0)}s`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
