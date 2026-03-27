import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import { ILipSyncClient, LipSyncParams, LipSyncResult } from '../../domain/ports/ILipSyncClient';
import { MediaStorageClient } from '../storage/MediaStorageClient';

/**
 * Kie.ai (InfiniteTalk) lip-sync client.
 * Takes a character image + audio → animated talking head video via Kie.ai API.
 *
 * API spec (verified 2026-02-19):
 *   POST https://api.kie.ai/api/v1/jobs/createTask
 *   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=xxx
 *
 * Model: infinitalk/from-audio
 * Cost:  ~$0.015/s @ 480p | ~$0.06/s @ 720p
 * Notes: max 15s per request. Prompt is REQUIRED.
 */
export class KieLipSyncClient implements ILipSyncClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly storageClient?: MediaStorageClient;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.kie.ai/api/v1',
        storageClient?: MediaStorageClient,
        pollIntervalMs: number = 6000,
        maxPollAttempts: number = 100
    ) {
        if (!apiKey) throw new Error('Kie.ai API key is required');
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.storageClient = storageClient;
        this.pollIntervalMs = pollIntervalMs;
        this.maxPollAttempts = maxPollAttempts;
    }

    async generateLipSync(params: LipSyncParams): Promise<LipSyncResult> {
        const { imagePath, audioPath, durationSeconds, characterName } = params;

        console.log(`[KieLipSync] Generating lip-sync for "${characterName || 'character'}" (${durationSeconds}s)...`);

        // 1. Upload local assets to Cloudinary to get public URLs
        const imageUrl = await this.ensureRemoteUrl(imagePath, 'image');
        const audioUrl = await this.ensureRemoteUrl(audioPath, 'audio');

        // InfiniteTalk max is 15s per chunk — split if needed
        if (durationSeconds > 15) {
            console.warn(`[KieLipSync] ⚠️ Duration ${durationSeconds}s > 15s limit. Using first 15s only.`);
        }

        // 2. Start generation
        const taskId = await this.startGeneration(imageUrl, audioUrl, characterName || 'character');
        console.log(`[KieLipSync] Task created: ${taskId}`);

        // 3. Poll for completion
        const resultUrl = await this.pollForCompletion(taskId);
        console.log(`[KieLipSync] ✅ Done! Downloading result...`);

        // 4. Download result video to local tmp
        const outputDir = path.join(os.tmpdir(), `kie-lipsync-${Date.now()}`);
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'lipsync.mp4');
        await this.downloadFile(resultUrl, outputPath);

        console.log(`[KieLipSync] Saved to: ${outputPath}`);
        return { videoPath: outputPath, durationSeconds };
    }

    /**
     * Ensures an asset has a public HTTPS URL (uploads local files via Cloudinary).
     */
    private async ensureRemoteUrl(filePath: string, type: 'image' | 'audio'): Promise<string> {
        if (filePath.startsWith('https://') || filePath.startsWith('http://')) {
            return filePath;
        }

        if (!this.storageClient) {
            throw new Error(`MediaStorageClient required to upload local ${type} for Kie.ai`);
        }

        console.log(`[KieLipSync] Uploading local ${type} to Cloudinary: ${path.basename(filePath)}`);
        const result = type === 'image'
            ? await this.storageClient.uploadImage(filePath, { folder: 'kie-lipsync-temp' })
            : await this.storageClient.uploadAudio(filePath, { folder: 'kie-lipsync-temp' });

        return result.url;
    }

    /**
     * Creates a generation task via kie.ai.
     * Returns the taskId.
     */
    private async startGeneration(
        imageUrl: string,
        audioUrl: string,
        characterName: string
    ): Promise<string> {
        try {
            const response = await axios.post(
                `${this.baseUrl}/jobs/createTask`,
                {
                    model: 'infinitalk/from-audio',
                    input: {
                        image_url: imageUrl,
                        audio_url: audioUrl,
                        prompt: `${characterName} speaking naturally with realistic lip movements, subtle head movement, professional talking head style`,
                        resolution: '720p',
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.data.code !== 200) {
                throw new Error(`Kie.ai error: ${response.data.msg}`);
            }

            const taskId = response.data.data?.taskId;
            if (!taskId) throw new Error('No taskId in Kie.ai response');

            return taskId;
        } catch (err) {
            if (axios.isAxiosError(err)) {
                const msg = err.response?.data?.msg || err.message;
                throw new Error(`Kie.ai lip-sync start failed: ${msg}`);
            }
            throw err;
        }
    }

    /**
     * Polls GET /jobs/recordInfo until state = success or fail.
     */
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

                console.log(`[KieLipSync] Poll ${attempt + 1}/${this.maxPollAttempts}: ${state}`);

                if (state === 'success') {
                    // resultJson is a JSON-encoded array: ["url1","url2"]
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
                    throw new Error(`Kie.ai generation failed: ${data?.failMsg || 'Unknown error'} (code: ${data?.failCode})`);
                }

                // state = 'running' | 'pending' → keep polling
            } catch (err) {
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    // Task not yet indexed, keep polling
                    continue;
                }
                throw err;
            }
        }

        throw new Error(`Kie.ai timed out after ${(this.maxPollAttempts * this.pollIntervalMs / 1000).toFixed(0)}s`);
    }

    private async downloadFile(url: string, outputPath: string): Promise<void> {
        const response = await axios({ url, method: 'GET', responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, response.data);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
