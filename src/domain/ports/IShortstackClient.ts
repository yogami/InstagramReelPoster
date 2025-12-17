import { ReelManifest } from '../entities/ReelManifest';

/**
 * RenderResult from the video rendering service.
 */
export interface RenderResult {
    /** URL to the final rendered video */
    videoUrl: string;
    /** Render job ID for reference */
    renderId?: string;
}

/**
 * IShortstackClient - Port for video rendering services.
 * Implementations: ShortstackClient
 */
export interface IShortstackClient {
    /**
     * Submits a manifest for video rendering and waits for completion.
     * @param manifest The reel manifest with all assets
     * @returns Rendered video URL
     */
    render(manifest: ReelManifest): Promise<RenderResult>;
}
