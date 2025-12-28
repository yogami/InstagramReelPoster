import { CaptionService } from '../../../src/application/CaptionService';
import { ILlmClient } from '../../../src/domain/ports/ILlmClient';

describe('CaptionService', () => {
    let llmClient: jest.Mocked<ILlmClient>;
    let service: CaptionService;

    beforeEach(() => {
        llmClient = {
            generateCaptionAndTags: jest.fn(),
        } as any;
        service = new CaptionService(llmClient);
    });

    it('should generate a caption and tags', async () => {
        const mockResponse = {
            captionBody: "This is a viral caption.\nSave it for later.",
            hashtags: ['#spirituality', '#growth', '#reels']
        };
        llmClient.generateCaptionAndTags.mockResolvedValue(mockResponse);

        const result = await service.generateCaption("Full script", "Summary");

        expect(result.captionBody).toContain('Save it');
        expect(result.hashtags).toContain('#spirituality');
        expect(result.hashtags.length).toBe(3);
        expect(llmClient.generateCaptionAndTags).toHaveBeenCalledWith("Full script", "Summary");
    });

    it('should prepend series label and add series hashtag when in series mode', async () => {
        const mockResponse = {
            captionBody: "Original caption body.",
            hashtags: ['#tag1', '#tag2']
        };
        llmClient.generateCaptionAndTags.mockResolvedValue(mockResponse);

        const result = await service.generateCaption("Full script", "Summary", {
            seriesName: "One Hard Truth",
            seriesNumber: 3
        });

        expect(result.captionBody).toBe("Part 3 | Original caption body.");
        expect(result.hashtags).toContain('#OneHardTruth');
        expect(result.seriesTag).toBe('#OneHardTruth');
    });

    it('should not add duplicate series hashtag', async () => {
        const mockResponse = {
            captionBody: "Original caption body.",
            hashtags: ['#OneHardTruth', '#tag1']
        };
        llmClient.generateCaptionAndTags.mockResolvedValue(mockResponse);

        const result = await service.generateCaption("Full script", "Summary", {
            seriesName: "One Hard Truth",
            seriesNumber: 3
        });

        expect(result.hashtags.filter(t => t === '#OneHardTruth').length).toBe(1);
    });
});
