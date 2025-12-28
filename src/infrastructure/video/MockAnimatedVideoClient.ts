import {
    IAnimatedVideoClient,
    AnimatedVideoOptions,
    AnimatedVideoResult,
} from '../../domain/ports/IAnimatedVideoClient';

/**
 * Mock implementation of IAnimatedVideoClient for testing and development.
 * Returns a placeholder video URL.
 */
export class MockAnimatedVideoClient implements IAnimatedVideoClient {
    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        console.log(`[MockAnimatedVideo] Generating video for theme: "${options.theme}" (${options.durationSeconds}s)`);

        // Simulating processing delay
        await new Promise(resolve => setTimeout(resolve, 100));

        return {
            videoUrl: `https://res.cloudinary.com/demo/video/upload/w_1280,h_720,c_fill/dog.mp4`,
            durationSeconds: options.durationSeconds,
        };
    }
}
