import { IImageClient, ImageGenerationResult, ImageGenerationOptions } from '../../domain/ports/IImageClient';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Image generation client using Google's Imagen 3 via Vertex AI REST API.
 * For local dev: uses `gcloud auth print-access-token`
 * For Cloud Run: uses the service account's identity token (ADC)
 * Falls back to a moody gradient if generation fails.
 */
export class GoogleImageClient implements IImageClient {
    private readonly apiKey: string; // kept for backward compat, not used for Vertex
    private readonly projectId: string;
    private readonly region: string;
    private readonly modelName: string;

    constructor(
        apiKey: string,
        modelName: string = 'imagen-3.0-generate-002',
        projectId: string = 'automated-video-content-473412',
        region: string = 'europe-west1'
    ) {
        this.apiKey = apiKey;
        this.modelName = modelName;
        this.projectId = projectId;
        this.region = region;
    }

    async generateImage(
        prompt: string,
        options?: ImageGenerationOptions
    ): Promise<ImageGenerationResult> {
        try {
            console.log(`[Google Imagen] Generating image with ${this.modelName} via Vertex AI...`);
            const startTime = Date.now();

            const enhancedPrompt = `${prompt}. Style: Moody cinematic illustration, muted earth tones, editorial quality, atmospheric lighting.`;

            // Get access token for Vertex AI
            const accessToken = this.getAccessToken();

            const url = `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/google/models/${this.modelName}:predict`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    instances: [{ prompt: enhancedPrompt }],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: '9:16',
                        safetyFilterLevel: 'block_only_high',
                    },
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`[Google Imagen] Vertex AI error ${response.status}: ${errText.substring(0, 400)}`);
                throw new Error(`Imagen Vertex AI error ${response.status}`);
            }

            const data = await response.json() as any;
            const predictions = data.predictions;

            if (predictions && predictions.length > 0 && predictions[0].bytesBase64Encoded) {
                const tmpPath = path.join(os.tmpdir(), `scenario_bg_${Date.now()}.png`);
                const buffer = Buffer.from(predictions[0].bytesBase64Encoded, 'base64');
                fs.writeFileSync(tmpPath, buffer);

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`[Google Imagen] Image generated in ${elapsed}s → ${tmpPath}`);
                return { imageUrl: tmpPath };
            }

            throw new Error('No image data in Imagen response');
        } catch (error) {
            console.error(`[Google Imagen] Generation failed:`, error);
            console.warn(`[Google Imagen] Using fallback gradient`);
            return await this.createFallbackImage();
        }
    }

    /**
     * Gets an access token via gcloud CLI (local) or metadata server (Cloud Run).
     */
    private getAccessToken(): string {
        try {
            // Try gcloud CLI first (works locally)
            const token = execSync('gcloud auth print-access-token 2>/dev/null', {
                encoding: 'utf-8',
                timeout: 5000,
            }).trim();
            if (token) return token;
        } catch { /* fall through */ }

        try {
            // Try metadata server (works on Cloud Run/GCE)
            const result = execSync(
                'curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token 2>/dev/null',
                { encoding: 'utf-8', timeout: 3000 }
            );
            const parsed = JSON.parse(result);
            return parsed.access_token;
        } catch { /* fall through */ }

        throw new Error('Could not obtain access token for Vertex AI');
    }

    /**
     * Creates a moody dark gradient background as fallback.
     */
    private async createFallbackImage(): Promise<ImageGenerationResult> {
        const tmpPath = path.join(os.tmpdir(), `scenario_bg_fallback_${Date.now()}.png`);
        const simpleCmd = `ffmpeg -y -f lavfi -i "color=c=#0d0015:s=1080x1920:d=1" -frames:v 1 "${tmpPath}"`;
        execSync(simpleCmd, { stdio: 'pipe', timeout: 10000 });
        console.log(`[Google Imagen] Fallback gradient: ${tmpPath}`);
        return { imageUrl: tmpPath };
    }

    resetSequence(): void { }
}
