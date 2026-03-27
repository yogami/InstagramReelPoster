
import { GeminiLlmClient } from '../../../src/infrastructure/llm/GeminiLlmClient';

// Mock the Google Generative AI SDK
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
    generateContent: mockGenerateContent
});

jest.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: jest.fn().mockImplementation(() => {
            return {
                getGenerativeModel: mockGetGenerativeModel
            };
        })
    };
});

describe('GeminiLlmClient', () => {
    let client: GeminiLlmClient;
    const apiKey = 'test-api-key';

    beforeEach(() => {
        client = new GeminiLlmClient(apiKey, 'gemini-1.5-pro');
        mockGenerateContent.mockReset();
        mockGetGenerativeModel.mockClear();
    });

    describe('detectReelMode', () => {
        it('should return isAnimatedMode: true when Gemini returns it', async () => {
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => JSON.stringify({
                        isAnimatedMode: true,
                        reason: 'User wants animation'
                    })
                }
            });

            const result = await client.detectReelMode('I want an animated video');

            expect(result.isAnimatedMode).toBe(true);
            expect(result.reason).toBe('User wants animation');
        });

        it('should default to image mode on error', async () => {
            mockGenerateContent.mockRejectedValue(new Error('API Error'));

            const result = await client.detectReelMode('Some transcript');

            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Detection failed');
        });
    });

    describe('selectMusicTags', () => {
        it('should return tags from Gemini', async () => {
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => JSON.stringify({
                        tags: ['tech', 'modern', 'electronic']
                    })
                }
            });

            const tags = await client.selectMusicTags('AI and future', 'uplifting');

            expect(tags).toEqual(['tech', 'modern', 'electronic']);
        });

        it('should return default tags on error', async () => {
            mockGenerateContent.mockRejectedValue(new Error('API Error'));

            const tags = await client.selectMusicTags('transcript', 'mood');

            expect(tags).toContain('ambient');
            expect(tags).toContain('meditation');
        });
    });
});
