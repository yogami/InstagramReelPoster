import axios from 'axios';
import { MultiModelVideoClient } from '../../../src/infrastructure/video/MultiModelVideoClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MultiModelVideoClient', () => {
    const apiKey = 'test-api-key';
    const baseUrl = 'https://api.kie.ai/api/v1';
    const client = new MultiModelVideoClient(apiKey, baseUrl, 'KLING_V2_5_TURBO', 10, 5);

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
                data: { code: 200, data: { taskId: mockJobId } }
            });

            // Mock polling status - pending then success
            mockedAxios.get
                .mockResolvedValueOnce({ data: { code: 200, data: { state: 'processing' } } })
                .mockResolvedValueOnce({
                    data: {
                        code: 200,
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
            })).rejects.toThrow('Failed to create VideoGen video task: Invalid API Key');
        });

        it('should throw error if production fails', async () => {
            mockedAxios.post.mockResolvedValueOnce({ data: { code: 200, data: { taskId: 'job-err' } } });
            mockedAxios.get.mockResolvedValueOnce({ data: { code: 200, data: { state: 'failed', error: 'Content policy violation' } } });

            await expect(client.generateAnimatedVideo({
                theme: 'Test',
                durationSeconds: 5
            })).rejects.toThrow('VideoGen video generation failed: Content policy violation');
        });

        it('should timeout if max attempts reached', async () => {
            mockedAxios.post.mockResolvedValueOnce({ data: { code: 200, data: { taskId: 'job-timeout' } } });
            mockedAxios.get.mockResolvedValue({ data: { code: 200, data: { state: 'processing' } } });

            await expect(client.generateAnimatedVideo({
                theme: 'Test',
                durationSeconds: 5
            })).rejects.toThrow(/timed out/);
        });
    });
});
