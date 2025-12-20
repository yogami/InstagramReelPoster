import axios from 'axios';
import { LocalLLMClient } from '../../../src/infrastructure/llm/LocalLLMClient';
import { ReelPlan, SegmentContent } from '../../../src/domain/ports/ILLMClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocalLLMClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should throw error if serverUrl is empty', () => {
            expect(() => new LocalLLMClient('')).toThrow('Local LLM server URL is required');
        });

        test('should create client with valid serverUrl', () => {
            const client = new LocalLLMClient('http://localhost:11434');
            expect(client).toBeInstanceOf(LocalLLMClient);
        });

        test('should strip trailing slash from serverUrl', () => {
            const client = new LocalLLMClient('http://localhost:11434/');
            // Access private field via any cast for testing
            expect((client as any).serverUrl).toBe('http://localhost:11434');
        });

        test('should use default model if not provided', () => {
            const client = new LocalLLMClient('http://localhost:11434');
            expect((client as any).model).toBe('llama3.2');
        });

        test('should use custom model if provided', () => {
            const client = new LocalLLMClient('http://localhost:11434', 'mistral');
            expect((client as any).model).toBe('mistral');
        });

        test('should use default system prompt if not provided', () => {
            const client = new LocalLLMClient('http://localhost:11434');
            expect((client as any).systemPrompt).toContain('helpful and intelligent');
        });

        test('should use custom system prompt if provided', () => {
            const client = new LocalLLMClient('http://localhost:11434', 'llama3.2', 'Custom prompt');
            expect((client as any).systemPrompt).toBe('Custom prompt');
        });
    });

    describe('planReel', () => {
        test('should return a valid ReelPlan', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const mockPlan: ReelPlan = {
                targetDurationSeconds: 60,
                segmentCount: 12,
                musicTags: ['calm', 'ambient'],
                musicPrompt: 'Calm ambient music',
                mood: 'peaceful',
                summary: 'A meditation reel',
                mainCaption: 'Find your inner peace'
            };

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(mockPlan) }
            });

            const plan = await client.planReel('Test transcript', {
                minDurationSeconds: 10,
                maxDurationSeconds: 90
            });

            expect(plan.targetDurationSeconds).toBe(60);
            expect(plan.segmentCount).toBe(12);
            expect(plan.mood).toBe('peaceful');
        });

        test('should clamp segmentCount to minimum 2', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const mockPlan = {
                targetDurationSeconds: 10,
                segmentCount: 1, // Below minimum
                musicTags: [],
                musicPrompt: '',
                mood: '',
                summary: ''
            };

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(mockPlan) }
            });

            const plan = await client.planReel('Test', { minDurationSeconds: 10, maxDurationSeconds: 90 });
            expect(plan.segmentCount).toBe(2);
        });

        test('should clamp segmentCount to maximum 15', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const mockPlan = {
                targetDurationSeconds: 100,
                segmentCount: 20, // Above maximum
                musicTags: [],
                musicPrompt: '',
                mood: '',
                summary: ''
            };

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(mockPlan) }
            });

            const plan = await client.planReel('Test', { minDurationSeconds: 10, maxDurationSeconds: 90 });
            expect(plan.segmentCount).toBe(15);
        });
    });

    describe('generateSegmentContent', () => {
        test('should return array of SegmentContent', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const mockSegments = {
                segments: [
                    { commentary: 'Segment 1 commentary', imagePrompt: 'Image 1', caption: 'Caption 1' },
                    { commentary: 'Segment 2 commentary', imagePrompt: 'Image 2', caption: 'Caption 2' }
                ]
            };

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(mockSegments) }
            });

            const plan: ReelPlan = {
                targetDurationSeconds: 10,
                segmentCount: 2,
                musicTags: [],
                musicPrompt: '',
                mood: 'test',
                summary: 'test',
                mainCaption: 'Test caption'
            };

            const segments = await client.generateSegmentContent(plan, 'Test transcript');
            expect(segments).toHaveLength(2);
            expect(segments[0].commentary).toBe('Segment 1 commentary');
        });

        test('should normalize array response', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const mockSegments = [
                { commentary: 'Seg 1', imagePrompt: 'Img 1', caption: 'Cap 1' }
            ];

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(mockSegments) }
            });

            const plan: ReelPlan = {
                targetDurationSeconds: 5,
                segmentCount: 1,
                musicTags: [],
                musicPrompt: '',
                mood: 'test',
                summary: 'test',
                mainCaption: 'Test caption'
            };

            const segments = await client.generateSegmentContent(plan, 'Test');
            expect(segments).toHaveLength(1);
        });
    });

    describe('adjustCommentaryLength', () => {
        test('should return adjusted segments', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const inputSegments: SegmentContent[] = [
                { commentary: 'Original text', imagePrompt: 'Img', caption: 'Cap' }
            ];
            const adjustedSegments = {
                segments: [
                    { commentary: 'Shorter text', imagePrompt: 'Img', caption: 'Cap' }
                ]
            };

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(adjustedSegments) }
            });

            const result = await client.adjustCommentaryLength(inputSegments, 'shorter', 30);
            expect(result).toHaveLength(1);
            expect(result[0].commentary).toBe('Shorter text');
        });
    });

    describe('normalizeSegments (via generateSegmentContent)', () => {
        test('should unwrap .segments from object', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const wrappedResponse = {
                segments: [
                    { commentary: 'C1', imagePrompt: 'I1', caption: 'Cap1' }
                ]
            };

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(wrappedResponse) }
            });

            const plan: ReelPlan = {
                targetDurationSeconds: 5,
                segmentCount: 1,
                musicTags: [],
                musicPrompt: '',
                mood: 'test',
                summary: 'test',
                mainCaption: 'Test caption'
            };

            const segments = await client.generateSegmentContent(plan, 'Test');
            expect(segments).toHaveLength(1);
        });

        test('should wrap single object into array', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const singleSegment = { commentary: 'Single', imagePrompt: 'Img', caption: 'Cap' };

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: JSON.stringify(singleSegment) }
            });

            const plan: ReelPlan = {
                targetDurationSeconds: 5,
                segmentCount: 1,
                musicTags: [],
                musicPrompt: '',
                mood: 'test',
                summary: 'test',
                mainCaption: 'Test caption'
            };

            const segments = await client.generateSegmentContent(plan, 'Test');
            expect(segments).toHaveLength(1);
            expect(segments[0].commentary).toBe('Single');
        });
    });

    describe('healthCheck', () => {
        test('should return true on successful connection', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            mockedAxios.get.mockResolvedValueOnce({ status: 200 });

            const result = await client.healthCheck();
            expect(result).toBe(true);
        });

        test('should return false on connection failure', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            mockedAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const result = await client.healthCheck();
            expect(result).toBe(false);
        });
    });

    describe('error handling', () => {
        test('should retry on transient errors (502, 503, 429)', async () => {
            const client = new LocalLLMClient('http://localhost:11434');
            const mockPlan = {
                targetDurationSeconds: 30,
                segmentCount: 6,
                musicTags: [],
                musicPrompt: '',
                mood: 'test',
                summary: 'test'
            };

            // First call fails with 502, second succeeds
            mockedAxios.post
                .mockRejectedValueOnce({
                    isAxiosError: true,
                    response: { status: 502, data: { error: 'Bad Gateway' } }
                })
                .mockResolvedValueOnce({
                    data: { response: JSON.stringify(mockPlan) }
                });

            // Mock axios.isAxiosError
            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            const plan = await client.planReel('Test', { minDurationSeconds: 10, maxDurationSeconds: 90 });
            expect(plan.targetDurationSeconds).toBe(30);
            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
        });

        test('should throw on non-transient errors', async () => {
            const client = new LocalLLMClient('http://localhost:11434');

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: { status: 400, data: { error: 'Bad Request' } }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(client.planReel('Test', { minDurationSeconds: 10, maxDurationSeconds: 90 }))
                .rejects.toThrow('Local LLM call failed');
        });

        test('should throw on invalid JSON response', async () => {
            const client = new LocalLLMClient('http://localhost:11434');

            mockedAxios.post.mockResolvedValueOnce({
                data: { response: 'not valid json {' }
            });

            await expect(client.planReel('Test', { minDurationSeconds: 10, maxDurationSeconds: 90 }))
                .rejects.toThrow('Failed to parse LLM response');
        });
    });
});
