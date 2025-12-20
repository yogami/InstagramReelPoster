import axios from 'axios';
import { KieVideoClient } from '../../../src/infrastructure/video/KieVideoClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KieVideoClient', () => {
    const apiKey = 'test-api-key';
    const baseUrl = 'https://api.kie.ai/api/v1';
    const client = new KieVideoClient(apiKey, baseUrl, 'KLING_V2_5_TURBO', 10, 5);

    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('generateAnimatedVideo', () => {
        it('should create a task and poll until success', async () => {
            const mockJobId = 'job-123';
            const mockVideoUrl = 'https://generated.com/video.mp4';
            const options = {
                theme: 'Ocean',
                durationSeconds: 5,
                mood: 'Calm'
            };

            // Mock task creation
            mockedAxios.post.mockResolvedValueOnce({
                data: { data: { taskId: mockJobId } }
            });

            // Mock polling status - pending then success
            mockedAxios.get
                .mockResolvedValueOnce({ data: { data: { state: 'processing' } } })
                .mockResolvedValueOnce({
                    data: {
                        data: {
                            state: 'success',
                            resultJson: JSON.stringify({ resultUrls: [mockVideoUrl] })
                        }
                    }
                });

            const result = await client.generateAnimatedVideo(options);

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.stringContaining('/jobs/createTask'),
                expect.objectContaining({
                    model: 'KLING_V2_5_TURBO',
                    input: expect.objectContaining({
                        prompt: expect.stringContaining('Ocean'),
                        duration: '5',
                        sound: false
                    })
                }),
                expect.any(Object)
            );

            expect(mockedAxios.get).toHaveBeenCalledTimes(2);
            expect(result.videoUrl).toBe(mockVideoUrl);
        });

        it('should throw error if task creation fails', async () => {
            const error: any = new Error('Request failed');
            error.isAxiosError = true;
            error.response = { data: { message: 'Invalid API Key' } };

            mockedAxios.post.mockRejectedValueOnce(error);
            mockedAxios.isAxiosError.mockReturnValue(true);

            await expect(client.generateAnimatedVideo({
                theme: 'Test',
                durationSeconds: 5
            })).rejects.toThrow('Failed to create Kie.ai video task: Invalid API Key');
        });

        it('should throw error if production fails', async () => {
            mockedAxios.post.mockResolvedValueOnce({ data: { data: { taskId: 'job-err' } } });
            mockedAxios.get.mockResolvedValueOnce({ data: { data: { state: 'failed', error: 'Content policy violation' } } });

            await expect(client.generateAnimatedVideo({
                theme: 'Test',
                durationSeconds: 5
            })).rejects.toThrow('Kie.ai video generation failed: Content policy violation');
        });

        it('should timeout if max attempts reached', async () => {
            mockedAxios.post.mockResolvedValueOnce({ data: { data: { taskId: 'job-timeout' } } });
            mockedAxios.get.mockResolvedValue({ data: { data: { state: 'processing' } } });

            await expect(client.generateAnimatedVideo({
                theme: 'Test',
                durationSeconds: 5
            })).rejects.toThrow(/timed out/);
        });
    });
});
