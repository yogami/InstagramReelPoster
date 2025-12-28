
import { FallbackVideoClient } from '../../../src/infrastructure/video/FallbackVideoClient';
import { IAnimatedVideoClient, AnimatedVideoOptions } from '../../../src/domain/ports/IAnimatedVideoClient';

describe('Video Fallback Chain TDD', () => {
    let primary: jest.Mocked<IAnimatedVideoClient>;
    let secondary: jest.Mocked<IAnimatedVideoClient>;
    let fallbackChain: FallbackVideoClient;

    beforeEach(() => {
        primary = {
            generateAnimatedVideo: jest.fn()
        };
        secondary = {
            generateAnimatedVideo: jest.fn()
        };
        fallbackChain = new FallbackVideoClient(primary, secondary, 'Primary', 'Secondary');
    });

    it('should fall back to secondary when primary times out', async () => {
        // Use a timeout error to simulate the hang/fail scenario
        primary.generateAnimatedVideo.mockRejectedValue(new Error('timeout of 2000ms exceeded'));
        secondary.generateAnimatedVideo.mockResolvedValue({ videoUrl: 'https://fallback.com/vid.mp4', durationSeconds: 5 });

        const options: AnimatedVideoOptions = { theme: 'Test', durationSeconds: 5 };
        const result = await fallbackChain.generateAnimatedVideo(options);

        expect(primary.generateAnimatedVideo).toHaveBeenCalled();
        expect(secondary.generateAnimatedVideo).toHaveBeenCalledWith(options);
        expect(result.videoUrl).toBe('https://fallback.com/vid.mp4');
    });

    it('should propagate results from primary if it succeeds', async () => {
        primary.generateAnimatedVideo.mockResolvedValue({ videoUrl: 'https://primary.com/vid.mp4', durationSeconds: 5 });

        const options: AnimatedVideoOptions = { theme: 'Test', durationSeconds: 5 };
        const result = await fallbackChain.generateAnimatedVideo(options);

        expect(primary.generateAnimatedVideo).toHaveBeenCalled();
        expect(secondary.generateAnimatedVideo).not.toHaveBeenCalled();
        expect(result.videoUrl).toBe('https://primary.com/vid.mp4');
    });
});
