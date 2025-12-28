import axios from 'axios';
import { IImageClient, ImageGenerationResult, ImageGenerationOptions } from '../../domain/ports/IImageClient';

/**
 * Stock Image Client
 * Searches for free stock images using the Stock API instead of generating them.
 * This serves as a "Free Tier" fallback for visual content.
 */
export class StockImageClient implements IImageClient {
    private readonly apiKey: string;
    private readonly baseUrl: string = 'https://pixabay.com/api/';

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('Stock API key is required');
        }
        this.apiKey = apiKey;
    }

    /**
     * "Generates" (searches for) an image based on the prompt.
     */
    async generateImage(
        prompt: string,
        options?: ImageGenerationOptions
    ): Promise<ImageGenerationResult> {
        try {
            // Clean the prompt to make it a better search query
            const query = this.cleanPromptForSearch(prompt);
            console.log(`[Stock] Searching for: "${query}"`);

            const orientation = options?.size === '1024x1792' ? 'vertical' : 'horizontal';

            const response = await axios.get(this.baseUrl, {
                params: {
                    key: this.apiKey,
                    q: query,
                    image_type: 'photo',
                    orientation: orientation,
                    per_page: 3, // Fetch a few to choose from
                    safesearch: true
                }
            });

            const hits = response.data.hits;

            if (!hits || hits.length === 0) {
                // Determine logic for no results - try a broader search or fail
                // For now, let's try searching for just the first few words if the full prompt failed
                if (query.split(' ').length > 2) {
                    console.log('[Stock] No results, trying broader search...');
                    const broadQuery = query.split(' ').slice(0, 2).join(' ');
                    const retryResponse = await axios.get(this.baseUrl, {
                        params: {
                            key: this.apiKey,
                            q: broadQuery,
                            image_type: 'photo',
                            orientation: orientation,
                            per_page: 3,
                            safesearch: true
                        }
                    });
                    if (retryResponse.data.hits && retryResponse.data.hits.length > 0) {
                        const randomHit = retryResponse.data.hits[Math.floor(Math.random() * retryResponse.data.hits.length)];
                        return {
                            imageUrl: randomHit.largeImageURL || randomHit.webformatURL,
                            revisedPrompt: `(Stock Search) ${broadQuery}`
                        };
                    }
                }

                throw new Error(`No images found on Stock for query: ${query}`);
            }

            // Pick a random image from the top 3 results to add variety
            const randomHit = hits[Math.floor(Math.random() * hits.length)];

            return {
                imageUrl: randomHit.largeImageURL || randomHit.webformatURL,
                revisedPrompt: `(Stock Search) ${query}`
            };

        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[Stock] API Error:', error.response?.data || error.message);
                throw new Error(`Stock search failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Converts a descriptive AI prompt into a keyword search query.
     * e.g., "A cinematic shot of a sunset over the ocean" -> "sunset ocean"
     */
    private cleanPromptForSearch(prompt: string): string {
        // 1. Remove common "generate" prefixes
        let cleaned = prompt
            .replace(/create an image of/gi, '')
            .replace(/generate an image of/gi, '')
            .replace(/a photo of/gi, '')
            .replace(/cinematic shot of/gi, '')
            .replace(/cinematic/gi, '')
            .replace(/photo of/gi, '')
            .replace(/high quality/gi, '')
            .replace(/realistic/gi, '')
            .replace(/hyperrealistic/gi, '')
            .replace(/4k/gi, '')
            .replace(/8k/gi, '');

        // 2. Remove punctuation
        cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');

        // 3. Trim extra whitespace
        cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

        // Remove leading 'a ' if present (common in prompts)
        if (cleaned.toLowerCase().startsWith('a ')) {
            cleaned = cleaned.substring(2);
        }

        // 4. If it's still very long, take the most significant chunks (naive approach: limit to 100 chars)
        // A better approach would be to extract nouns, but this is a good start.
        if (cleaned.length > 100) {
            cleaned = cleaned.substring(0, 100);
        }

        return cleaned;
    }
}
