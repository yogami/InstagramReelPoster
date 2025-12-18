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
    private sequenceIndex: number = 0; // Track position in sequence

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
            this.sequenceIndex++;

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
     * CRITICAL: Includes the ACTUAL previous prompt so the model has real context.
     * Without this, "continuation" is meaningless since each API call is stateless.
     */
    private buildSequentialPrompt(currentPrompt: string): string {
        if (!this.previousPrompt) {
            // First image - no previous context
            return `Generate an image: ${currentPrompt}\n\nStyle: Cinematic, high quality, visually striking for Instagram reel. Use vibrant colors and dramatic lighting.`;
        }

        // Subsequent images - provide ACTUAL previous prompt for real continuity
        // The LLM already says "Continuation of previous scene:" but we need to tell 
        // the image model what that previous scene actually WAS
        return `You are generating image #${this.sequenceIndex + 1} in a visual sequence.

PREVIOUS IMAGE (for reference):
${this.previousPrompt}

CURRENT IMAGE (what you should generate now):
${currentPrompt}

CRITICAL INSTRUCTIONS:
- This image must visually continue from the previous scene described above
- Maintain the same lighting quality, color palette, and visual style
- Keep the same location/setting unless the prompt explicitly changes it
- Preserve any ongoing visual motifs or subjects
- Show clear narrative progression while maintaining aesthetic coherence

Style: Cinematic, high quality, visually striking for Instagram reel.`;
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
        this.sequenceIndex = 0;
    }
}
