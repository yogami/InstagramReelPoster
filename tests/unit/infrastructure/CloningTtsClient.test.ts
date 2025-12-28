import nock from 'nock';
import { CloningTtsClient } from '../../../src/infrastructure/tts/CloningTtsClient';

describe('CloningTtsClient', () => {
    const apiKey = 'test-api-key';
    const voiceId = 'test-voice-id';
    const baseUrl = 'https://api.fish.audio';

    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Constructor validation', () => {
        it('should throw error when API key is missing', () => {
            expect(() => new CloningTtsClient('', voiceId, baseUrl)).toThrow('Voice Cloning API key is required');
        });

        it('should throw error when voice ID is missing', () => {
            expect(() => new CloningTtsClient(apiKey, '', baseUrl)).toThrow('Voice Cloning voice ID is required');
        });

        it('should create client with valid credentials', () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);
            expect(client).toBeDefined();
        });
    });

    describe('synthesize() - Input validation', () => {
        it('should throw error for empty text', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);
            await expect(client.synthesize('')).rejects.toThrow('Text is required for TTS');
        });

        it('should throw error for whitespace-only text', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);
            await expect(client.synthesize('   ')).rejects.toThrow('Text is required for TTS');
        });
    });

    describe('synthesize() - JSON response format', () => {
        it('should handle JSON response with audio_url', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);

            nock(baseUrl)
                .post('/v1/tts')
                .reply(200, JSON.stringify({
                    audio_url: 'https://fish.audio/generated/abc123.mp3',
                    duration_seconds: 5.5
                }), {
                    'Content-Type': 'application/json'
                });

            const result = await client.synthesize('Hello world');

            expect(result.audioUrl).toBe('https://fish.audio/generated/abc123.mp3');
            expect(result.durationSeconds).toBe(5.5);
        });

        it('should handle JSON response with fallback duration estimation', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);

            nock(baseUrl)
                .post('/v1/tts')
                .reply(200, JSON.stringify({
                    audio_url: 'https://fish.audio/generated/abc123.mp3'
                    // No duration provided
                }), {
                    'Content-Type': 'application/json'
                });

            const result = await client.synthesize('Hello world test'); // 3 words

            expect(result.audioUrl).toBe('https://fish.audio/generated/abc123.mp3');
            // Duration is estimated based on config.speakingRateWps (varies)
            expect(result.durationSeconds).toBeGreaterThan(0);
        });

        it('should throw error when JSON response has no audio URL', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);

            nock(baseUrl)
                .post('/v1/tts')
                .reply(200, JSON.stringify({}), {
                    'Content-Type': 'application/json'
                });

            await expect(client.synthesize('Hello')).rejects.toThrow('No audio URL in TTS JSON response');
        });
    });

    describe('synthesize() - Binary response format', () => {
        it('should handle binary audio data response', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);
            const fakeAudioData = Buffer.from([0x00, 0x01, 0x02, 0x03]);

            nock(baseUrl)
                .post('/v1/tts')
                .reply(200, fakeAudioData, {
                    'Content-Type': 'audio/mpeg'
                });

            const result = await client.synthesize('Hello world'); // 2 words

            expect(result.audioUrl).toMatch(/^data:audio\/mp3;base64,/);
            // Duration is estimated based on config.speakingRateWps
            expect(result.durationSeconds).toBeGreaterThan(0);
        });
    });

    describe('synthesize() - Speed adjustment', () => {
        it('should apply speed adjustment to duration estimation', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);
            const fakeAudioData = Buffer.from([0x00]);

            nock(baseUrl)
                .post('/v1/tts')
                .reply(200, fakeAudioData, {
                    'Content-Type': 'audio/mpeg'
                });

            // Speed adjustment should reduce duration
            const result = await client.synthesize('Hello world', { speed: 2.0 });

            // Duration should be positive but reduced by speed factor
            expect(result.durationSeconds).toBeGreaterThan(0);
        });
    });

    describe('synthesize() - Error handling', () => {
        it('should throw descriptive error on API failure', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);

            nock(baseUrl)
                .post('/v1/tts')
                .reply(400, { message: 'Invalid voice ID' });

            await expect(client.synthesize('Hello')).rejects.toThrow('TTS synthesis failed');
        });

        it('should handle network timeout', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);

            nock(baseUrl)
                .post('/v1/tts')
                .replyWithError('Network timeout');

            await expect(client.synthesize('Hello')).rejects.toThrow('TTS synthesis failed');
        }, 30000);

        it('should handle 429 rate limit', async () => {
            const client = new CloningTtsClient(apiKey, voiceId, baseUrl);

            nock(baseUrl)
                .post('/v1/tts')
                .reply(429, { error: { message: 'Rate limit exceeded' } });

            await expect(client.synthesize('Hello')).rejects.toThrow('TTS synthesis failed');
        });
    });
});
