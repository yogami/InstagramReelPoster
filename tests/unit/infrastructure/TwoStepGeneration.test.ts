
import { GptLlmClient } from '../../../src/infrastructure/llm/GptLlmClient';
import { GptService } from '../../../src/infrastructure/llm/GptService';
import { ReelPlan } from '../../../src/domain/ports/ILlmClient';

// Mock dependencies
jest.mock('../../../src/infrastructure/llm/GptService');
const MockGptService = GptService as jest.MockedClass<typeof GptService>;

describe('Two-Step Generation Workflow', () => {
    let client: GptLlmClient;
    let mockGpt: jest.Mocked<GptService>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGpt = new MockGptService('test-key') as jest.Mocked<GptService>;

        // Setup client to use the mock service
        client = new GptLlmClient('test-key');
        (client as any).openAIService = mockGpt;
        (client as any).standardReelGenerator.openAI = mockGpt;
    });

    it('should execute iterative segment generation then visuals and merge results', async () => {
        const plan: ReelPlan = {
            targetDurationSeconds: 15,
            segmentCount: 3,
            musicTags: [],
            musicPrompt: '',
            mood: 'calm',
            summary: 'test summary',
            mainCaption: 'test'
        };

        const transcript = 'Test transcript content';

        // Mock responses for iterative generation (3 segments + 1 visuals call)
        const mockSegment1 = JSON.stringify({ commentary: 'Segment 1 text.' });
        const mockSegment2 = JSON.stringify({ commentary: 'Segment 2 text.' });
        const mockSegment3 = JSON.stringify({ commentary: 'Segment 3 text.' });

        const mockVisualsResponse = JSON.stringify([
            {
                imagePrompt: 'Visual 1',
                caption: 'Cap 1',
                continuityTags: { location: 'loc1', timeOfDay: 'day', dominantColor: 'blue', heroProp: 'none', wardrobeDetail: 'none' }
            },
            {
                imagePrompt: 'Visual 2',
                caption: 'Cap 2',
                continuityTags: { location: 'loc1', timeOfDay: 'day', dominantColor: 'blue', heroProp: 'none', wardrobeDetail: 'none' }
            },
            {
                imagePrompt: 'Visual 3',
                caption: 'Cap 3',
                continuityTags: { location: 'loc1', timeOfDay: 'day', dominantColor: 'blue', heroProp: 'none', wardrobeDetail: 'none' }
            }
        ]);

        // Mock calls: 3 segment calls + 1 visuals call
        mockGpt.chatCompletion
            .mockResolvedValueOnce(mockSegment1)
            .mockResolvedValueOnce(mockSegment2)
            .mockResolvedValueOnce(mockSegment3)
            .mockResolvedValueOnce(mockVisualsResponse);

        mockGpt.parseJSON
            .mockReturnValueOnce(JSON.parse(mockSegment1))
            .mockReturnValueOnce(JSON.parse(mockSegment2))
            .mockReturnValueOnce(JSON.parse(mockSegment3))
            .mockReturnValueOnce(JSON.parse(mockVisualsResponse));

        const result = await client.generateSegmentContent(plan, transcript);

        // Verify iterative segment calls (first 3 calls)
        expect(mockGpt.chatCompletion).toHaveBeenCalledTimes(4); // 3 segments + 1 visuals
        const segment1Call = mockGpt.chatCompletion.mock.calls[0];
        expect(segment1Call[0]).toContain('SEGMENT 1 of 3');
        expect(segment1Call[0]).toContain('Role: hook');

        const segment2Call = mockGpt.chatCompletion.mock.calls[1];
        expect(segment2Call[0]).toContain('SEGMENT 2 of 3');
        expect(segment2Call[0]).toContain('Role: body');

        // Verify visuals call (4th call)
        const visualsCall = mockGpt.chatCompletion.mock.calls[3];
        expect(visualsCall[0]).toContain('Generate visual prompts');
        expect(visualsCall[0]).toContain('Segment 1 text.'); // Commentary passed to visuals

        // Verify Merged Result
        expect(result.length).toBe(3);
        expect(result[0].commentary).toBe('Segment 1 text.');
        expect(result[0].imagePrompt).toBe('Visual 1');
        expect(result[0].continuityTags?.location).toBe('loc1');
    });

    it('should enforce word limits on generated commentary', async () => {
        const plan: ReelPlan = {
            targetDurationSeconds: 10,
            segmentCount: 1,
            musicTags: [],
            musicPrompt: '',
            mood: 'calm',
            summary: 'test',
            mainCaption: 'test'
        };

        // Very long commentary that exceeds limit
        const longCommentary = 'This is a very long sentence that will definitely exceed the word limit calculated for a very short segment duration like ten seconds.';

        // For iterative generation: 1 segment call + 1 visuals call
        const mockSegmentResponse = JSON.stringify({ commentary: longCommentary });
        const mockVisualsResponse = JSON.stringify([{
            imagePrompt: 'Visual',
            caption: 'Cap',
            continuityTags: { location: 'loc', timeOfDay: 'day', dominantColor: 'blue', heroProp: 'none', wardrobeDetail: 'none' }
        }]);

        mockGpt.chatCompletion
            .mockResolvedValueOnce(mockSegmentResponse)
            .mockResolvedValueOnce(mockVisualsResponse);

        mockGpt.parseJSON
            .mockReturnValueOnce(JSON.parse(mockSegmentResponse))
            .mockReturnValueOnce(JSON.parse(mockVisualsResponse));

        const result = await client.generateSegmentContent(plan, 'transcript');

        // Should be truncated
        expect(result[0].commentary.length).toBeLessThan(longCommentary.length);
        expect(result[0].commentary.endsWith('...') || result[0].commentary.endsWith('.')).toBeTruthy();
    });
});
