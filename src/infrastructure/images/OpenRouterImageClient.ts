import axios from 'axios';
import { IImageClient } from '../../domain/ports/IImageClient';

/**
 * OpenRouter image generation client.
 * Uses models like google/gemini-2.5-flash-image for image generation.
 * IMAGE models return base64 in response.images array (NOT text content).
 */
export class OpenRouterImageClient implements IImageClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;
    private previousPrompt?: string;
    private sequenceIndex: number = 0;

    constructor(
        apiKey: string,
        model: string = 'google/gemini-2.5-flash-image',
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
        const enhancedPrompt = this.buildSequentialPrompt(prompt);

        try {
            console.log(`[OpenRouter] Generating image with ${this.model}...`);

            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: [{
                        role: 'user',
                        content: `Generate an image: ${enhancedPrompt}`
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
                    timeout: 60000,
                }
            );

            // Extract image from the response
            const imageUrl = this.extractImageFromResponse(response.data);

            console.log(`[OpenRouter] Image generated successfully`);

            this.previousPrompt = prompt;
            this.sequenceIndex++;

            return { imageUrl };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                console.error(`[OpenRouter] Image generation failed:`, error.response?.data);
                throw new Error(`OpenRouter image generation failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Extracts image URL/base64 from OpenRouter response.
     * Image models return images in: response.choices[0].message.images[]
     */
    private extractImageFromResponse(data: any): string {
        // Check for images array in the message (OpenRouter image model format)
        const message = data?.choices?.[0]?.message;

        if (message?.images && message.images.length > 0) {
            const imageData = message.images[0];
            // Format: { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
            if (imageData?.image_url?.url) {
                return imageData.image_url.url;
            }
            // Alternative format: direct URL
            if (typeof imageData === 'string') {
                return imageData;
            }
        }

        // Fallback: check text content for base64 or URLs
        const content = message?.content;
        if (content) {
            // Check for base64 data URL
            if (content.includes('data:image')) {
                const match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
                if (match) return match[0];
            }

            // Check for HTTP URL
            const urlMatch = content.match(/https?:\/\/[^\s"]+/);
            if (urlMatch) return urlMatch[0];
        }

        throw new Error(`Could not extract image from OpenRouter response: ${JSON.stringify(data).substring(0, 500)}`);
    }

    /**
     * Builds sequential prompt with context from previous image.
     */
    private buildSequentialPrompt(currentPrompt: string): string {
        if (!this.previousPrompt) {
            return `${currentPrompt}. Style: Cinematic, high quality, visually striking for Instagram reel. Use vibrant colors and dramatic lighting.`;
        }

        const context = this.extractCompactContext(this.previousPrompt);

        return `Image #${this.sequenceIndex + 1} in visual sequence.

ESTABLISHED FROM PREVIOUS IMAGE:
${context}

CURRENT SCENE TO GENERATE:
${currentPrompt}

CRITICAL: Maintain the established elements above while progressing the narrative. Ensure visual coherence.

Style: Cinematic, high quality, visually striking for Instagram reel.`;
    }

    /**
     * Extracts essential visual elements from previous prompt.
     */
    private extractCompactContext(prompt: string): string {
        const elements: string[] = [];

        const loc = prompt.match(/(deck|room|forest|beach|mountain|garden|street|studio|landscape|field|valley|canyon)[^.!?]{0,30}/i);
        if (loc) elements.push(`• Location: ${loc[0].trim()}`);

        const light = prompt.match(/(golden hour|sunrise|sunset|morning|evening|soft|warm|cool|dramatic|natural)[\s\w-]{0,25}(light|lighting|glow)/i);
        if (light) elements.push(`• Lighting: ${light[0].trim()}`);

        const color = prompt.match(/(warm|cool|vibrant|muted|rich|amber|blue|green|earth|teal|orange|violet|purple)[\s\w-]{0,20}(tone|palette|color)/i);
        if (color) elements.push(`• Colors: ${color[0].trim()}`);

        const subj = prompt.match(/(person|subject|figure|woman|man|meditating|sitting|standing|walking|pose)[^.!?]{0,25}/i);
        if (subj) elements.push(`• Subject: ${subj[0].trim()}`);

        return elements.length > 0 ? elements.join('\n') : `• Core elements: ${prompt.split(/\s+/).slice(0, 35).join(' ')}`;
    }

    resetSequence(): void {
        this.previousPrompt = undefined;
        this.sequenceIndex = 0;
    }
}
