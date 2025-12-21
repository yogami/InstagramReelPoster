import { CaptionService } from '../../../src/application/CaptionService';
import { ILLMClient } from '../../../src/domain/ports/ILLMClient';

describe('CaptionService', () => {
    let llmClient: jest.Mocked<ILLMClient>;
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
        expect(result.hashtags.length).toBeGreaterThanOrEqual(3);
        expect(llmClient.generateCaptionAndTags).toHaveBeenCalledWith("Full script", "Summary");
    });
});
