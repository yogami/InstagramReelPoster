import axios from 'axios';
import { IImageClient } from '../../domain/ports/IImageClient';

/**
 * OpenRouter image client using Gemini Flash for image generation.
 * Supports sequential prompting for narrative continuity.
 */
export class OpenRouterImageClient implements IImageClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;
    private previousPrompt?: string; // Track for sequential prompting

    constructor(
        apiKey: string,
        model: string = 'google/gemini-flash-1.5',
        baseUrl: string = 'https://openrouter.ai/api/v1'
    ) {
        if (!apiKey) {
            throw new Error('OpenRouter API key is required');
        }
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
    }

    async generateImage(prompt: string): Promise<{ imageUrl: string }> {
        // Build sequential prompt if we have a previous one
        const enhancedPrompt = this.buildSequentialPrompt(prompt);

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: [{
                        role: 'user',
                        content: enhancedPrompt
                    }],
                    temperature: 0.7,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://github.com/yogami/InstagramReelPoster',
                        'X-Title': 'Instagram Reel Poster',
                    },
                }
            );

            // Extract image URL from response
            const content = response.data.choices[0].message.content;

            // Gemini Flash returns image URL or base64
            // Parse the response to extract the actual URL
            const imageUrl = this.extractImageUrl(content);

            // Store this prompt for the next image
            this.previousPrompt = prompt;

            return { imageUrl };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`OpenRouter image generation failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Builds a sequential prompt that references the previous image.
     * Uses continuity tags if available for precise narrative coherence.
     */
    private buildSequentialPrompt(currentPrompt: string): string {
        if (!this.previousPrompt) {
            // First image - no previous context
            return `Generate an image: ${currentPrompt}\n\nStyle: Cinematic, high quality, visually striking for Instagram reel. Use vibrant colors and dramatic lighting.`;
        }

        // Subsequent images - build on previous with explicit continuation
        // The LLM prompt already includes "Continuation of previous scene:" 
        // and references continuity tags, so we enhance that with additional context
        return `${currentPrompt}\n\nIMPORTANT CONTEXT: This image continues from the previous scene. Maintain strong visual continuity:\n- Keep similar lighting quality and direction\n- Preserve the color palette and mood\n- Ensure temporal/spatial coherence\n- Progress the narrative while keeping aesthetic consistency\n\nStyle: Cinematic, high quality, visually striking for Instagram reel.`;
    }

    /**
     * Extracts image URL from Gemini response.
     * Handles both direct URLs and base64 data.
     */
    private extractImageUrl(content: string): string {
        // If it's already a URL, return it
        if (content.startsWith('http://') || content.startsWith('https://')) {
            return content;
        }

        // If it's markdown image format: ![alt](url)
        const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
        if (markdownMatch) {
            return markdownMatch[1];
        }

        // If it contains a URL somewhere in the text
        const urlMatch = content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            return urlMatch[0];
        }

        // If it's base64, return as data URL
        if (content.includes('base64,')) {
            return content;
        }

        throw new Error(`Could not extract image URL from OpenRouter response: ${content.substring(0, 200)}`);
    }

    /**
     * Resets the sequential prompting state.
     * Call this between different reel jobs.
     */
    resetSequence(): void {
        this.previousPrompt = undefined;
    }
}
