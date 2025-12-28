/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    IAnimatedVideoClient,
    AnimatedVideoOptions,
    AnimatedVideoResult
} from '../../domain/ports/IAnimatedVideoClient';

/**
 * Composite video client that tries a primary provider first,
 * then falls back to a secondary provider on failure.
 */
export class FallbackVideoClient implements IAnimatedVideoClient {
    private readonly primary: IAnimatedVideoClient;
    private readonly fallback: IAnimatedVideoClient;
    private readonly primaryName: string;
    private readonly fallbackName: string;

    constructor(
        primary: IAnimatedVideoClient,
        fallback: IAnimatedVideoClient,
        primaryName: string = 'Primary',
        fallbackName: string = 'Fallback'
    ) {
        this.primary = primary;
        this.fallback = fallback;
        this.primaryName = primaryName;
        this.fallbackName = fallbackName;
    }

    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        try {
            return await this.primary.generateAnimatedVideo(options);
        } catch (error: any) {
            console.warn(`[VideoGen] ${this.primaryName} failed: ${error.message}. Falling back to ${this.fallbackName}...`);
            return await this.fallback.generateAnimatedVideo(options);
        }
    }
}
