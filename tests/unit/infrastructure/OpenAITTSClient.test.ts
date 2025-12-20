import axios from 'axios';
import { OpenAITTSClient } from '../../../src/infrastructure/tts/OpenAITTSClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAITTSClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should throw error if apiKey is empty', () => {
            expect(() => new OpenAITTSClient('')).toThrow('OpenAI API key is required');
        });

        test('should create client with valid apiKey', () => {
            const client = new OpenAITTSClient('sk-test-key');
            expect(client).toBeInstanceOf(OpenAITTSClient);
        });

        test('should use default voice "alloy" if not provided', () => {
            const client = new OpenAITTSClient('sk-test-key');
            expect((client as any).voice).toBe('alloy');
        });

        test('should use custom voice if provided', () => {
            const client = new OpenAITTSClient('sk-test-key', 'nova');
            expect((client as any).voice).toBe('nova');
        });
    });

    describe('synthesize', () => {
        test('should throw error if text is empty', async () => {
            const client = new OpenAITTSClient('sk-test-key');
            await expect(client.synthesize('')).rejects.toThrow('Text is required for TTS');
        });

        test('should throw error if text is only whitespace', async () => {
            const client = new OpenAITTSClient('sk-test-key');
            await expect(client.synthesize('   ')).rejects.toThrow('Text is required for TTS');
        });

        test('should return base64 audio URL on success', async () => {
            const client = new OpenAITTSClient('sk-test-key');
            const mockAudioBuffer = Buffer.from('fake-audio-data');

            mockedAxios.post.mockResolvedValueOnce({
                data: mockAudioBuffer
            });

            const result = await client.synthesize('Hello world');

            expect(result.audioUrl).toContain('data:audio/mp3;base64,');
            expect(result.durationSeconds).toBeGreaterThan(0);
        });

        test('should use custom format if provided', async () => {
            const client = new OpenAITTSClient('sk-test-key');
            const mockAudioBuffer = Buffer.from('fake-audio-data');

            mockedAxios.post.mockResolvedValueOnce({
                data: mockAudioBuffer
            });

            const result = await client.synthesize('Hello world', { format: 'wav' });

            expect(result.audioUrl).toContain('data:audio/wav;base64,');
        });

        test('should pass speed option to API', async () => {
            const client = new OpenAITTSClient('sk-test-key');
            const mockAudioBuffer = Buffer.from('fake-audio-data');

            mockedAxios.post.mockResolvedValueOnce({
                data: mockAudioBuffer
            });

            await client.synthesize('Hello world', { speed: 1.2 });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://api.openai.com/v1/audio/speech',
                expect.objectContaining({
                    speed: 1.2
                }),
                expect.any(Object)
            );
        });

        test('should estimate duration based on word count', async () => {
            const client = new OpenAITTSClient('sk-test-key');
            const mockAudioBuffer = Buffer.from('fake-audio-data');

            mockedAxios.post.mockResolvedValueOnce({
                data: mockAudioBuffer
            });

            // 10 words at ~2.5 WPS (150 WPM) = ~4 seconds
            const result = await client.synthesize('One two three four five six seven eight nine ten');

            expect(result.durationSeconds).toBeCloseTo(4, 0);
        });

        test('should adjust duration estimate based on speed', async () => {
            const client = new OpenAITTSClient('sk-test-key');
            const mockAudioBuffer = Buffer.from('fake-audio-data');

            mockedAxios.post.mockResolvedValueOnce({
                data: mockAudioBuffer
            });

            // 10 words at speed 2.0 should halve the duration
            const result = await client.synthesize(
                'One two three four five six seven eight nine ten',
                { speed: 2.0 }
            );

            expect(result.durationSeconds).toBeCloseTo(2, 0);
        });
    });

    describe('error handling', () => {
        test('should throw with OpenAI error message on API failure', async () => {
            const client = new OpenAITTSClient('sk-test-key');

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    data: {
                        error: { message: 'Invalid API key' }
                    }
                }
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(client.synthesize('Test text'))
                .rejects.toThrow('OpenAI TTS fallback failed: Invalid API key');
        });

        test('should throw with generic error message if no specific error', async () => {
            const client = new OpenAITTSClient('sk-test-key');

            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                message: 'Network error'
            });

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

            await expect(client.synthesize('Test text'))
                .rejects.toThrow('OpenAI TTS fallback failed: Network error');
        });

        test('should rethrow non-axios errors', async () => {
            const client = new OpenAITTSClient('sk-test-key');

            mockedAxios.post.mockRejectedValueOnce(new Error('Unknown error'));

            (axios.isAxiosError as unknown as jest.Mock) = jest.fn().mockReturnValue(false);

            await expect(client.synthesize('Test text'))
                .rejects.toThrow('Unknown error');
        });
    });
});
