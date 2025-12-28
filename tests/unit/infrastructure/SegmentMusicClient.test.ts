import axios from 'axios';
import { SegmentMusicClient } from '../../../src/infrastructure/music/SegmentMusicClient';
import { MusicGenerationRequest } from '../../../src/domain/ports/IMusicGeneratorClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SegmentMusicClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('constructor', () => {
        test('should throw error if apiKey is empty', () => {
            expect(() => new SegmentMusicClient('')).toThrow('Kie.ai API key is required');
        });

        test('should create client with valid apiKey', () => {
            const client = new SegmentMusicClient('test-api-key');
            expect(client).toBeInstanceOf(SegmentMusicClient);
        });

        test('should use default baseUrl if not provided', () => {
            const client = new SegmentMusicClient('test-api-key');
            expect((client as any).baseUrl).toBe('https://api.kie.ai/suno');
        });

        test('should use custom baseUrl if provided', () => {
            const client = new SegmentMusicClient('test-api-key', 'https://custom.api.com');
            expect((client as any).baseUrl).toBe('https://custom.api.com');
        });

        test('should use default poll interval of 5000ms', () => {
            const client = new SegmentMusicClient('test-api-key');
            expect((client as any).pollIntervalMs).toBe(5000);
        });

        test('should use default max poll attempts of 60', () => {
            const client = new SegmentMusicClient('test-api-key');
            expect((client as any).maxPollAttempts).toBe(60);
        });
    });

    describe('generateMusic', () => {
        test('should start generation and poll for completion', async () => {
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 100, 5);

            // Mock startGeneration response
            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            // Mock pollForCompletion response (immediate success)
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    audio_url: 'https://example.com/music.mp3'
                }
            });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'ambient meditation music',
                durationSeconds: 60,
                instrumental: true
            };

            const resultPromise = client.generateMusic(request);

            // Advance timers to allow polling
            await jest.runAllTimersAsync();

            const result = await resultPromise;

            expect(result.audioUrl).toBe('https://example.com/music.mp3');
            expect(result.isAIGenerated).toBe(true);
            expect(result.tags).toContain('ambient');
            expect(result.tags).toContain('meditation');
        });

        test('should extract tags from description prompt', async () => {
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 100, 5);

            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    audio_url: 'https://example.com/music.mp3'
                }
            });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'peaceful tibetan bells with flute',
                durationSeconds: 30
            };

            const resultPromise = client.generateMusic(request);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.tags).toContain('peaceful');
            expect(result.tags).toContain('tibetan');
            expect(result.tags).toContain('bells');
            expect(result.tags).toContain('flute');
            expect(result.tags).toContain('ai-generated');
        });
    });

    describe('startGeneration', () => {
        test('should throw if no job ID returned', async () => {
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 100, 1);

            mockedAxios.post.mockResolvedValueOnce({
                data: {} // No jobId
            });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'test music',
                durationSeconds: 30
            };

            await expect(client.generateMusic(request)).rejects.toThrow('No job ID returned from Kie.ai');
        });

        test('should throw with error message on API failure', async () => {
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 100, 1);

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    data: { message: 'Invalid API key' }
                }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'test music',
                durationSeconds: 30
            };

            await expect(client.generateMusic(request)).rejects.toThrow('Music generation failed to start: Invalid API key');
        });
    });

    describe('pollForCompletion', () => {
        test('should poll multiple times before success', async () => {
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 100, 10);

            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            // First poll: still processing
            mockedAxios.get
                .mockResolvedValueOnce({ data: { status: 'processing' } })
                .mockResolvedValueOnce({ data: { status: 'processing' } })
                .mockResolvedValueOnce({
                    data: {
                        status: 'completed',
                        audio_url: 'https://example.com/music.mp3'
                    }
                });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'ambient music',
                durationSeconds: 30
            };

            const resultPromise = client.generateMusic(request);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            expect(mockedAxios.get).toHaveBeenCalledTimes(3);
            expect(result.audioUrl).toBe('https://example.com/music.mp3');
        });

        test('should throw on failed status', async () => {
            jest.useRealTimers(); // Use real timers for this test
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 10, 5);

            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    status: 'failed',
                    error: 'Generation failed due to content policy'
                }
            });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'test music',
                durationSeconds: 30
            };

            await expect(client.generateMusic(request)).rejects.toThrow('Music generation failed: Generation failed due to content policy');
        });

        test('should throw on timeout', async () => {
            jest.useRealTimers(); // Use real timers for this test
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 10, 2);

            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            // Always return processing status
            mockedAxios.get.mockResolvedValue({ data: { status: 'processing' } });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'test music',
                durationSeconds: 30
            };

            await expect(client.generateMusic(request)).rejects.toThrow('Music generation timed out');
        });

        test('should throw if no audio URL in completed response', async () => {
            jest.useRealTimers(); // Use real timers for this test
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 10, 5);

            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            mockedAxios.get.mockResolvedValueOnce({
                data: { status: 'completed' } // No audio_url
            });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'test music',
                durationSeconds: 30
            };

            await expect(client.generateMusic(request)).rejects.toThrow('No audio URL in completed response');
        });
    });

    describe('buildDescriptionPrompt', () => {
        test('should include ambient and eastern requirements', async () => {
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 100, 5);

            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    audio_url: 'https://example.com/music.mp3'
                }
            });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'calm meditation',
                durationSeconds: 30
            };

            const resultPromise = client.generateMusic(request);
            await jest.runAllTimersAsync();
            await resultPromise;

            // Verify the prompt sent to the API
            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    gpt_description_prompt: expect.stringContaining('ambient')
                }),
                expect.any(Object)
            );
        });
    });

    describe('extractTagsFromPrompt', () => {
        test('should always include ai-generated tag', async () => {
            const client = new SegmentMusicClient('test-api-key', 'https://api.kie.ai/suno', 100, 5);

            mockedAxios.post.mockResolvedValueOnce({
                data: { jobId: 'test-job-123' }
            });

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    audio_url: 'https://example.com/music.mp3'
                }
            });

            const request: MusicGenerationRequest = {
                descriptionPrompt: 'some random prompt without common tags',
                durationSeconds: 30
            };

            const resultPromise = client.generateMusic(request);
            await jest.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.tags).toContain('ai-generated');
        });
    });
});
