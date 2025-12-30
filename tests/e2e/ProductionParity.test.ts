import 'dotenv/config';
import { FluxImageClient } from '../../src/infrastructure/images/FluxImageClient';
import { RemoteVideoRenderer } from '../../src/infrastructure/video/RemoteVideoRenderer';
import { TimelineVideoRenderer } from '../../src/infrastructure/video/TimelineVideoRenderer';
import { FFmpegVideoRenderer } from '../../src/infrastructure/video/FFmpegVideoRenderer';
import { IVideoRenderer } from '../../src/domain/ports/IVideoRenderer';
import { MediaStorageClient } from '../../src/infrastructure/storage/MediaStorageClient';
import { ReelManifest } from '../../src/domain/entities/ReelManifest';
import { getConfig } from '../../src/config';

/**
 * PRODUCTION PARITY E2E TEST
 * 
 * This test simulates the Railway production environment locally by using:
 * 1. REAL Beam.cloud Flux V10 endpoint.
 * 2. REAL Video Renderer (Shotstack OR Railway Local FFmpeg).
 * 3. REAL Cloudinary storage.
 * 
 * Purpose: 100% Guarantee that what works here will work on Railway.
 */
describe('Production Parity - Live System Verification', () => {
    // Only run if specifically enabled to avoid costs
    const shouldRun = process.env.RUN_LIVE_PARITY === 'true';

    (shouldRun ? describe : describe.skip)('Real System (Flux + Renderer) integration', () => {
        let config: any;
        let storageClient: MediaStorageClient;
        let fluxClient: FluxImageClient;
        let videoRenderer: IVideoRenderer;

        beforeAll(() => {
            config = getConfig();

            // Validate env parity
            expect(config.fluxApiKey).toBeDefined();
            expect(config.cloudinaryCloudName).toBeDefined();

            storageClient = new MediaStorageClient(
                config.cloudinaryCloudName,
                config.cloudinaryApiKey,
                config.cloudinaryApiSecret
            );

            fluxClient = new FluxImageClient(config.fluxApiKey, config.fluxEndpointUrl);

            // Select Renderer based on Config
            if (config.videoRenderer === 'shotstack') {
                console.log('[Parity] Using Shotstack Renderer');
                expect(config.timelineApiKey).toBeDefined();
                videoRenderer = new TimelineVideoRenderer(config.timelineApiKey, config.timelineBaseUrl);
            } else if (config.videoRenderer === 'ffmpeg') {
                console.log('[Parity] Using Local Railway FFmpeg Renderer');
                videoRenderer = new FFmpegVideoRenderer(storageClient);
            } else {
                console.log('[Parity] Using Remote Beam FFmpeg Renderer');
                expect(config.remoteRenderEndpointUrl).toContain('beam.cloud');
                videoRenderer = new RemoteVideoRenderer(config.fluxApiKey, config.remoteRenderEndpointUrl);
            }
        });

        it('should generate a REAL image from Flux Beam.cloud', async () => {
            console.log('[Parity] Testing Flux Cloud...');
            const result = await fluxClient.generateImage('A futuristic neon city skyline at night, cyberpunk style, hyper-detailed');

            expect(result.imageUrl).toBeDefined();
            // Should be either a URL or a data: URI
            expect(result.imageUrl.length).toBeGreaterThan(100);
            console.log('[Parity] Flux Cloud OK. Image received.');
        }, 120000);

        it('should render a minimal video using Configured Renderer', async () => {
            console.log('[Parity] Testing Video Renderer...');

            const manifest: ReelManifest = {
                durationSeconds: 1, // Short duration
                // Verified GitHub Raw MP3 (known to work with curl)
                voiceoverUrl: 'https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp3',
                subtitlesUrl: '',
                segments: [
                    {
                        index: 0,
                        start: 0,
                        end: 1,
                        // 1x1 Red PNG
                        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
                    }
                ]
            };

            const result = await videoRenderer.render(manifest);

            expect(result.videoUrl).toBeDefined();
            console.log(`[Parity] Video Renderer OK. Video URL: ${result.videoUrl}`);
        }, 180000);

        it('should handle "turbo:" prefix (if supported) or normal render', async () => {
            console.log('[Parity] Testing Turbo/Hybrid Mode...');

            const manifest: ReelManifest = {
                durationSeconds: 5,
                voiceoverUrl: 'https://www.w3schools.com/html/horse.mp3',
                subtitlesUrl: '',
                animatedVideoUrls: [
                    'turbo:https://res.cloudinary.com/djol0rpn5/image/upload/v1734612999/samples/animals/reindeer.jpg'
                ]
            };

            const result = await videoRenderer.render(manifest);

            expect(result.videoUrl).toBeDefined();
            console.log(`[Parity] Hybrid Render OK. Video URL: ${result.videoUrl}`);
        }, 180000);
    });
});
