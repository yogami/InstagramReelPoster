/* eslint-disable @typescript-eslint/no-explicit-any */
import { IVideoRenderer, RenderResult } from '../../domain/ports/IVideoRenderer';
import { ReelManifest } from '../../domain/entities/ReelManifest';

/**
 * Composite video renderer that tries a primary renderer first,
 * then falls back to a secondary renderer on failure.
 */
export class FallbackVideoRenderer implements IVideoRenderer {
    private readonly primary: IVideoRenderer;
    private readonly fallback: IVideoRenderer;
    private readonly primaryName: string;
    private readonly fallbackName: string;

    constructor(
        primary: IVideoRenderer,
        fallback: IVideoRenderer,
        primaryName: string = 'Primary',
        fallbackName: string = 'Fallback'
    ) {
        this.primary = primary;
        this.fallback = fallback;
        this.primaryName = primaryName;
        this.fallbackName = fallbackName;
    }

    async render(manifest: ReelManifest): Promise<RenderResult> {
        try {
            return await this.primary.render(manifest);
        } catch (error: any) {
            console.warn(`[VideoRender] ${this.primaryName} failed: ${error.message}. Falling back to ${this.fallbackName}...`);
            return await this.fallback.render(manifest);
        }
    }
}
