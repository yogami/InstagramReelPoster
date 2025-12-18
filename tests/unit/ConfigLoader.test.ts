import { loadConfig, resetConfig } from '../../src/config/index';

describe('ConfigLoader Resilience', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        resetConfig();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should strip double quotes from environment variables', () => {
        process.env.OPENAI_API_KEY = '"sk-test-key-with-quotes"';
        process.env.FISH_AUDIO_API_KEY = 'normal-key';
        process.env.FISH_AUDIO_VOICE_ID = 'voice-1';
        process.env.SHOTSTACK_API_KEY = 'shotstack-1';

        const config = loadConfig();
        expect(config.openaiApiKey).toBe('sk-test-key-with-quotes');
    });

    it('should strip single quotes from environment variables', () => {
        process.env.OPENAI_API_KEY = "'sk-test-key-with-single-quotes'";
        process.env.FISH_AUDIO_API_KEY = 'normal-key';
        process.env.FISH_AUDIO_VOICE_ID = 'voice-1';
        process.env.SHOTSTACK_API_KEY = 'shotstack-1';

        const config = loadConfig();
        expect(config.openaiApiKey).toBe('sk-test-key-with-single-quotes');
    });

    it('should trim whitespace from environment variables', () => {
        process.env.OPENAI_API_KEY = '  sk-test-key-with-spaces  ';
        process.env.FISH_AUDIO_API_KEY = 'normal-key';
        process.env.FISH_AUDIO_VOICE_ID = 'voice-1';
        process.env.SHOTSTACK_API_KEY = 'shotstack-1';

        const config = loadConfig();
        expect(config.openaiApiKey).toBe('sk-test-key-with-spaces');
    });

    it('should handle numeric variables with quotes', () => {
        process.env.PORT = '"4000"';
        process.env.OPENAI_API_KEY = 'key';
        process.env.FISH_AUDIO_API_KEY = 'normal-key';
        process.env.FISH_AUDIO_VOICE_ID = 'voice-1';
        process.env.SHOTSTACK_API_KEY = 'shotstack-1';

        const config = loadConfig();
        expect(config.port).toBe(4000);
    });

    it('should correctly load custom callback headers even with quotes', () => {
        process.env.CALLBACK_HEADER = '"x-custom-api-key"';
        process.env.CALLBACK_TOKEN = '"secret-token"';
        process.env.OPENAI_API_KEY = 'key';
        process.env.FISH_AUDIO_API_KEY = 'normal-key';
        process.env.FISH_AUDIO_VOICE_ID = 'voice-1';
        process.env.SHOTSTACK_API_KEY = 'shotstack-1';

        const config = loadConfig();
        expect(config.callbackHeader).toBe('x-custom-api-key');
        expect(config.callbackToken).toBe('secret-token');
    });
});
