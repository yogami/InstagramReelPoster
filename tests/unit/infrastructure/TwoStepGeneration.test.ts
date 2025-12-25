
import { OpenAILLMClient } from '../../../src/infrastructure/llm/OpenAILLMClient';
import { OpenAIService } from '../../../src/infrastructure/llm/OpenAIService';
import { ReelPlan } from '../../../src/domain/ports/ILLMClient';

// Mock dependencies
jest.mock('../../../src/infrastructure/llm/OpenAIService');
const MockOpenAIService = OpenAIService as jest.MockedClass<typeof OpenAIService>;

describe('Two-Step Generation Workflow', () => {
    let client: OpenAILLMClient;
    let mockOpenAI: jest.Mocked<OpenAIService>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOpenAI = new MockOpenAIService('test-key') as jest.Mocked<OpenAIService>;

        // Setup client to use the mock service
        client = new OpenAILLMClient('test-key');
        (client as any).openAIService = mockOpenAI;
        (client as any).standardReelGenerator.openAI = mockOpenAI;
    });

    it('should execute Step 1 (Commentary) then Step 2 (Visuals) and merge results', async () => {
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

        // Mock Step 1 Response (Commentary)
        const mockCommentaryResponse = JSON.stringify([
            { commentary: 'Segment 1 text.' },
            { commentary: 'Segment 2 text.' },
            { commentary: 'Segment 3 text.' }
        ]);

        // Mock Step 2 Response (Visuals)
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

        // Mock calls
        mockOpenAI.chatCompletion
            .mockResolvedValueOnce(mockCommentaryResponse) // Step 1
            .mockResolvedValueOnce(mockVisualsResponse);   // Step 2

        mockOpenAI.parseJSON
            .mockReturnValueOnce(JSON.parse(mockCommentaryResponse))
            .mockReturnValueOnce(JSON.parse(mockVisualsResponse));

        const result = await client.generateSegmentContent(plan, transcript);

        // Verify Step 1 Call
        const step1Call = mockOpenAI.chatCompletion.mock.calls[0];
        expect(step1Call[0]).toContain('Generate the spoken commentary script');
        expect(step1Call[0]).toContain('Simple, 5th-8th grade reading level'); // Check for language requirement

        // Verify Step 2 Call
        const step2Call = mockOpenAI.chatCompletion.mock.calls[1];
        expect(step2Call[0]).toContain('Generate visual prompts');
        expect(step2Call[0]).toContain('Segment 1 text.'); // Check that commentary is passed to Step 2

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

        const mockCommentaryResponse = JSON.stringify([{ commentary: longCommentary }]);
        const mockVisualsResponse = JSON.stringify([{
            imagePrompt: 'Visual',
            caption: 'Cap',
            continuityTags: { location: 'loc', timeOfDay: 'day', dominantColor: 'blue', heroProp: 'none', wardrobeDetail: 'none' }
        }]);

        mockOpenAI.chatCompletion
            .mockResolvedValueOnce(mockCommentaryResponse)
            .mockResolvedValueOnce(mockVisualsResponse);

        mockOpenAI.parseJSON
            .mockReturnValueOnce(JSON.parse(mockCommentaryResponse))
            .mockReturnValueOnce(JSON.parse(mockVisualsResponse));

        const result = await client.generateSegmentContent(plan, 'transcript');

        // Should be truncated
        expect(result[0].commentary.length).toBeLessThan(longCommentary.length);
        expect(result[0].commentary.endsWith('...') || result[0].commentary.endsWith('.')).toBeTruthy();
    });
});
