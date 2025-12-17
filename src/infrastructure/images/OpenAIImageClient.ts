import axios from 'axios';
import {
    IImageClient,
    ImageGenerationResult,
    ImageGenerationOptions,
} from '../../domain/ports/IImageClient';

/**
 * OpenAI DALL-E image generation client.
 */
export class OpenAIImageClient implements IImageClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(apiKey: string, baseUrl: string = 'https://api.openai.com') {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    /**
     * Generates an image from a text prompt using DALL-E 3.
     */
    async generateImage(
        prompt: string,
        options?: ImageGenerationOptions
    ): Promise<ImageGenerationResult> {
        if (!prompt || !prompt.trim()) {
            throw new Error('Prompt is required for image generation');
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/v1/images/generations`,
                {
                    model: 'dall-e-3',
                    prompt: this.enhancePrompt(prompt),
                    size: options?.size || '1024x1024',
                    quality: options?.quality || 'standard',
                    style: options?.style || 'vivid',
                    n: 1,
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const imageData = response.data.data[0];

            return {
                imageUrl: imageData.url,
                revisedPrompt: imageData.revised_prompt,
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`Image generation failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Enhances the prompt for better reel imagery.
     */
    private enhancePrompt(prompt: string): string {
        return `${prompt}. Style: cinematic, atmospheric, suitable for a short-form video reel. High quality, visually striking, with depth and emotion.`;
    }
}
