import nock from 'nock';
import { LocalLLMClient } from '../../../src/infrastructure/llm/LocalLLMClient';

describe('LocalLLMClient', () => {
    const serverUrl = 'http://localhost:11434';

    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('constructor', () => {
        it('should throw if server URL is missing', () => {
            expect(() => new LocalLLMClient('')).toThrow('Local LLM server URL is required');
        });

        it('should create client with valid server URL', () => {
            const client = new LocalLLMClient(serverUrl);
            expect(client).toBeDefined();
        });

        it('should use default model if not specified', () => {
            const client = new LocalLLMClient(serverUrl);
            expect(client).toBeDefined();
        });
    });

    describe('planReel', () => {
        it('should return a valid ReelPlan', async () => {
            const mockResponse = {
                targetDurationSeconds: 30,
                segmentCount: 6,
                musicTags: ['calm', 'ambient'],
                musicPrompt: 'Peaceful background music',
                mood: 'contemplative',
                summary: 'A reflection on mindfulness'
            };

            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify(mockResponse)
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.planReel('Test transcript', {
                minDurationSeconds: 10,
                maxDurationSeconds: 90
            });

            expect(result.targetDurationSeconds).toBe(30);
            expect(result.segmentCount).toBe(6);
            expect(result.musicTags).toEqual(['calm', 'ambient']);
        });

        it('should clamp segment count to minimum 2', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({
                        targetDurationSeconds: 10,
                        segmentCount: 1, // Too low
                        musicTags: [],
                        musicPrompt: '',
                        mood: 'test',
                        summary: 'test'
                    })
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.planReel('Test', {
                minDurationSeconds: 10,
                maxDurationSeconds: 90
            });

            expect(result.segmentCount).toBe(2);
        });

        it('should clamp segment count to maximum 15', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({
                        targetDurationSeconds: 90,
                        segmentCount: 20, // Too high
                        musicTags: [],
                        musicPrompt: '',
                        mood: 'test',
                        summary: 'test'
                    })
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.planReel('Test', {
                minDurationSeconds: 10,
                maxDurationSeconds: 90
            });

            expect(result.segmentCount).toBe(15);
        });
    });

    describe('generateSegmentContent', () => {
        it('should normalize segments from wrapped response', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({
                        segments: [
                            { commentary: 'Test 1', imagePrompt: 'Image 1', caption: '' },
                            { commentary: 'Test 2', imagePrompt: 'Image 2', caption: '' }
                        ]
                    })
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.generateSegmentContent(
                {
                    targetDurationSeconds: 10,
                    segmentCount: 2,
                    musicTags: [],
                    musicPrompt: '',
                    mood: 'test',
                    summary: 'test'
                },
                'Test transcript'
            );

            expect(result).toHaveLength(2);
            expect(result[0].commentary).toBe('Test 1');
        });

        it('should handle array response directly', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify([
                        { commentary: 'Test 1', imagePrompt: 'Image 1' },
                        { commentary: 'Test 2', imagePrompt: 'Image 2' }
                    ])
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.generateSegmentContent(
                {
                    targetDurationSeconds: 10,
                    segmentCount: 2,
                    musicTags: [],
                    musicPrompt: '',
                    mood: 'test',
                    summary: 'test'
                },
                'Test transcript'
            );

            expect(result).toHaveLength(2);
        });

        it('should handle single object response', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({ commentary: 'Single', imagePrompt: 'Prompt' })
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.generateSegmentContent(
                { targetDurationSeconds: 10, segmentCount: 1, musicTags: [], musicPrompt: '', mood: 'test', summary: 'test' },
                'Test'
            );

            expect(result).toHaveLength(1);
            expect(result[0].commentary).toBe('Single');
        });

        it('should handle indexed object response', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({
                        "0": { commentary: 'Test 1', imagePrompt: 'Image 1' },
                        "1": { commentary: 'Test 2', imagePrompt: 'Image 2' }
                    })
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.generateSegmentContent(
                { targetDurationSeconds: 10, segmentCount: 2, musicTags: [], musicPrompt: '', mood: 'test', summary: 'test' },
                'Test'
            );

            expect(result).toHaveLength(2);
            expect(result[0].commentary).toBe('Test 1');
        });

        it('should throw if response is null', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: "null"
                });

            const client = new LocalLLMClient(serverUrl);
            await expect(client.generateSegmentContent(
                { targetDurationSeconds: 10, segmentCount: 1, musicTags: [], musicPrompt: '', mood: 'test', summary: 'test' },
                'Test'
            )).rejects.toThrow('LLM returned null or undefined segment content');
        });

        it('should throw if format is invalid', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({ something: "else" })
                });

            const client = new LocalLLMClient(serverUrl);
            await expect(client.generateSegmentContent(
                { targetDurationSeconds: 10, segmentCount: 1, musicTags: [], musicPrompt: '', mood: 'test', summary: 'test' },
                'Test'
            )).rejects.toThrow('LLM returned invalid segments format');
        });
    });

    describe('parseJSON', () => {
        it('should throw descriptive error on invalid JSON', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: 'invalid json'
                });

            const client = new LocalLLMClient(serverUrl);
            await expect(client.planReel('Test', { minDurationSeconds: 10, maxDurationSeconds: 90 }))
                .rejects.toThrow('Failed to parse LLM response as JSON');
        });
    });

    describe('adjustCommentaryLength', () => {
        it('should return adjusted segments', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({
                        segments: [
                            { commentary: 'Shorter test', imagePrompt: 'Image 1' }
                        ]
                    })
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.adjustCommentaryLength(
                [{ commentary: 'Longer original text', imagePrompt: 'Image 1' }],
                'shorter',
                10
            );

            expect(result[0].commentary).toBe('Shorter test');
        });
    });

    describe('healthCheck', () => {
        it('should return true when Ollama is available', async () => {
            nock(serverUrl)
                .get('/api/tags')
                .reply(200, { models: [] });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.healthCheck();

            expect(result).toBe(true);
        });

        it('should return false when Ollama is unavailable', async () => {
            nock(serverUrl)
                .get('/api/tags')
                .replyWithError('Connection refused');

            const client = new LocalLLMClient(serverUrl);
            const result = await client.healthCheck();

            expect(result).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should retry on transient errors', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .reply(503); // First attempt fails

            nock(serverUrl)
                .post('/api/generate')
                .reply(200, {
                    response: JSON.stringify({
                        targetDurationSeconds: 30,
                        segmentCount: 6,
                        musicTags: [],
                        musicPrompt: '',
                        mood: 'test',
                        summary: 'test'
                    })
                });

            const client = new LocalLLMClient(serverUrl);
            const result = await client.planReel('Test', {
                minDurationSeconds: 10,
                maxDurationSeconds: 90
            });

            expect(result.targetDurationSeconds).toBe(30);
        });

        it('should throw after max retries', async () => {
            nock(serverUrl)
                .post('/api/generate')
                .times(3)
                .reply(503);

            const client = new LocalLLMClient(serverUrl);
            await expect(
                client.planReel('Test', { minDurationSeconds: 10, maxDurationSeconds: 90 })
            ).rejects.toThrow('Local LLM call failed');
        });
    });
});
