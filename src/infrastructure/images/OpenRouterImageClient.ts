import axios from 'axios';
import { IImageClient } from '../../domain/ports/IImageClient';

/**
 * OpenRouter image client using Gemini Flash for image generation.
 * Supports balanced sequential prompting with compact context extraction.
 */
export class OpenRouterImageClient implements IImageClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;
    private previousPrompt?: string;
    private sequenceIndex: number = 0;

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

            const content = response.data.choices[0].message.content;
            const imageUrl = this.extractImageUrl(content);

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
     * Builds sequential prompt with BALANCED context extraction.
     * Extracts ~30-40 key words instead of full 140-word prompt.
     * Token growth: Image 1: 140w → Image 2: ~170w → Image 3: ~200w (linear)
     */
    private buildSequentialPrompt(currentPrompt: string): string {
        if (!this.previousPrompt) {
            return `Generate an image: ${currentPrompt}\n\nStyle: Cinematic, high quality, visually striking for Instagram reel. Use vibrant colors and dramatic lighting.`;
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
     * Extracts essential visual elements (~30-40 words) from previous prompt.
     * Looks for: location, lighting, colors, subjects.
     */
    private extractCompactContext(prompt: string): string {
        const elements: string[] = [];

        // Location
        const loc = prompt.match(/(deck|room|forest|beach|mountain|garden|street|studio|landscape|field|valley|canyon)[^.!?]{0,30}/i);
        if (loc) elements.push(`• Location: ${loc[0].trim()}`);

        // Lighting/Time
        const light = prompt.match(/(golden hour|sunrise|sunset|morning|evening|soft|warm|cool|dramatic|natural)[\s\w-]{0,25}(light|lighting|glow)/i);
        if (light) elements.push(`• Lighting: ${light[0].trim()}`);

        // Colors
        const color = prompt.match(/(warm|cool|vibrant|muted|rich|amber|blue|green|earth|teal|orange|violet|purple)[\s\w-]{0,20}(tone|palette|color)/i);
        if (color) elements.push(`• Colors: ${color[0].trim()}`);

        // Subject
        const subj = prompt.match(/(person|subject|figure|woman|man|meditating|sitting|standing|walking|pose)[^.!?]{0,25}/i);
        if (subj) elements.push(`• Subject: ${subj[0].trim()}`);

        return elements.length > 0 ? elements.join('\n') : `• Core elements: ${prompt.split(/\s+/).slice(0, 35).join(' ')}`;
    }

    private extractImageUrl(content: string): string {
        if (content.startsWith('http://') || content.startsWith('https://')) {
            return content;
        }

        const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
        if (markdownMatch) return markdownMatch[1];

        const urlMatch = content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) return urlMatch[0];

        if (content.includes('base64,')) return content;

        throw new Error(`Could not extract image URL from OpenRouter response: ${content.substring(0, 200)}`);
    }

    resetSequence(): void {
        this.previousPrompt = undefined;
        this.sequenceIndex = 0;
    }
}
