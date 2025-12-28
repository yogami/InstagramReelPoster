import axios from 'axios';
import { IImageClient, ImageGenerationResult, ImageGenerationOptions } from '../../domain/ports/IImageClient';

/**
 * Flux image generation client for self-hosted FLUX1 model.
 * Calls a deployed FLUX1 endpoint on Flux infrastructure.
 */
export class FluxImageClient implements IImageClient {
    private readonly apiKey: string;
    private readonly endpointUrl: string;
    private readonly timeout: number;

    constructor(
        apiKey: string,
        endpointUrl: string,
        timeout: number = 120000 // FLUX can take 30-60s
    ) {
        if (!apiKey) {
            throw new Error('Flux API key is required');
        }
        if (!endpointUrl) {
            throw new Error('Flux endpoint URL is required');
        }
        this.apiKey = apiKey;
        this.endpointUrl = endpointUrl;
        this.timeout = timeout;
    }

    async generateImage(
        prompt: string,
        options?: ImageGenerationOptions
    ): Promise<ImageGenerationResult> {
        const enhancedPrompt = `${prompt}. Style: Cinematic, high quality, 8k, photorealistic. Aspect Ratio: 9:16 Vertical.`;

        try {
            console.log(`[Flux FLUX1] Generating image...`);
            const startTime = Date.now();

            const response = await axios.post(
                this.endpointUrl,
                {
                    prompt: enhancedPrompt,
                    aspect_ratio: '9:16',
                    quality: options?.quality || 'standard',
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

            // Extract image from response - support multiple formats
            const imageUrl = this.extractImageUrl(response.data);

            console.log(`[Flux FLUX1] Image generated in ${elapsed}s`);

            return { imageUrl };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error || error.response?.data?.message || error.message;
                console.error(`[Flux FLUX1] Generation failed:`, error.response?.data || error.message);
                throw new Error(`Flux image generation failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Extracts image URL/base64 from Flux response.
     * Supports multiple response formats from different FLUX implementations.
     */
    private extractImageUrl(data: any): string {
        // Format 1: { image_base64: 'data:image/png;base64,...' }
        if (data?.image_base64) {
            return data.image_base64;
        }

        // Format 2: { url: 'https://...' }
        if (data?.url) {
            return data.url;
        }

        // Format 3: { image: 'base64string' } (without data URI prefix)
        if (data?.image && typeof data.image === 'string') {
            if (data.image.startsWith('data:')) {
                return data.image;
            }
            return `data:image/png;base64,${data.image}`;
        }

        // Format 4: { images: ['base64string', ...] }
        if (data?.images && Array.isArray(data.images) && data.images.length > 0) {
            const img = data.images[0];
            if (typeof img === 'string') {
                return img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
            }
        }

        // Format 5: { output: { image: '...' } }
        if (data?.output?.image) {
            const img = data.output.image;
            return img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
        }

        throw new Error(`Could not extract image from Flux response: ${JSON.stringify(data).substring(0, 300)}`);
    }

    /**
     * Resets sequence state (no-op for this client, but required by interface pattern).
     */
    resetSequence(): void {
        // No sequence state in this implementation
    }
}
