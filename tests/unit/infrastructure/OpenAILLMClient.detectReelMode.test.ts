import nock from 'nock';
import { OpenAILLMClient } from '../../../src/infrastructure/llm/OpenAILLMClient';
import { ReelModeDetectionResult } from '../../../src/domain/ports/ILLMClient';

describe('OpenAILLMClient.detectReelMode', () => {
    let client: OpenAILLMClient;
    const apiKey = 'test-api-key';

    beforeEach(() => {
        client = new OpenAILLMClient(apiKey, 'gpt-4', 'https://api.openai.com');
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    function mockOpenAIResponse(response: ReelModeDetectionResult) {
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
            mockOpenAIResponse({
                isAnimatedMode: true,
                reason: 'User explicitly mentioned animated video'
            });

            const result = await client.detectReelMode('I want an animated video about spirituality');

            expect(result.isAnimatedMode).toBe(true);
            expect(result.reason).toBeDefined();
        });

        it('should return isAnimatedMode: true when transcript mentions "animation"', async () => {
            mockOpenAIResponse({
                isAnimatedMode: true,
                reason: 'User mentioned animation'
            });

            const result = await client.detectReelMode('Create an animation showing the journey of self-discovery');

            expect(result.isAnimatedMode).toBe(true);
        });

        it('should return isAnimatedMode: true when transcript mentions "moving visuals"', async () => {
            mockOpenAIResponse({
                isAnimatedMode: true,
                reason: 'User wants moving visuals'
            });

            const result = await client.detectReelMode('I want moving visuals for this topic');

            expect(result.isAnimatedMode).toBe(true);
        });
    });

    describe('Default to images', () => {
        it('should return isAnimatedMode: false for normal transcripts (default)', async () => {
            mockOpenAIResponse({
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
            mockOpenAIResponse({
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
            mockOpenAIResponse({
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
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .replyWithError('Network error');

            const result = await client.detectReelMode('Some transcript');

            expect(result.isAnimatedMode).toBe(false);
            expect(result.reason).toContain('Detection failed');
        });

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
