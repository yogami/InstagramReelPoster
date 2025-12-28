import axios from 'axios';
import { MultiModelImageClient } from '../../../src/infrastructure/images/MultiModelImageClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MultiModelImageClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should throw error if apiKey is empty', () => {
            expect(() => new MultiModelImageClient('')).toThrow('MultiModel API key is required');
        });

        test('should create client with valid apiKey', () => {
            const client = new MultiModelImageClient('test-api-key');
            expect(client).toBeInstanceOf(MultiModelImageClient);
        });

        test('should use default model if not provided', () => {
            const client = new MultiModelImageClient('test-api-key');
            expect((client as any).model).toBe('black-forest-labs/FLUX.1-schnell-Free');
        });

        test('should use custom model if provided', () => {
            const client = new MultiModelImageClient('test-api-key', 'custom/model');
            expect((client as any).model).toBe('custom/model');
        });

        test('should use default baseUrl if not provided', () => {
            const client = new MultiModelImageClient('test-api-key');
            expect((client as any).baseUrl).toBe('https://openrouter.ai/api/v1');
        });

        test('should use custom baseUrl if provided', () => {
            const client = new MultiModelImageClient('test-api-key', 'model', 'https://custom.api.com');
            expect((client as any).baseUrl).toBe('https://custom.api.com');
        });
    });

    describe('generateImage', () => {
        test('should return image URL from images array', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            images: [{
                                image_url: {
                                    url: 'data:image/png;base64,iVBORw0KGgo='
                                }
                            }]
                        }
                    }]
                }
            });

            const result = await client.generateImage('A beautiful sunset');

            expect(result.imageUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
        });

        test('should return direct URL from images array', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            images: ['https://example.com/image.png']
                        }
                    }]
                }
            });

            const result = await client.generateImage('A mountain landscape');

            expect(result.imageUrl).toBe('https://example.com/image.png');
        });

        test('should extract base64 from content fallback', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            content: 'Here is your image: data:image/jpeg;base64,/9j/4AAQSkZJRg=='
                        }
                    }]
                }
            });

            const result = await client.generateImage('A peaceful garden');

            expect(result.imageUrl).toContain('data:image/jpeg;base64');
        });

        test('should extract URL from content fallback', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            content: 'Here is your image: https://cdn.example.com/generated-image.png'
                        }
                    }]
                }
            });

            const result = await client.generateImage('A vibrant cityscape');

            expect(result.imageUrl).toBe('https://cdn.example.com/generated-image.png');
        });

        test('should send request with correct headers', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            images: [{ image_url: { url: 'data:image/png;base64,test' } }]
                        }
                    }]
                }
            });

            await client.generateImage('Test prompt');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://openrouter.ai/api/v1/chat/completions',
                expect.objectContaining({
                    model: 'black-forest-labs/FLUX.1-schnell-Free',
                    modalities: ['image']
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-api-key',
                        'Content-Type': 'application/json'
                    })
                })
            );
        });

        test('should append style to prompt', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            images: [{ image_url: { url: 'data:image/png;base64,test' } }]
                        }
                    }]
                }
            });

            await client.generateImage('A starry night');

            const calledWith = mockedAxios.post.mock.calls[0][1] as any;
            expect(calledWith.messages[0].content).toContain('A starry night');
            expect(calledWith.messages[0].content).toContain('Cinematic');
        });
    });

    describe('error handling', () => {
        test('should throw with error message on API failure', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    data: {
                        error: { message: 'Model not found' }
                    }
                }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(client.generateImage('Test'))
                .rejects.toThrow('MultiModel image generation failed: Model not found');
        });

        test('should throw if no image can be extracted', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            content: 'Sorry, I cannot generate images.'
                        }
                    }]
                }
            });

            await expect(client.generateImage('Test'))
                .rejects.toThrow('Could not extract image from MultiModel response');
        });

        test('should rethrow non-axios errors', async () => {
            const client = new MultiModelImageClient('test-api-key');

            mockedAxios.post.mockRejectedValueOnce(new Error('Network failure'));

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);

            await expect(client.generateImage('Test'))
                .rejects.toThrow('Network failure');
        });
    });

    describe('resetSequence', () => {
        test('should reset sequence state', () => {
            const client = new MultiModelImageClient('test-api-key');

            // Set some internal state
            (client as any).previousPrompt = 'previous prompt';
            (client as any).sequenceIndex = 5;

            client.resetSequence();

            expect((client as any).previousPrompt).toBeUndefined();
            expect((client as any).sequenceIndex).toBe(0);
        });
    });

    describe('extractCompactContext', () => {
        test('should extract location from prompt', () => {
            const client = new MultiModelImageClient('test-api-key');

            const context = (client as any).extractCompactContext('A person sitting on a deck overlooking the ocean');

            expect(context).toContain('Location');
            expect(context).toContain('deck');
        });

        test('should extract lighting from prompt', () => {
            const client = new MultiModelImageClient('test-api-key');

            const context = (client as any).extractCompactContext('Beautiful golden hour lighting in the forest');

            expect(context).toContain('Lighting');
            expect(context).toContain('golden hour');
        });

        test('should fallback to core elements if no matches', () => {
            const client = new MultiModelImageClient('test-api-key');

            const context = (client as any).extractCompactContext('Abstract concept visualization');

            expect(context).toContain('Core elements');
        });
    });
});
