
import { OpenAILLMClient } from '../../src/infrastructure/llm/OpenAILLMClient';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAILLMClient Duration Logic', () => {
    let client: OpenAILLMClient;

    beforeEach(() => {
        client = new OpenAILLMClient('fake-key');
        jest.clearAllMocks();
    });

    test('Should accept LLM-determined duration (e.g. 60s) when requested', async () => {
        // Mock OpenAI response simulating "1 minute" understanding
        const mockPlanResponse = {
            targetDurationSeconds: 60,
            segmentCount: 12, // 60s / 5s = 12
            musicTags: ['calm'],
            musicPrompt: 'calm music',
            mood: 'peaceful',
            summary: 'A 1 minute meditation'
        };

        mockedAxios.post.mockResolvedValue({
            data: {
                choices: [{ message: { content: JSON.stringify(mockPlanResponse) } }]
            }
        });

        const plan = await client.planReel('Make a 1 minute reel about peace', {
            minDurationSeconds: 10,
            maxDurationSeconds: 90
        });

        expect(plan.targetDurationSeconds).toBe(60);
        expect(plan.segmentCount).toBe(12);

        // Verify prompt logic
        const requestBody = mockedAxios.post.mock.calls[0][1] as any;
        const prompt = requestBody.messages[1].content;
        expect(prompt).toContain('PRIORITY RULE'); // Confirms prompt has the instruction
        expect(prompt).toContain('MUST stretch');
        expect(prompt).toContain('mainCaption');
    });

    test('Should clamp excessive segment counts to 15', async () => {
        // Mock OpenAI return 20 segments
        const mockPlanResponse = {
            targetDurationSeconds: 100,
            segmentCount: 20,
            musicTags: [],
            musicPrompt: '',
            mood: '',
            summary: ''
        };

        mockedAxios.post.mockResolvedValue({
            data: {
                choices: [{ message: { content: JSON.stringify(mockPlanResponse) } }]
            }
        });

        const plan = await client.planReel('Super long video', {
            minDurationSeconds: 10,
            maxDurationSeconds: 90
        });

        // Assert strictly capped at 15
        expect(plan.segmentCount).toBe(15);
    });
});
