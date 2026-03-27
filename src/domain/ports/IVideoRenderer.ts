import { ReelManifest } from '../entities/ReelManifest';

/**
 * RenderResult from the video rendering service.
 */
export interface RenderResult {
    /** URL to the final rendered video */
    videoUrl: string;
    /** Render job ID for reference */
    renderId?: string;
    /** The absolute local path for the video if rendered locally */
    localVideoPath?: string;
}

/**
 * Implementations: RemotionVideoRenderer
 */
export interface IVideoRenderer {
    /**
     * Renders a video based on the manifest.
     * @param manifest The reel manifest with all assets
     * @returns Rendered video URL
     */
    render(manifest: ReelManifest): Promise<RenderResult>;
}
