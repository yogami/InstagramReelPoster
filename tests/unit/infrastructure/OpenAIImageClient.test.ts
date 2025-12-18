import nock from 'nock';
import { OpenAIImageClient } from '../../../src/infrastructure/images/OpenAIImageClient';

describe('OpenAIImageClient', () => {
    const apiKey = 'test-api-key';
    const baseUrl = 'https://api.openai.com';

    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Constructor validation', () => {
        it('should throw error when API key is missing', () => {
            expect(() => new OpenAIImageClient('')).toThrow('OpenAI API key is required');
        });

        it('should create client with valid API key', () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);
            expect(client).toBeDefined();
        });
    });

    describe('generateImage() - Input validation', () => {
        it('should throw error for empty prompt', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);
            await expect(client.generateImage('')).rejects.toThrow('Prompt is required for image generation');
        });

        it('should throw error for whitespace-only prompt', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);
            await expect(client.generateImage('   ')).rejects.toThrow('Prompt is required for image generation');
        });
    });

    describe('generateImage() - Success cases', () => {
        it('should return image URL from DALL-E 3 response', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            nock(baseUrl)
                .post('/v1/images/generations')
                .reply(200, {
                    data: [{
                        url: 'https://oaidalleapiprodscus.blob.core.windows.net/image.png',
                        revised_prompt: 'An enhanced version of the prompt'
                    }]
                });

            const result = await client.generateImage('A sunset over mountains');

            expect(result.imageUrl).toBe('https://oaidalleapiprodscus.blob.core.windows.net/image.png');
            expect(result.revisedPrompt).toBe('An enhanced version of the prompt');
        });

        it('should enhance prompt with cinematic style', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            let capturedBody: any;
            nock(baseUrl)
                .post('/v1/images/generations', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    data: [{ url: 'https://example.com/image.png' }]
                });

            await client.generateImage('A simple tree');

            expect(capturedBody.prompt).toContain('A simple tree');
            expect(capturedBody.prompt).toContain('cinematic');
            expect(capturedBody.prompt).toContain('atmospheric');
        });

        it('should use DALL-E 3 as the model', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            let capturedBody: any;
            nock(baseUrl)
                .post('/v1/images/generations', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, {
                    data: [{ url: 'https://example.com/image.png' }]
                });

            await client.generateImage('Test prompt');

            expect(capturedBody.model).toBe('dall-e-3');
        });
    });

    describe('generateImage() - Error handling', () => {
        it('should throw descriptive error on content policy violation', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            nock(baseUrl)
                .post('/v1/images/generations')
                .reply(400, {
                    error: {
                        message: 'Your request was rejected as a result of our safety system.'
                    }
                });

            await expect(client.generateImage('Inappropriate content')).rejects.toThrow(
                'Image generation failed: Your request was rejected as a result of our safety system.'
            );
        });

        it('should handle 429 rate limit', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            nock(baseUrl)
                .post('/v1/images/generations')
                .reply(429, {
                    error: { message: 'Rate limit exceeded' }
                });

            await expect(client.generateImage('Test')).rejects.toThrow('Image generation failed: Rate limit exceeded');
        });

        it('should handle 500 server error', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            nock(baseUrl)
                .post('/v1/images/generations')
                .reply(500, {
                    error: { message: 'Internal server error' }
                });

            await expect(client.generateImage('Test')).rejects.toThrow('Image generation failed: Internal server error');
        });

        it('should handle network errors', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            nock(baseUrl)
                .post('/v1/images/generations')
                .replyWithError('Connection reset');

            await expect(client.generateImage('Test')).rejects.toThrow('Image generation failed');
        });
    });

    describe('generateImage() - Options', () => {
        it('should use default size if not specified', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            let capturedBody: any;
            nock(baseUrl)
                .post('/v1/images/generations', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, { data: [{ url: 'https://example.com/image.png' }] });

            await client.generateImage('Test');

            expect(capturedBody.size).toBe('1024x1024');
        });

        it('should use custom size when provided', async () => {
            const client = new OpenAIImageClient(apiKey, baseUrl);

            let capturedBody: any;
            nock(baseUrl)
                .post('/v1/images/generations', (body) => {
                    capturedBody = body;
                    return true;
                })
                .reply(200, { data: [{ url: 'https://example.com/image.png' }] });

            await client.generateImage('Test', { size: '1792x1024' as any });

            expect(capturedBody.size).toBe('1792x1024');
        });
    });
});
