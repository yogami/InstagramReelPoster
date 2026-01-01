
import { GptLinkedInDraftService } from '../../../../src/infrastructure/linkedin/GptLinkedInDraftService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GptLinkedInDraftService', () => {
    let service: GptLinkedInDraftService;
    const apiKey = 'test-api-key';

    beforeEach(() => {
        service = new GptLinkedInDraftService(apiKey);
        jest.clearAllMocks();
    });

    it('should generate a LinkedIn draft from a raw note', async () => {
        const rawNote = 'I am building an AI tool that creates reels automatically.';
        const mockResponse = {
            data: {
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                core_tension: 'Building in public is hard but rewarding.',
                                hook: 'Stop wasting time on manual video editing.',
                                outline_bullets: [
                                    'AI is changing the game for creators.',
                                    'Automation is the key to scaling.',
                                    'Focus on the message, let AI handle the rest.'
                                ],
                                closer_options: [
                                    'How are you using AI in your workflow?',
                                    'Join me on this journey.'
                                ],
                                hashtags: ['#AI', '#Automation', '#Solopreneur']
                            })
                        }
                    }
                ]
            }
        };

        mockedAxios.post.mockResolvedValueOnce(mockResponse);

        const result = await service.generateDraftContent(rawNote);

        expect(result.hook).toBe('Stop wasting time on manual video editing.');
        expect(result.outline_bullets).toHaveLength(3);
        expect(result.hashtags).toContain('#AI');
        expect(mockedAxios.post).toHaveBeenCalled();
    });

    it('should throw error if API returns invalid JSON', async () => {
        mockedAxios.post.mockResolvedValueOnce({
            data: {
                choices: [{ message: { content: 'not a json' } }]
            }
        });

        await expect(service.generateDraftContent('test')).rejects.toThrow(/Failed to parse LinkedIn draft response/);
    });
});
