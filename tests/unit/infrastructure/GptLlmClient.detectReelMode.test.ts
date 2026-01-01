import nock from 'nock';
import { GptLlmClient } from '../../../src/infrastructure/llm/GptLlmClient';
import { ReelModeDetectionResult } from '../../../src/domain/ports/ILlmClient';

describe('GptLlmClient.detectReelMode', () => {
    let client: GptLlmClient;
    const apiKey = 'test-api-key';

    beforeEach(() => {
        client = new GptLlmClient(apiKey, 'gpt-4', 'https://api.openai.com/v1');
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    function mockGptResponse(response: ReelModeDetectionResult) {
        nock('https://api.openai.com')
            .post('/v1/chat/completions')
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify(response)
                    }
                }]
            });
    }

    describe('Animated mode detection', () => {
        it('should return isAnimatedMode: true when transcript mentions "animated video"', async () => {
            mockGptResponse({
                isAnimatedMode: true,
                reason: 'User explicitly mentioned animated video'
            });

            const result = await client.detectReelMode('I want an animated video about spirituality');

            expect(result.isAnimatedMode).toBe(true);
            expect(result.reason).toBeDefined();
        });

        it('should return isAnimatedMode: true when transcript mentions "animation"', async () => {
            mockGptResponse({
                isAnimatedMode: true,
                reason: 'User mentioned animation'
            });

            const result = await client.detectReelMode('Create an animation showing the journey of self-discovery');

            expect(result.isAnimatedMode).toBe(true);
        });

        it('should return isAnimatedMode: true when transcript mentions "moving visuals"', async () => {
            mockGptResponse({
                isAnimatedMode: true,
                reason: 'User wants moving visuals'
            });

            const result = await client.detectReelMode('I want moving visuals for this topic');

            expect(result.isAnimatedMode).toBe(true);
        });
    });

    describe('Default to images', () => {
        it('should return isAnimatedMode: false for normal transcripts (default)', async () => {
            mockGptResponse({
                isAnimatedMode: false,
                reason: 'No animation keywords detected'
            });

            const result = await client.detectReelMode('Talk about hypergamy and dating dynamics');

            expect(result.isAnimatedMode).toBe(false);
        });

        it('should return isAnimatedMode: false for empty transcript', async () => {
            const result = await client.detectReelMode('');

            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Empty transcript');
        });

        it('should return isAnimatedMode: false for whitespace-only transcript', async () => {
            const result = await client.detectReelMode('   ');

            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Empty transcript');
        });
    });

    describe('Storyline extraction', () => {
        it('should extract storyline when user provides one', async () => {
            const expectedStoryline = 'A man walking through darkness into light, representing spiritual awakening';
            mockGptResponse({
                isAnimatedMode: true,
                storyline: expectedStoryline,
                reason: 'User provided a storyline for animation'
            });

            const result = await client.detectReelMode(
                'Make an animated video where a man walks through darkness into light, representing spiritual awakening'
            );

            expect(result.isAnimatedMode).toBe(true);
            expect(result.storyline).toBe(expectedStoryline);
        });

        it('should not include storyline when user does not provide one', async () => {
            mockGptResponse({
                isAnimatedMode: true,
                reason: 'User wants animation but no specific storyline'
            });

            const result = await client.detectReelMode('Make an animated video about meditation');

            expect(result.isAnimatedMode).toBe(true);
            expect(result.storyline).toBeUndefined();
        });
    });

    describe('Error handling', () => {
        it('should handle API errors gracefully and default to image mode', async () => {
            // Increase timeout for this test as it involves multiple retries with backoff
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .replyWithError('Network error');

            const result = await client.detectReelMode('Some transcript');

            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Detection failed');
        }, 120000);

        it('should handle malformed JSON response gracefully', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            content: 'not valid json'
                        }
                    }]
                });

            const result = await client.detectReelMode('Some transcript');

            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Detection failed');
        });
    });
});
