
import dotenv from 'dotenv';
import path from 'path';
import { ShortstackVideoRenderer } from '../../src/infrastructure/video/ShortstackVideoRenderer';
import { ReelManifest } from '../../src/domain/entities/ReelManifest';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('Shotstack Payload Validation (Live)', () => {
    const apiKey = process.env.SHOTSTACK_API_KEY;
    const baseUrl = process.env.SHOTSTACK_BASE_URL;

    if (!apiKey) {
        console.warn('Skipping Shotstack validation: No API Key');
        test.skip('No Credentials', () => { });
        return;
    }

    const renderer = new ShortstackVideoRenderer(apiKey, baseUrl, 1000, 5); // Fast poll

    test('Should successfully SUBMIT a render job (Payload Validity Check)', async () => {
        // Create a minimal valid manifest
        // Using sample assets that likely resolve or doesn't matter for schema check
        const manifest: ReelManifest = {
            segments: [{
                index: 1,
                start: 0,
                end: 3,
                imageUrl: 'https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/images/branding/logo.png',
            }],
            voiceoverUrl: 'https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/music/disco.mp3', // Valid audio
            subtitlesUrl: 'https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/captions/subtitles.srt', // Valid SRT? Or close enough
            durationSeconds: 3
        };

        try {
            console.log('[Test] Submitting render to Shotstack...');
            await renderer.render(manifest);
            console.log('[Test] Render completed successfully!');
        } catch (error: any) {
            console.log('[Test] Error Details:', error.message);

            // CRITICAL CHECK:
            // If the error is "Bad Request" (400), it means our JSON payload structure is WRONG.
            // This is what the user reported, and what we must prevent.
            if (error.message.includes('Bad Request') || error.message.includes('400')) {
                throw new Error(`PAYLOAD REJECTED: ${error.message}`);
            }

            // If the error is "Shotstack render failed: ...", it means the payload WAS accepted, 
            // but the render engine failed (e.g. download error). This is ACCEPTABLE for this test.
            if (error.message.includes('Shotstack render failed')) {
                console.log('✅ PASS: Payload was accepted (Render failed later, likely due to asset issues, but schema is valid)');
                return;
            }

            // If the error is timeout, it means payload accepted and is processing. PASS.
            if (error.message.includes('timed out')) {
                console.log('✅ PASS: Payload accepted (Timed out waiting for completion)');
                return;
            }

            throw error;
        }
    }, 60000);
});
