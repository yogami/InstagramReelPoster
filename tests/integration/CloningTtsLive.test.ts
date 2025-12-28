
import dotenv from 'dotenv';
import path from 'path';
import { CloningTtsClient } from '../../src/infrastructure/tts/CloningTtsClient';

// Load env vars from the root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('Voice Cloning Live Integration', () => {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = process.env.FISH_AUDIO_VOICE_ID;

    // Only run if credentials exist
    if (!apiKey || !voiceId) {
        console.warn('Skipping Voice Cloning integration test: Missing FISH_AUDIO_API_KEY or FISH_AUDIO_VOICE_ID in .env');
        test.skip('Skipped due to missing credentials', () => { });
        return;
    }

    console.log(`[Integration] Initializing Voice Cloning Client with Voice ID: ${voiceId}`);
    const client = new CloningTtsClient(apiKey, voiceId);

    test('Should successfully synthesize audio from Voice Cloning API', async () => {
        const text = "This is a verification test for the Voice Cloning integration.";

        console.log('[Integration] Sending synthesis request...');
        const result = await client.synthesize(text, { speed: 1.0 });

        console.log('[Integration] Received response.');

        // Assertions
        expect(result).toBeDefined();
        expect(result.audioUrl).toBeDefined();
        expect(typeof result.audioUrl).toBe('string');
        expect(result.audioUrl.length).toBeGreaterThan(100); // Should be a substantial string (URL or Base64)

        // Log result type for debugging
        if (result.audioUrl.startsWith('data:')) {
            console.log('[Integration] Success: Received Base64 Audio Data');
        } else {
            console.log(`[Integration] Success: Received Audio URL: ${result.audioUrl}`);
        }

        if (result.durationSeconds) {
            console.log(`[Integration] Estimated/Actual Duration: ${result.durationSeconds.toFixed(2)}s`);
            expect(result.durationSeconds).toBeGreaterThan(0);
        }
    }, 30000); // 30 second timeout
});
