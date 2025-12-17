/**
 * ImageGenerationResult from an image generation request.
 */
export interface ImageGenerationResult {
    /** URL to the generated image */
    imageUrl: string;
    /** Revised prompt if the AI modified it */
    revisedPrompt?: string;
}

/**
 * ImageGenerationOptions for customizing generation.
 */
export interface ImageGenerationOptions {
    /** Image size (default: 1024x1024) */
    size?: '1024x1024' | '1792x1024' | '1024x1792';
    /** Image quality (default: standard) */
    quality?: 'standard' | 'hd';
    /** Style (default: vivid) */
    style?: 'vivid' | 'natural';
}

/**
 * IImageClient - Port for image generation services.
 * Implementations: OpenAIImageClient
 */
export interface IImageClient {
    /**
     * Generates an image from a text prompt.
     * @param prompt The image generation prompt
     * @param options Optional generation options
     * @returns Generated image URL
     */
    generateImage(
        prompt: string,
        options?: ImageGenerationOptions
    ): Promise<ImageGenerationResult>;
}
