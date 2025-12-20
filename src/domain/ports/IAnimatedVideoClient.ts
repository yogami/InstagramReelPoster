/**
 * Options for animated video generation.
 */
export interface AnimatedVideoOptions {
    /** Target duration in seconds */
    durationSeconds: number;
    /** Theme or topic for the video */
    theme: string;
    /** Optional storyline if user specified one */
    storyline?: string;
    /** Mood for the video */
    mood?: string;
}

/**
 * Result from animated video generation.
 */
export interface AnimatedVideoResult {
    /** URL to the generated animated video */
    videoUrl: string;
    /** Actual duration of the generated video */
    durationSeconds: number;
}

/**
 * IAnimatedVideoClient - Port for animated video generation services.
 * This is an alternative to IImageClient for generating motion content.
 * Implementations: MockAnimatedVideoClient (test), future real providers
 */
export interface IAnimatedVideoClient {
    /**
     * Generates an animated video based on the provided options.
     * @param options Video generation options including duration, theme, and mood
     * @returns Generated video URL and actual duration
     */
    generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult>;
}
