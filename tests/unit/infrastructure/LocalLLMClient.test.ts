
import axios from 'axios';
import { LocalLlmClient } from '../../../src/infrastructure/llm/LocalLlmClient';
import { ReelPlan } from '../../../src/domain/ports/ILlmClient';

jest.mock('axios');
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 2.0
    }))
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocalLlmClient', () => {
    let client: LocalLlmClient;
    const serverUrl = 'http://localhost:11434';

    beforeEach(() => {
        jest.clearAllMocks();
        client = new LocalLlmClient(serverUrl);
    });

    describe('constructor', () => {
        test('should throw if serverUrl is missing', () => {
            expect(() => new LocalLlmClient('')).toThrow('Local LLM server URL is required');
        });

        test('should strip trailing slash from serverUrl', () => {
            const c = new LocalLlmClient('http://test.com/');
            expect((c as any).serverUrl).toBe('http://test.com');
        });
    });

    describe('detectReelMode', () => {
        test('should default to images for empty transcript', async () => {
            const result = await client.detectReelMode('');
            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Empty transcript');
        });

        test('should parse valid JSON response', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    response: JSON.stringify({
                        isAnimatedMode: true,
                        storyline: 'A cool story',
                        reason: 'User said video'
                    })
                }
            });

            const result = await client.detectReelMode('I want an animated video');
            expect(result.isAnimatedMode).toBe(true);
            expect(result.storyline).toBe('A cool story');
        });

        test('should handle JSON wrapped in markdown', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    response: '```json\n{"isAnimatedMode": false}\n```'
                }
            });

            const result = await client.detectReelMode('Just images');
            expect(result.isAnimatedMode).toBe(false);
        });

        test('should fallback to false on error', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));
            const result = await client.detectReelMode('transcript');
            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Detection failed');
        });
    });

    describe('planReel', () => {
        test('should clamp segment count', async () => {
            // Mock response with segmentCount 20 (too high)
            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify({ targetDurationSeconds: 60, segmentCount: 20 }) }
            });

            const plan = await client.planReel('transcript', { minDurationSeconds: 10, maxDurationSeconds: 60 });
            expect(plan.segmentCount).toBe(15);
        });
    });

    describe('generateSegmentContent', () => {
        test('should normalize array response', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify([{ commentary: 'c1' }, { commentary: 'c2' }]) }
            });

            const segments = await client.generateSegmentContent({ targetDurationSeconds: 10, segmentCount: 2 } as ReelPlan, 'tx');
            expect(segments).toHaveLength(2);
        });

        test('should normalize object with segments key', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify({ segments: [{ commentary: 'c1' }] }) }
            });

            const segments = await client.generateSegmentContent({ targetDurationSeconds: 10, segmentCount: 1 } as ReelPlan, 'tx');
            expect(segments).toHaveLength(1);
        });
    });

    describe('generateCaptionAndTags', () => {
        test('should clean hashtags', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify({ captionBody: 'cap', hashtags: ['tag1', '#tag2'] }) }
            });
            const result = await client.generateCaptionAndTags('script', 'summary');
            expect(result.hashtags).toEqual(['#tag1', '#tag2']);
        });

        test('should handle string hashtags', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify({ captionBody: 'cap', hashtags: 'tag1, tag2' }) }
            });
            const result = await client.generateCaptionAndTags('script', 'summary');
            expect(result.hashtags).toEqual(['#tag1', '#tag2']);
        });

        test('should provide defaults if no hashtags returned', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify({ captionBody: 'cap', hashtags: [] }) }
            });
            const result = await client.generateCaptionAndTags('script', 'summary');
            expect(result.hashtags.length).toBeGreaterThan(0);
        });
    });

    describe('callOllama (Retries)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should retry on transient errors (503)', async () => {
            const error503 = { isAxiosError: true, response: { status: 503 } };
            const success = { data: { response: '{}' } };

            // Fail twice, succeed third time
            mockedAxios.isAxiosError.mockReturnValue(true);
            mockedAxios.post
                .mockRejectedValueOnce(error503)
                .mockRejectedValueOnce(error503)
                .mockResolvedValueOnce(success);

            // Start the promise content
            const promise = client.detectReelMode('test');

            // Fast-forward time for retries
            await jest.advanceTimersByTimeAsync(8000); // Enough for exponential backoff

            await promise;

            expect(mockedAxios.post).toHaveBeenCalledTimes(3);
        });

        test('should throw on non-transient error (400)', async () => {
            const error400 = { isAxiosError: true, response: { status: 400, data: { error: 'Bad Request' } } };
            mockedAxios.isAxiosError.mockReturnValue(true);
            mockedAxios.post.mockRejectedValue(error400);

            await expect(client.planReel('tx', {} as any)).rejects.toThrow('Local LLM call failed (400): Bad Request');
        });
    });

    describe('healthCheck', () => {
        test('should return true on 200', async () => {
            mockedAxios.get.mockResolvedValue({ status: 200 });
            const healthy = await client.healthCheck();
            expect(healthy).toBe(true);
        });

        test('should return false on error', async () => {
            mockedAxios.get.mockRejectedValue(new Error('Down'));
            const healthy = await client.healthCheck();
            expect(healthy).toBe(false);
        });
    });
});
