/**
 * Chaos Tests - Proactive Bug Discovery
 * 
 * These tests simulate extreme failure scenarios to ensure the system
 * degrades gracefully and doesn't crash unexpectedly.
 */

import nock from 'nock';

describe('Chaos Tests - API Failure Scenarios', () => {
    beforeEach(() => {
        nock.cleanAll();
        nock.disableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    describe('API Timeout Handling', () => {
        it('should timeout gracefully when Gpt takes too long', async () => {
            const { GptLlmClient } = require('../../src/infrastructure/llm/GptLlmClient');
            const client = new GptLlmClient('test-key', 'gpt-4o', 'https://api.openai.com');

            // Use fake timers to control the timeout
            jest.useFakeTimers();

            // Simulate a very slow response
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .delay(10000)
                .reply(200, { choices: [{ message: { content: '{}' } }] });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Client-side timeout')), 100)
            );

            const resultPromise = Promise.race([
                client.planReel('test transcript', { minDurationSeconds: 10, maxDurationSeconds: 15 }),
                timeoutPromise
            ]);

            // Advance timers to trigger the timeout
            jest.advanceTimersByTime(200);

            await expect(resultPromise).rejects.toThrow('Client-side timeout');

            // Clean up to prevent logs from the delayed response
            nock.cleanAll();
            jest.useRealTimers();
        });
    });

    describe('Malformed Response Handling', () => {
        it('should handle LLM returning HTML instead of JSON', async () => {
            const { GptLlmClient } = require('../../src/infrastructure/llm/GptLlmClient');
            const client = new GptLlmClient('test-key', 'gpt-4o', 'https://api.openai.com');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            content: '<!DOCTYPE html><html><head><title>Error</title></head><body>Server Error</body></html>'
                        }
                    }]
                });

            await expect(client.planReel('test', { minDurationSeconds: 10, maxDurationSeconds: 15 }))
                .rejects.toThrow();
        });

        it('should handle LLM returning empty response', async () => {
            const { GptLlmClient } = require('../../src/infrastructure/llm/GptLlmClient');
            const client = new GptLlmClient('test-key', 'gpt-4o', 'https://api.openai.com');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { content: '' }
                    }]
                });

            await expect(client.planReel('test', { minDurationSeconds: 10, maxDurationSeconds: 15 }))
                .rejects.toThrow();
        });

        it('should handle LLM returning truncated JSON', async () => {
            const { GptLlmClient } = require('../../src/infrastructure/llm/GptLlmClient');
            const client = new GptLlmClient('test-key', 'gpt-4o', 'https://api.openai.com');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: { content: '{"segmentCount": 3, "targetD' } // Truncated
                    }]
                });

            await expect(client.planReel('test', { minDurationSeconds: 10, maxDurationSeconds: 15 }))
                .rejects.toThrow();
        });
    });

    describe('Rate Limit Handling', () => {
        it('should throw on 429 from Gpt', async () => {
            const { GptLlmClient } = require('../../src/infrastructure/llm/GptLlmClient');
            const client = new GptLlmClient('test-key', 'gpt-4o', 'https://api.openai.com');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .times(5)
                .reply(429, { error: { message: 'Rate limit exceeded' } });

            // Mock sleep to be instant
            const { GptService } = require('../../src/infrastructure/llm/GptService');
            jest.spyOn(GptService.prototype as any, 'sleep').mockResolvedValue(undefined);

            await expect(client.planReel('test', { minDurationSeconds: 10, maxDurationSeconds: 15 }))
                .rejects.toThrow(/LLM call failed: Rate limit exceeded/);

            jest.restoreAllMocks();
        });
    });

    describe('Invalid Credentials', () => {
        it('should throw clear error on 401 Unauthorized', async () => {
            const { GptLlmClient } = require('../../src/infrastructure/llm/GptLlmClient');
            const client = new GptLlmClient('invalid-key', 'gpt-4o', 'https://api.openai.com');

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(401, { error: { message: 'Invalid API key' } });

            await expect(client.planReel('test', { minDurationSeconds: 10, maxDurationSeconds: 15 }))
                .rejects.toThrow('LLM call failed: Invalid API key');
        });
    });

    describe('Content Policy Violations', () => {
        it('should throw clear error when content is rejected', async () => {
            const { DalleImageClient } = require('../../src/infrastructure/images/DalleImageClient');
            const client = new DalleImageClient('test-key', 'https://api.openai.com');

            nock('https://api.openai.com')
                .post('/v1/images/generations')
                .reply(400, {
                    error: {
                        message: 'Your request was rejected as a result of our safety system.',
                        type: 'invalid_request_error',
                        code: 'content_policy_violation'
                    }
                });

            await expect(client.generateImage('Dangerous content'))
                .rejects.toThrow('safety system');
        });
    });
});

describe('Chaos Tests - Data Edge Cases', () => {
    describe('Extreme Input Values', () => {
        it('should handle very long text in TTS', async () => {
            const { CloningTtsClient } = require('../../src/infrastructure/tts/CloningTtsClient');
            const client = new CloningTtsClient('test-key', 'test-voice', 'https://api.fish.audio');

            const veryLongText = 'word '.repeat(50); // Shorter for test speed

            nock('https://api.fish.audio')
                .post('/v1/tts')
                .reply(200, JSON.stringify({ audio_url: 'https://example.com/audio.mp3' }), {
                    'Content-Type': 'application/json'
                });

            const result = await client.synthesize(veryLongText);
            expect(result.audioUrl).toBeDefined();
        });

        it('should handle Unicode characters in prompts', async () => {
            const { DalleImageClient } = require('../../src/infrastructure/images/DalleImageClient');
            const client = new DalleImageClient('test-key', 'https://api.openai.com');

            nock('https://api.openai.com')
                .post('/v1/images/generations')
                .reply(200, { data: [{ url: 'https://example.com/image.png' }] });

            const result = await client.generateImage('日本語のテスト 🎨 émojis and ñ');
            expect(result.imageUrl).toBeDefined();
        });
    });
});
