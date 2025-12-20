import nock from 'nock';
import { XTTSTTSClient } from '../../../src/infrastructure/tts/XTTSTTSClient';

describe('XTTSTTSClient', () => {
    const serverUrl = 'http://localhost:8020';

    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('constructor', () => {
        it('should throw if server URL is missing', () => {
            expect(() => new XTTSTTSClient('')).toThrow('XTTS server URL is required');
        });

        it('should create client with valid server URL', () => {
            const client = new XTTSTTSClient(serverUrl);
            expect(client).toBeDefined();
        });

        it('should remove trailing slash from server URL', () => {
            const client = new XTTSTTSClient('http://localhost:8020/');
            expect(client).toBeDefined();
        });
    });

    describe('synthesize', () => {
        it('should throw if text is empty', async () => {
            const client = new XTTSTTSClient(serverUrl);
            await expect(client.synthesize('')).rejects.toThrow('Text is required for TTS');
        });

        it('should throw if text is whitespace only', async () => {
            const client = new XTTSTTSClient(serverUrl);
            await expect(client.synthesize('   ')).rejects.toThrow('Text is required for TTS');
        });

        it('should call Coqui TTS format by default', async () => {
            const audioBuffer = Buffer.from('fake audio data');

            nock(serverUrl)
                .post('/api/tts')
                .reply(200, audioBuffer, {
                    'Content-Type': 'audio/wav'
                });

            const client = new XTTSTTSClient(serverUrl);
            const result = await client.synthesize('Hello world');

            expect(result.audioUrl).toContain('data:audio/wav;base64,');
            expect(result.durationSeconds).toBeGreaterThan(0);
        });

        it('should fall back to xtts-api-server format on 404', async () => {
            nock(serverUrl)
                .post('/api/tts')
                .reply(404);

            nock(serverUrl)
                .post('/tts_to_file')
                .reply(200, {
                    output_path: '/tmp/audio.wav',
                    audio_url: 'http://localhost:8020/audio/test.wav'
                });

            const client = new XTTSTTSClient(serverUrl);
            const result = await client.synthesize('Hello world');

            // output_path takes precedence over audio_url in the response
            expect(result.audioUrl).toBe('/tmp/audio.wav');
        });

        it('should throw if xtts-api-server returns no audio URL', async () => {
            nock(serverUrl)
                .post('/api/tts')
                .reply(404);

            nock(serverUrl)
                .post('/tts_to_file')
                .reply(200, {}); // No audio_url or output_path

            const client = new XTTSTTSClient(serverUrl);
            await expect(client.synthesize('Hello')).rejects.toThrow('No audio URL returned from XTTS server');
        });

        it('should throw descriptive error on Coqui API failure', async () => {
            nock(serverUrl)
                .post('/api/tts')
                .reply(500, Buffer.from('Internal Error'), { 'Content-Type': 'text/plain' });

            const client = new XTTSTTSClient(serverUrl);
            await expect(client.synthesize('Hello')).rejects.toThrow('XTTS synthesis failed: Internal Error');
        });

        it('should throw simple error on Coqui API failure with no data', async () => {
            nock(serverUrl)
                .post('/api/tts')
                .reply(500);

            const client = new XTTSTTSClient(serverUrl);
            await expect(client.synthesize('Hello')).rejects.toThrow('XTTS synthesis failed');
        });

        it('should throw generic error on non-axios error', async () => {
            const client = new XTTSTTSClient(serverUrl);
            // Force a non-axios error by mocking the internal estimateDuration to throw
            (client as any).estimateDuration = jest.fn().mockRejectedValue(new Error('Generic error'));

            nock(serverUrl)
                .post('/api/tts')
                .reply(200, Buffer.from('audio'));

            await expect(client.synthesize('Hello')).rejects.toThrow('Generic error');
        });

        it('should estimate duration based on word count', async () => {
            const audioBuffer = Buffer.from('fake audio data');

            nock(serverUrl)
                .post('/api/tts')
                .reply(200, audioBuffer);

            const client = new XTTSTTSClient(serverUrl);
            const result = await client.synthesize('one two three four five six seven eight nine ten');

            // Duration should be positive (uses config.speakingRateWps)
            expect(result.durationSeconds).toBeGreaterThan(0);
        });

        it('should apply speed adjustment to duration estimate', async () => {
            const audioBuffer = Buffer.from('fake audio data');

            nock(serverUrl)
                .post('/api/tts')
                .reply(200, audioBuffer);

            const client = new XTTSTTSClient(serverUrl);
            const result = await client.synthesize('one two three four five six seven eight nine ten', { speed: 2.0 });

            // Duration at 2x speed should be reduced (uses config.speakingRateWps)
            expect(result.durationSeconds).toBeGreaterThan(0);
        });
    });

    describe('healthCheck', () => {
        it('should return true when server is available', async () => {
            nock(serverUrl)
                .get('/')
                .reply(200);

            const client = new XTTSTTSClient(serverUrl);
            const result = await client.healthCheck();

            expect(result).toBe(true);
        });

        it('should return false when server is unavailable', async () => {
            nock(serverUrl)
                .get('/')
                .replyWithError('Connection refused');

            const client = new XTTSTTSClient(serverUrl);
            const result = await client.healthCheck();

            expect(result).toBe(false);
        });
    });
});
