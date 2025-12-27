import { FallbackVideoRenderer } from '../../../src/infrastructure/video/FallbackVideoRenderer';
import { IVideoRenderer, RenderResult } from '../../../src/domain/ports/IVideoRenderer';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';

describe('FallbackVideoRenderer', () => {
    const mockPrimary: jest.Mocked<IVideoRenderer> = {
        render: jest.fn(),
    };

    const mockFallback: jest.Mocked<IVideoRenderer> = {
        render: jest.fn(),
    };

    const testManifest: ReelManifest = {
        durationSeconds: 30,
        voiceoverUrl: 'https://example.com/voiceover.mp3',
        subtitlesUrl: 'https://example.com/subs.srt',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('render', () => {
        test('should return primary result when primary succeeds', async () => {
            const primaryResult: RenderResult = {
                videoUrl: 'https://primary.com/video.mp4',
                renderId: 'primary-123',
            };
            mockPrimary.render.mockResolvedValueOnce(primaryResult);

            const renderer = new FallbackVideoRenderer(mockPrimary, mockFallback, 'Primary', 'Fallback');

            const result = await renderer.render(testManifest);

            expect(result).toEqual(primaryResult);
            expect(mockPrimary.render).toHaveBeenCalledWith(testManifest);
            expect(mockFallback.render).not.toHaveBeenCalled();
        });

        test('should return fallback result when primary fails', async () => {
            const fallbackResult: RenderResult = {
                videoUrl: 'https://fallback.com/video.mp4',
                renderId: 'fallback-456',
            };
            mockPrimary.render.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallback.render.mockResolvedValueOnce(fallbackResult);

            const renderer = new FallbackVideoRenderer(mockPrimary, mockFallback, 'Primary', 'Fallback');

            const result = await renderer.render(testManifest);

            expect(result).toEqual(fallbackResult);
            expect(mockPrimary.render).toHaveBeenCalled();
            expect(mockFallback.render).toHaveBeenCalledWith(testManifest);
        });

        test('should throw fallback error when both fail', async () => {
            mockPrimary.render.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallback.render.mockRejectedValueOnce(new Error('Fallback also failed'));

            const renderer = new FallbackVideoRenderer(mockPrimary, mockFallback, 'Primary', 'Fallback');

            await expect(renderer.render(testManifest))
                .rejects.toThrow('Fallback also failed');
        });
    });
});
