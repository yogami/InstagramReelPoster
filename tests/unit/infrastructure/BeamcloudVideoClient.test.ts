import axios from 'axios';
import { BeamcloudVideoClient } from '../../../src/infrastructure/video/BeamcloudVideoClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BeamcloudVideoClient', () => {
    const apiKey = 'test-beam-api-key';
    const endpointUrl = 'https://app.beam.cloud/endpoint/mochi-video';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should throw error if apiKey is empty', () => {
            expect(() => new BeamcloudVideoClient('', endpointUrl)).toThrow('Beamcloud API key is required');
        });

        test('should throw error if endpointUrl is empty', () => {
            expect(() => new BeamcloudVideoClient(apiKey, '')).toThrow('Beamcloud video endpoint URL is required');
        });

        test('should create client with valid parameters', () => {
            const client = new BeamcloudVideoClient(apiKey, endpointUrl);
            expect(client).toBeInstanceOf(BeamcloudVideoClient);
        });
    });

    describe('generateAnimatedVideo', () => {
        test('should return video URL from video_url field', async () => {
            const client = new BeamcloudVideoClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    video_url: 'https://storage.beam.cloud/video.mp4'
                }
            });

            const result = await client.generateAnimatedVideo({
                durationSeconds: 5,
                theme: 'A peaceful zen garden',
                mood: 'calm',
            });

            expect(result.videoUrl).toBe('https://storage.beam.cloud/video.mp4');
            expect(result.durationSeconds).toBe(5);
        });

        test('should return video URL from url field', async () => {
            const client = new BeamcloudVideoClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    url: 'https://beam-storage.com/output.mp4'
                }
            });

            const result = await client.generateAnimatedVideo({
                durationSeconds: 6,
                theme: 'Ocean waves',
            });

            expect(result.videoUrl).toBe('https://beam-storage.com/output.mp4');
        });

        test('should handle videos array format', async () => {
            const client = new BeamcloudVideoClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    videos: ['https://beam.cloud/v1.mp4', 'https://beam.cloud/v2.mp4']
                }
            });

            const result = await client.generateAnimatedVideo({
                durationSeconds: 5,
                theme: 'Forest scene',
            });

            expect(result.videoUrl).toBe('https://beam.cloud/v1.mp4');
        });

        test('should send request with correct payload', async () => {
            const client = new BeamcloudVideoClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: { video_url: 'https://test.com/video.mp4' }
            });

            await client.generateAnimatedVideo({
                durationSeconds: 5,
                theme: 'Test theme',
                mood: 'epic',
                storyline: 'A hero rises',
            });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                endpointUrl,
                expect.objectContaining({
                    prompt: expect.stringContaining('Test theme'),
                    aspect_ratio: '9:16',
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${apiKey}`,
                    })
                })
            );
        });
    });

    describe('error handling', () => {
        test('should throw with error message on API failure', async () => {
            const client = new BeamcloudVideoClient(apiKey, endpointUrl);

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    data: {
                        error: 'GPU unavailable'
                    }
                }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(client.generateAnimatedVideo({
                durationSeconds: 5,
                theme: 'Test',
            })).rejects.toThrow('Beamcloud video generation failed: GPU unavailable');
        });

        test('should throw if no video URL can be extracted', async () => {
            const client = new BeamcloudVideoClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    result: 'empty'
                }
            });

            await expect(client.generateAnimatedVideo({
                durationSeconds: 5,
                theme: 'Test',
            })).rejects.toThrow('Could not extract video URL from Beamcloud response');
        });
    });
});
