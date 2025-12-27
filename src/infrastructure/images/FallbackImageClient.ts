import { IImageClient, ImageGenerationResult, ImageGenerationOptions } from '../../domain/ports/IImageClient';

/**
 * Composite image client that tries a primary provider first,
 * then falls back to a secondary provider on failure.
 * 
 * Usage: `new FallbackImageClient(beamClient, openRouterClient, 'Beam.cloud', 'OpenRouter')`
 */
export class FallbackImageClient implements IImageClient {
    private readonly primary: IImageClient;
    private readonly fallback: IImageClient;
    private readonly primaryName: string;
    private readonly fallbackName: string;

    constructor(
        primary: IImageClient,
        fallback: IImageClient,
        primaryName: string = 'Primary',
        fallbackName: string = 'Fallback'
    ) {
        this.primary = primary;
        this.fallback = fallback;
        this.primaryName = primaryName;
        this.fallbackName = fallbackName;
    }

    async generateImage(
        prompt: string,
        options?: ImageGenerationOptions
    ): Promise<ImageGenerationResult> {
        try {
            return await this.primary.generateImage(prompt, options);
        } catch (error: any) {
            console.warn(`[ImageGen] ${this.primaryName} failed: ${error.message}. Falling back to ${this.fallbackName}...`);
            return await this.fallback.generateImage(prompt, options);
        }
    }

    /**
     * Resets sequence state on both clients if they support it.
     */
    resetSequence(): void {
        if (typeof (this.primary as any).resetSequence === 'function') {
            (this.primary as any).resetSequence();
        }
        if (typeof (this.fallback as any).resetSequence === 'function') {
            (this.fallback as any).resetSequence();
        }
    }
}
