import { FallbackVideoClient } from '../../../src/infrastructure/video/FallbackVideoClient';
import { IAnimatedVideoClient, AnimatedVideoResult, AnimatedVideoOptions } from '../../../src/domain/ports/IAnimatedVideoClient';

describe('FallbackVideoClient', () => {
    const mockPrimary: jest.Mocked<IAnimatedVideoClient> = {
        generateAnimatedVideo: jest.fn(),
    };

    const mockFallback: jest.Mocked<IAnimatedVideoClient> = {
        generateAnimatedVideo: jest.fn(),
    };

    const testOptions: AnimatedVideoOptions = {
        durationSeconds: 5,
        theme: 'Test theme',
        mood: 'calm',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateAnimatedVideo', () => {
        test('should return primary result when primary succeeds', async () => {
            const primaryResult: AnimatedVideoResult = {
                videoUrl: 'https://primary.com/video.mp4',
                durationSeconds: 5,
            };
            mockPrimary.generateAnimatedVideo.mockResolvedValueOnce(primaryResult);

            const client = new FallbackVideoClient(mockPrimary, mockFallback, 'Primary', 'Fallback');

            const result = await client.generateAnimatedVideo(testOptions);

            expect(result).toEqual(primaryResult);
            expect(mockPrimary.generateAnimatedVideo).toHaveBeenCalledWith(testOptions);
            expect(mockFallback.generateAnimatedVideo).not.toHaveBeenCalled();
        });

        test('should return fallback result when primary fails', async () => {
            const fallbackResult: AnimatedVideoResult = {
                videoUrl: 'https://fallback.com/video.mp4',
                durationSeconds: 5,
            };
            mockPrimary.generateAnimatedVideo.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallback.generateAnimatedVideo.mockResolvedValueOnce(fallbackResult);

            const client = new FallbackVideoClient(mockPrimary, mockFallback, 'Primary', 'Fallback');

            const result = await client.generateAnimatedVideo(testOptions);

            expect(result).toEqual(fallbackResult);
            expect(mockPrimary.generateAnimatedVideo).toHaveBeenCalled();
            expect(mockFallback.generateAnimatedVideo).toHaveBeenCalledWith(testOptions);
        });

        test('should throw fallback error when both fail', async () => {
            mockPrimary.generateAnimatedVideo.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallback.generateAnimatedVideo.mockRejectedValueOnce(new Error('Fallback also failed'));

            const client = new FallbackVideoClient(mockPrimary, mockFallback, 'Primary', 'Fallback');

            await expect(client.generateAnimatedVideo(testOptions))
                .rejects.toThrow('Fallback also failed');
        });
    });
});
