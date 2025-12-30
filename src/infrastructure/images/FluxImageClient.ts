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
        timeout: number = 180000 // FLUX can take 30-60s, increased for cold starts
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
        // Clean any Midjourney-style params that may have leaked through prompts
        // FLUX.1 uses natural language style, not MJ parameters
        const cleanedPrompt = prompt
            .replace(/--ar\s+\d+:\d+/gi, '')
            .replace(/--v\s+\d+(\.\d+)?/gi, '')
            .replace(/--stylize\s+\d+/gi, '')
            .replace(/--q\s+\d+/gi, '')
            .replace(/--style\s+\w+/gi, '')
            .replace(/--chaos\s+\d+/gi, '')
            .replace(/--no\s+[\w,\s]+/gi, '')
            .trim();

        // Add FLUX-native quality boosters
        const enhancedPrompt = `${cleanedPrompt}. Style: Cinematic, 8k, photorealistic, ultra-detailed. Aspect Ratio: 9:16 Vertical.`;

        const maxRetries = 1;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[Flux FLUX1] Generating image (attempt ${attempt + 1})...`);
                const startTime = Date.now();

                const response = await axios.post(
                    this.endpointUrl,
                    {
                        prompt: enhancedPrompt,
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

                // Log response structure for debugging
                console.log(`[Flux FLUX1] Response received:`, {
                    status: response.status,
                    dataType: typeof response.data,
                    dataKeys: response.data ? Object.keys(response.data) : [],
                    dataPreview: JSON.stringify(response.data).substring(0, 200)
                });

                // Extract image from response - support multiple formats
                const imageUrl = this.extractImageUrl(response.data);

                console.log(`[Flux FLUX1] Image generated in ${elapsed}s`);

                return { imageUrl };
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    const responseData = error.response?.data;
                    const message = responseData?.error || responseData?.message || error.message;
                    const isOOM = message?.includes('OutOfMemoryError') || message?.includes('CUDA out of memory');

                    console.error(`[Flux FLUX1] Generation failed (${status}):`, {
                        message,
                        raw: JSON.stringify(responseData || {}).substring(0, 500),
                        code: error.code
                    });

                    // Retry on OOM (transient GPU memory issue)
                    if (isOOM && attempt < maxRetries) {
                        console.warn(`[Flux FLUX1] OOM detected, waiting 8s before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 8000));
                        lastError = new Error(`Flux image generation failed (${status}): ${message || 'Empty response'}`);
                        continue;
                    }

                    throw new Error(`Flux image generation failed (${status}): ${message || 'Empty response'}`);
                }
                throw error;
            }
        }

        throw lastError || new Error('Flux image generation failed after retries');
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
