import {
    IAnimatedVideoClient,
    AnimatedVideoOptions,
    AnimatedVideoResult,
} from '../../../src/domain/ports/IAnimatedVideoClient';

/**
 * Mock implementation for testing
 */
class MockAnimatedVideoClient implements IAnimatedVideoClient {
    async generateAnimatedVideo(options: AnimatedVideoOptions): Promise<AnimatedVideoResult> {
        return {
            videoUrl: `https://example.com/mock-animated-video-${options.durationSeconds}s.mp4`,
            durationSeconds: options.durationSeconds,
        };
    }
}

describe('IAnimatedVideoClient', () => {
    describe('MockAnimatedVideoClient', () => {
        let client: IAnimatedVideoClient;

        beforeEach(() => {
            client = new MockAnimatedVideoClient();
        });

        it('should implement IAnimatedVideoClient interface', () => {
            expect(client.generateAnimatedVideo).toBeDefined();
            expect(typeof client.generateAnimatedVideo).toBe('function');
        });

        it('should return a video URL matching requested duration', async () => {
            const result = await client.generateAnimatedVideo({
                durationSeconds: 30,
                theme: 'Test theme',
            });

            expect(result.videoUrl).toBeDefined();
            expect(result.videoUrl).toContain('30s');
            expect(result.durationSeconds).toBe(30);
        });

        it('should accept theme and mood parameters', async () => {
            const options: AnimatedVideoOptions = {
                durationSeconds: 45,
                theme: 'Spiritual awakening',
                mood: 'contemplative',
                storyline: 'A journey from darkness to light',
            };

            const result = await client.generateAnimatedVideo(options);

            expect(result.videoUrl).toBeDefined();
            expect(result.durationSeconds).toBe(45);
        });

        it('should handle minimum required parameters', async () => {
            const result = await client.generateAnimatedVideo({
                durationSeconds: 15,
                theme: 'Simple test',
            });

            expect(result.videoUrl).toBeDefined();
            expect(result.durationSeconds).toBe(15);
        });
    });
});
