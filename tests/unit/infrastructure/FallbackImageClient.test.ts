import { FallbackImageClient } from '../../../src/infrastructure/images/FallbackImageClient';
import { IImageClient, ImageGenerationResult } from '../../../src/domain/ports/IImageClient';

describe('FallbackImageClient', () => {
    const mockPrimary: jest.Mocked<IImageClient> = {
        generateImage: jest.fn(),
    };

    const mockFallback: jest.Mocked<IImageClient> = {
        generateImage: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateImage', () => {
        test('should return primary result when primary succeeds', async () => {
            const primaryResult: ImageGenerationResult = { imageUrl: 'https://primary.com/image.png' };
            mockPrimary.generateImage.mockResolvedValueOnce(primaryResult);

            const client = new FallbackImageClient(mockPrimary, mockFallback, 'Primary', 'Fallback');

            const result = await client.generateImage('Test prompt');

            expect(result).toEqual(primaryResult);
            expect(mockPrimary.generateImage).toHaveBeenCalledWith('Test prompt', undefined);
            expect(mockFallback.generateImage).not.toHaveBeenCalled();
        });

        test('should return fallback result when primary fails', async () => {
            const fallbackResult: ImageGenerationResult = { imageUrl: 'https://fallback.com/image.png' };
            mockPrimary.generateImage.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallback.generateImage.mockResolvedValueOnce(fallbackResult);

            const client = new FallbackImageClient(mockPrimary, mockFallback, 'Primary', 'Fallback');

            const result = await client.generateImage('Test prompt');

            expect(result).toEqual(fallbackResult);
            expect(mockPrimary.generateImage).toHaveBeenCalled();
            expect(mockFallback.generateImage).toHaveBeenCalledWith('Test prompt', undefined);
        });

        test('should throw fallback error when both fail', async () => {
            mockPrimary.generateImage.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallback.generateImage.mockRejectedValueOnce(new Error('Fallback also failed'));

            const client = new FallbackImageClient(mockPrimary, mockFallback, 'Primary', 'Fallback');

            await expect(client.generateImage('Test prompt'))
                .rejects.toThrow('Fallback also failed');
        });

        test('should pass options to both clients', async () => {
            mockPrimary.generateImage.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallback.generateImage.mockResolvedValueOnce({ imageUrl: 'https://fallback.com/img.png' });

            const client = new FallbackImageClient(mockPrimary, mockFallback);
            const options = { quality: 'hd' as const };

            await client.generateImage('Test', options);

            expect(mockPrimary.generateImage).toHaveBeenCalledWith('Test', options);
            expect(mockFallback.generateImage).toHaveBeenCalledWith('Test', options);
        });
    });

    describe('resetSequence', () => {
        test('should call resetSequence on both clients if they have it', () => {
            const primaryWithReset = {
                generateImage: jest.fn(),
                resetSequence: jest.fn(),
            };
            const fallbackWithReset = {
                generateImage: jest.fn(),
                resetSequence: jest.fn(),
            };

            const client = new FallbackImageClient(primaryWithReset, fallbackWithReset);

            client.resetSequence();

            expect(primaryWithReset.resetSequence).toHaveBeenCalled();
            expect(fallbackWithReset.resetSequence).toHaveBeenCalled();
        });

        test('should not throw if clients do not have resetSequence', () => {
            const client = new FallbackImageClient(mockPrimary, mockFallback);

            expect(() => client.resetSequence()).not.toThrow();
        });
    });
});
