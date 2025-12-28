import { ImageGenerationService } from '../../../src/application/services/ImageGenerationService';
import { IImageClient } from '../../../src/domain/ports/IImageClient';
import { Segment } from '../../../src/domain/entities/Segment';

describe('ImageGenerationService', () => {
    let service: ImageGenerationService;
    let mockPrimaryClient: jest.Mocked<IImageClient>;
    let mockFallbackClient: jest.Mocked<IImageClient>;

    beforeEach(() => {
        mockPrimaryClient = {
            generateImage: jest.fn(),
        } as unknown as jest.Mocked<IImageClient>;

        mockFallbackClient = {
            generateImage: jest.fn(),
        } as unknown as jest.Mocked<IImageClient>;

        service = new ImageGenerationService(mockPrimaryClient, mockFallbackClient);
    });

    describe('generateForSegments', () => {
        const mockSegments: Segment[] = [
            { index: 0, imagePrompt: 'Prompt 1', startSeconds: 0, endSeconds: 10, commentary: 'C1' },
            { index: 1, imagePrompt: 'Prompt 2', startSeconds: 10, endSeconds: 20, commentary: 'C2' },
        ];

        it('should generate images for all segments using primary client', async () => {
            mockPrimaryClient.generateImage
                .mockResolvedValueOnce({ imageUrl: 'https://example.com/img1.png' })
                .mockResolvedValueOnce({ imageUrl: 'https://example.com/img2.png' });

            const result = await service.generateForSegments(mockSegments, 'job-123');

            expect(result).toHaveLength(2);
            expect(result[0].imageUrl).toBe('https://example.com/img1.png');
            expect(result[1].imageUrl).toBe('https://example.com/img2.png');
            expect(mockPrimaryClient.generateImage).toHaveBeenCalledTimes(2);
        });

        it('should fall back to secondary client when primary fails', async () => {
            mockPrimaryClient.generateImage.mockRejectedValueOnce(new Error('Primary failed'));
            mockFallbackClient.generateImage.mockResolvedValueOnce({ imageUrl: 'https://fallback.com/img.png' });
            mockPrimaryClient.generateImage.mockResolvedValueOnce({ imageUrl: 'https://example.com/img2.png' });

            const result = await service.generateForSegments(mockSegments, 'job-123');

            expect(result[0].imageUrl).toBe('https://fallback.com/img.png');
            expect(result[1].imageUrl).toBe('https://example.com/img2.png');
            expect(mockFallbackClient.generateImage).toHaveBeenCalledTimes(1);
        });

        it('should preserve segment metadata when generating images', async () => {
            mockPrimaryClient.generateImage.mockResolvedValue({ imageUrl: 'https://example.com/img.png' });

            const result = await service.generateForSegments(mockSegments, 'job-123');

            expect(result[0].imagePrompt).toBe('Prompt 1');
            expect(result[0].startSeconds).toBe(0);
            expect(result[0].commentary).toBe('C1');
        });
    });
});
