import nock from 'nock';
import { GptVisionClient } from '../../../src/infrastructure/llm/GptVisionClient';

describe('GptVisionClient', () => {
    let client: GptVisionClient;

    beforeEach(() => {
        client = new GptVisionClient('test-api-key');
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('verifyImageContent', () => {
        it('should detect text in an image and return isValid=false for mustBeTextFree', async () => {
            // Mock OpenAI response with text detected
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                hasText: true,
                                detectedText: ['CALL NOW', '555-1234'],
                                containedElements: [],
                                issues: []
                            })
                        }
                    }]
                });

            const result = await client.verifyImageContent(
                'https://example.com/image-with-text.jpg',
                { mustBeTextFree: true }
            );

            expect(result.isValid).toBe(false);
            expect(result.detectedText).toContain('CALL NOW');
            expect(result.issues).toContain('Text detected in image');
        });

        it('should return isValid=true for text-free image', async () => {
            // Mock OpenAI response with no text detected
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                hasText: false,
                                detectedText: [],
                                containedElements: ['blurred background', 'gradient'],
                                issues: []
                            })
                        }
                    }]
                });

            const result = await client.verifyImageContent(
                'https://example.com/clean-background.jpg',
                { mustBeTextFree: true }
            );

            expect(result.isValid).toBe(true);
            expect(result.detectedText).toHaveLength(0);
            expect(result.issues).toHaveLength(0);
        });

        it('should check for mustContain elements', async () => {
            // Mock OpenAI response with coffee shop elements
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                hasText: false,
                                detectedText: [],
                                containedElements: ['coffee', 'cup', 'steam'],
                                issues: []
                            })
                        }
                    }]
                });

            const result = await client.verifyImageContent(
                'https://example.com/coffee-shop.jpg',
                { mustContain: ['coffee', 'cup'] }
            );

            expect(result.isValid).toBe(true);
        });

        it('should fail when mustContain elements are missing', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                hasText: false,
                                detectedText: [],
                                containedElements: ['table', 'chair'],
                                issues: []
                            })
                        }
                    }]
                });

            const result = await client.verifyImageContent(
                'https://example.com/empty-room.jpg',
                { mustContain: ['coffee', 'cup'] }
            );

            expect(result.isValid).toBe(false);
            expect(result.issues).toContain('Required element not found: coffee');
        });

        it('should handle API errors gracefully', async () => {
            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(401, {
                    error: { message: 'Invalid API key' }
                });

            await expect(
                client.verifyImageContent('https://example.com/test.jpg', { mustBeTextFree: true })
            ).rejects.toThrow('Vision API error: Invalid API key');
        });
    });
});
