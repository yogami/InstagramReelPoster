import fs from 'fs';
import os from 'os';
import path from 'path';
import { ILipSyncClient, LipSyncParams, LipSyncResult } from '../../domain/ports/ILipSyncClient';

/**
 * Hedra Character-3 lip-sync client.
 * Takes a character image + audio → animated talking head video via Hedra REST API.
 *
 * API flow:
 * 1. POST /assets — register image asset → get image_id
 * 2. POST /assets/{id}/upload — upload image binary
 * 3. POST /assets — register audio asset → get audio_id
 * 4. POST /assets/{id}/upload — upload audio binary
 * 5. POST /generations — create generation with image_id + audio_id → get generation_id
 * 6. GET /generations/{id} — poll until status === 'completed'
 * 7. Download the result video
 */
export class HedraLipSyncClient implements ILipSyncClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(apiKey: string, baseUrl: string = 'https://api.hedra.com/web-app/public') {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    async generateLipSync(params: LipSyncParams): Promise<LipSyncResult> {
        const { imagePath, audioPath, durationSeconds, characterName } = params;

        console.log(`[HedraLipSync] Generating lip-sync for "${characterName || 'character'}" (${durationSeconds}s)`);

        // 1. Upload image asset
        const imageId = await this.uploadAsset(imagePath, 'image');
        console.log(`[HedraLipSync] Image uploaded: ${imageId}`);

        // 2. Upload audio asset
        const audioId = await this.uploadAsset(audioPath, 'audio');
        console.log(`[HedraLipSync] Audio uploaded: ${audioId}`);

        // 3. Create generation
        const generationId = await this.createGeneration(imageId, audioId);
        console.log(`[HedraLipSync] Generation created: ${generationId}`);

        // 4. Poll until complete
        const resultUrl = await this.pollGeneration(generationId);
        console.log(`[HedraLipSync] Generation complete, downloading...`);

        // 5. Download result video
        const outputDir = path.join(os.tmpdir(), `hedra-lipsync-${Date.now()}`);
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'lipsync.mp4');
        await this.downloadFile(resultUrl, outputPath);

        console.log(`[HedraLipSync] Video saved: ${outputPath}`);

        return {
            videoPath: outputPath,
            durationSeconds,
        };
    }

    /**
     * Upload an asset (image or audio) to Hedra.
     * Step 1: POST /assets to register → Step 2: POST /assets/{id}/upload with file data.
     */
    private async uploadAsset(filePath: string, type: 'image' | 'audio'): Promise<string> {
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).slice(1);
        const mimeType = type === 'image'
            ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
            : `audio/${ext === 'mp3' ? 'mpeg' : ext}`;

        // Step 1: Create asset record
        const createRes = await fetch(`${this.baseUrl}/assets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ name: fileName, type }),
        });

        if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`Hedra asset creation failed (${createRes.status}): ${errText}`);
        }

        const { id: assetId } = (await createRes.json()) as { id: string };

        // Step 2: Upload file content
        const fileBuffer = fs.readFileSync(filePath);
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);

        const uploadRes = await fetch(`${this.baseUrl}/assets/${assetId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: formData,
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            throw new Error(`Hedra asset upload failed (${uploadRes.status}): ${errText}`);
        }

        return assetId;
    }

    /**
     * Create a lip-sync generation with image + audio assets.
     */
    private async createGeneration(imageId: string, audioId: string): Promise<string> {
        const res = await fetch(`${this.baseUrl}/generations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                start_keyframe_id: imageId,
                audio_id: audioId,
                model: 'hedra-character-3',
                resolution: '720p',
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Hedra generation creation failed (${res.status}): ${errText}`);
        }

        const data = (await res.json()) as { id: string };
        return data.id;
    }

    /**
     * Poll a generation until it completes or fails.
     * Hedra typically takes 30-120 seconds to generate a video.
     */
    private async pollGeneration(generationId: string, maxWaitMs: number = 300000): Promise<string> {
        const pollInterval = 5000; // 5 seconds
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            const res = await fetch(`${this.baseUrl}/generations/${generationId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });

            if (!res.ok) {
                throw new Error(`Hedra poll failed (${res.status}): ${await res.text()}`);
            }

            const data = (await res.json()) as {
                status: string;
                video_url?: string;
                error?: string;
            };

            if (data.status === 'completed' && data.video_url) {
                return data.video_url;
            }

            if (data.status === 'failed') {
                throw new Error(`Hedra generation failed: ${data.error || 'Unknown error'}`);
            }

            console.log(`[HedraLipSync] Polling... status: ${data.status}`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        throw new Error(`Hedra generation timed out after ${maxWaitMs / 1000}s`);
    }

    /**
     * Download a file from a URL to a local path.
     */
    private async downloadFile(url: string, outputPath: string): Promise<void> {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Download failed (${res.status}): ${url}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);
    }
}
