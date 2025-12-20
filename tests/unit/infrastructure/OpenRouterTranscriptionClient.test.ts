import axios from 'axios';
import { OpenRouterTranscriptionClient } from '../../../src/infrastructure/transcription/OpenRouterTranscriptionClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenRouterTranscriptionClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should throw error if apiKey is empty', () => {
            expect(() => new OpenRouterTranscriptionClient('')).toThrow('OpenRouter API key is required');
        });

        test('should create client with valid apiKey', () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');
            expect(client).toBeInstanceOf(OpenRouterTranscriptionClient);
        });

        test('should use default model if not provided', () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');
            expect((client as any).model).toBe('google/gemini-2.0-flash-001');
        });

        test('should use custom model if provided', () => {
            const client = new OpenRouterTranscriptionClient('test-api-key', 'custom/model');
            expect((client as any).model).toBe('custom/model');
        });

        test('should use default baseUrl if not provided', () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');
            expect((client as any).baseUrl).toBe('https://openrouter.ai/api/v1');
        });
    });

    describe('transcribe', () => {
        test('should throw error if audioUrl is empty', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');
            await expect(client.transcribe('')).rejects.toThrow('Audio URL is required');
        });

        test('should return transcription on success', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            content: 'This is the transcribed text from the audio file.'
                        }
                    }]
                }
            });

            const result = await client.transcribe('https://example.com/audio.mp3');

            expect(result).toBe('This is the transcribed text from the audio file.');
        });

        test('should trim whitespace from transcription', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: {
                            content: '   Transcription with extra whitespace   '
                        }
                    }]
                }
            });

            const result = await client.transcribe('https://example.com/audio.mp3');

            expect(result).toBe('Transcription with extra whitespace');
        });

        test('should send correct request payload', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: { content: 'Test' }
                    }]
                }
            });

            await client.transcribe('https://example.com/audio.mp3');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://openrouter.ai/api/v1/chat/completions',
                expect.objectContaining({
                    model: 'google/gemini-2.0-flash-001',
                    messages: expect.arrayContaining([
                        expect.objectContaining({
                            role: 'user',
                            content: expect.arrayContaining([
                                expect.objectContaining({ type: 'text' }),
                                expect.objectContaining({
                                    type: 'image_url',
                                    image_url: { url: 'https://example.com/audio.mp3' }
                                })
                            ])
                        })
                    ])
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-api-key'
                    })
                })
            );
        });
    });

    describe('error handling', () => {
        test('should throw on invalid response structure', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {}
            });

            await expect(client.transcribe('https://example.com/audio.mp3'))
                .rejects.toThrow('OpenRouter returned an invalid response structure');
        });

        test('should throw on empty content', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: { content: '' }
                    }]
                }
            });

            await expect(client.transcribe('https://example.com/audio.mp3'))
                .rejects.toThrow('OpenRouter model returned empty transcription');
        });

        test('should throw on null content', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    choices: [{
                        message: { content: null }
                    }]
                }
            });

            await expect(client.transcribe('https://example.com/audio.mp3'))
                .rejects.toThrow('OpenRouter model returned empty transcription');
        });

        test('should throw with API error message on axios error', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    data: {
                        error: { message: 'Rate limit exceeded' }
                    }
                }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(client.transcribe('https://example.com/audio.mp3'))
                .rejects.toThrow('Transcription failed via OpenRouter: Rate limit exceeded');
        });

        test('should rethrow non-axios errors', async () => {
            const client = new OpenRouterTranscriptionClient('test-api-key');

            mockedAxios.post.mockRejectedValueOnce(new Error('Network failure'));

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);

            await expect(client.transcribe('https://example.com/audio.mp3'))
                .rejects.toThrow('Network failure');
        });
    });
});
