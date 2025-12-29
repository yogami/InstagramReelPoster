import axios from 'axios';
import { FluxImageClient } from '../../../src/infrastructure/images/FluxImageClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FluxImageClient', () => {
    const apiKey = 'test-beam-api-key';
    const endpointUrl = 'https://app.beam.cloud/endpoint/flux1-image';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should throw error if apiKey is empty', () => {
            expect(() => new FluxImageClient('', endpointUrl)).toThrow('Flux API key is required');
        });

        test('should throw error if endpointUrl is empty', () => {
            expect(() => new FluxImageClient(apiKey, '')).toThrow('Flux endpoint URL is required');
        });

        test('should create client with valid parameters', () => {
            const client = new FluxImageClient(apiKey, endpointUrl);
            expect(client).toBeInstanceOf(FluxImageClient);
        });
    });

    describe('generateImage', () => {
        test('should return image URL from image_base64 field', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    image_base64: 'data:image/png;base64,iVBORw0KGgo='
                }
            });

            const result = await client.generateImage('A beautiful sunset');

            expect(result.imageUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
        });

        test('should return image URL from url field', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    url: 'https://beam-storage.com/image.png'
                }
            });

            const result = await client.generateImage('A mountain landscape');

            expect(result.imageUrl).toBe('https://beam-storage.com/image.png');
        });

        test('should handle image field without data URI prefix', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    image: 'iVBORw0KGgo='
                }
            });

            const result = await client.generateImage('A peaceful garden');

            expect(result.imageUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
        });

        test('should handle images array format', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    images: ['data:image/png;base64,firstImage=']
                }
            });

            const result = await client.generateImage('Abstract art');

            expect(result.imageUrl).toBe('data:image/png;base64,firstImage=');
        });

        test('should handle output.image format', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    output: {
                        image: 'nestedImageData='
                    }
                }
            });

            const result = await client.generateImage('Nested format');

            expect(result.imageUrl).toBe('data:image/png;base64,nestedImageData=');
        });

        test('should send request with correct headers', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: { image_base64: 'data:image/png;base64,test' }
            });

            await client.generateImage('Test prompt');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                endpointUrl,
                expect.objectContaining({
                    prompt: expect.stringContaining('Test prompt'),
                    aspect_ratio: '9:16',
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    })
                })
            );
        });

        test('should NOT send quality parameter (Beam.cloud contract)', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: { image_base64: 'data:image/png;base64,test' }
            });

            await client.generateImage('Test prompt', { quality: 'hd' });

            const calledPayload = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
            expect(calledPayload).not.toHaveProperty('quality');
        });
    });

    describe('error handling', () => {
        test('should throw with error message on API failure', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    data: {
                        error: 'Model loading failed'
                    }
                }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(client.generateImage('Test'))
                .rejects.toThrow('Flux image generation failed (undefined): Model loading failed');
        });

        test('should throw if no image can be extracted', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    status: 'completed',
                    result: 'empty'
                }
            });

            await expect(client.generateImage('Test'))
                .rejects.toThrow('Could not extract image from Flux response');
        });

        test('should rethrow non-axios errors', async () => {
            const client = new FluxImageClient(apiKey, endpointUrl);

            mockedAxios.post.mockRejectedValueOnce(new Error('Network failure'));

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);

            await expect(client.generateImage('Test'))
                .rejects.toThrow('Network failure');
        });
    });

    describe('resetSequence', () => {
        test('should not throw when called', () => {
            const client = new FluxImageClient(apiKey, endpointUrl);
            expect(() => client.resetSequence()).not.toThrow();
        });
    });
});
