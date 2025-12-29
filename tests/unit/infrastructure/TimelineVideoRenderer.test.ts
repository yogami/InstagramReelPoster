import nock from 'nock';
import { TimelineVideoRenderer } from '../../../src/infrastructure/video/TimelineVideoRenderer';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';

describe('TimelineVideoRenderer', () => {
    const apiKey = 'test-api-key';
    const baseUrl = 'https://api.shotstack.io/stage';

    const createTestManifest = (): ReelManifest => ({
        durationSeconds: 15,
        segments: [
            { index: 0, start: 0, end: 5, imageUrl: 'https://example.com/img1.jpg' },
            { index: 1, start: 5, end: 10, imageUrl: 'https://example.com/img2.jpg' },
            { index: 2, start: 10, end: 15, imageUrl: 'https://example.com/img3.jpg' },
        ],
        voiceoverUrl: 'https://example.com/voiceover.mp3',
        musicUrl: 'https://example.com/music.mp3',
        musicDurationSeconds: 30,
        subtitlesUrl: 'https://example.com/subtitles.srt',
    });

    beforeEach(() => {
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Constructor validation', () => {
        it('should throw error when API key is missing', () => {
            expect(() => new TimelineVideoRenderer('')).toThrow('Timeline API key is required');
        });

        it('should create renderer with valid API key', () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl);
            expect(renderer).toBeDefined();
        });
    });

    describe('render() - Happy Path', () => {
        it('should submit render and poll until completion', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest = createTestManifest();

            // Mock: Submit render
            nock(baseUrl)
                .post('/render')
                .reply(200, { response: { id: 'render-123' } });

            // Mock: Poll - first queued, then done
            nock(baseUrl)
                .get('/render/render-123')
                .reply(200, { response: { status: 'queued' } });

            nock(baseUrl)
                .get('/render/render-123')
                .reply(200, { response: { status: 'rendering' } });

            nock(baseUrl)
                .get('/render/render-123')
                .reply(200, { response: { status: 'done', url: 'https://cdn.shotstack.io/final.mp4' } });

            const result = await renderer.render(manifest);

            expect(result.videoUrl).toBe('https://cdn.shotstack.io/final.mp4');
            expect(result.renderId).toBe('render-123');
        });
    });

    describe('render() - Error Handling', () => {
        it('should throw descriptive error when render fails to start', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest = createTestManifest();

            nock(baseUrl)
                .post('/render')
                .reply(400, { message: 'Invalid payload' });

            await expect(renderer.render(manifest)).rejects.toThrow('Timeline render failed to start: Invalid payload');
        });

        it('should throw error when render status is failed', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest = createTestManifest();

            nock(baseUrl)
                .post('/render')
                .reply(200, { response: { id: 'render-fail' } });

            nock(baseUrl)
                .get('/render/render-fail')
                .reply(200, { response: { status: 'failed', error: 'Invalid asset URL' } });

            await expect(renderer.render(manifest)).rejects.toThrow('Timeline render failed: Invalid asset URL');
        });

        it('should timeout after max poll attempts', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 10, 3); // 3 attempts at 10ms
            const manifest = createTestManifest();

            nock(baseUrl)
                .post('/render')
                .reply(200, { response: { id: 'render-timeout' } });

            nock(baseUrl)
                .get('/render/render-timeout')
                .times(5)
                .reply(200, { response: { status: 'queued' } });

            await expect(renderer.render(manifest)).rejects.toThrow(/timed out/);
        });

        it('should throw when no render ID returned', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest = createTestManifest();

            nock(baseUrl)
                .post('/render')
                .reply(200, { response: {} });

            await expect(renderer.render(manifest)).rejects.toThrow('No render ID returned from Timeline');
        });

        it('should throw when completed response has no video URL', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest = createTestManifest();

            nock(baseUrl)
                .post('/render')
                .reply(200, { response: { id: 'render-no-url' } });

            nock(baseUrl)
                .get('/render/render-no-url')
                .reply(200, { response: { status: 'done' } }); // Missing URL

            await expect(renderer.render(manifest)).rejects.toThrow('No video URL in completed response');
        });
    });

    describe('Timeline construction', () => {
        it('should create correct number of image clips', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest = createTestManifest();

            let capturedPayload: any;
            nock(baseUrl)
                .post('/render', (body) => {
                    capturedPayload = body;
                    return true;
                })
                .reply(200, { response: { id: 'render-123' } });

            nock(baseUrl)
                .get('/render/render-123')
                .reply(200, { response: { status: 'done', url: 'https://cdn.shotstack.io/final.mp4' } });

            await renderer.render(manifest);

            // Track 1 (index 0) is images/visuals
            const imageTrack = capturedPayload.timeline.tracks[0];
            expect(imageTrack.clips).toHaveLength(3);
            expect(imageTrack.clips[0].asset.src).toBe('https://example.com/img1.jpg');
        });

        it('should set correct aspect ratio for reels', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest = createTestManifest();

            let capturedPayload: any;
            nock(baseUrl)
                .post('/render', (body) => {
                    capturedPayload = body;
                    return true;
                })
                .reply(200, { response: { id: 'render-123' } });

            nock(baseUrl)
                .get('/render/render-123')
                .reply(200, { response: { status: 'done', url: 'https://test.com/video.mp4' } });

            await renderer.render(manifest);

            expect(capturedPayload.output.aspectRatio).toBe('9:16');
            expect(capturedPayload.output.resolution).toBe('1080');
        });

        it('should loop music when shorter than video duration', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest: ReelManifest = {
                ...createTestManifest(),
                durationSeconds: 45,
                musicDurationSeconds: 20,
            };

            let capturedPayload: any;
            nock(baseUrl)
                .post('/render', (body) => {
                    capturedPayload = body;
                    return true;
                })
                .reply(200, { response: { id: 'render-loop' } });

            nock(baseUrl)
                .get('/render/render-loop')
                .reply(200, { response: { status: 'done', url: 'https://test.com/video.mp4' } });

            await renderer.render(manifest);

            // Track 2 (index 1) is music
            const musicTrack = capturedPayload.timeline.tracks[1];
            expect(musicTrack.clips.length).toBe(3); // 45s / 20s = 3 clips needed
        });

        it('should include logo track when logoUrl is provided', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest: ReelManifest = {
                ...createTestManifest(),
                logoUrl: 'https://example.com/logo.png',
                logoPosition: 'end',
            };

            let capturedPayload: any;
            nock(baseUrl)
                .post('/render', (body) => {
                    capturedPayload = body;
                    return true;
                })
                .reply(200, { response: { id: 'render-logo' } });

            nock(baseUrl)
                .get('/render/render-logo')
                .reply(200, { response: { status: 'done', url: 'https://test.com/video.mp4' } });

            await renderer.render(manifest);

            // 0: Visuals, 1: Music, 2: Voiceover, 3: Logo
            const logoTrack = capturedPayload.timeline.tracks[3];
            expect(logoTrack.clips[0].asset.src).toBe('https://example.com/logo.png');
            expect(logoTrack.clips[0].position).toBe('topRight');
            expect(logoTrack.clips[0].start).toBe(10); // 15s duration - 5s
            expect(logoTrack.clips[0].length).toBe(5);
        });
        it('should include branding overlay when branding info is provided', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 100, 5);
            const manifest: ReelManifest = {
                ...createTestManifest(),
                branding: {
                    businessName: 'My Cafe',
                    address: 'Berlin Str 1',
                    hours: '9-5',
                    phone: '123456',
                    logoUrl: '',
                    email: ''
                },
            };

            let capturedPayload: any;
            nock(baseUrl)
                .post('/render', (body) => {
                    capturedPayload = body;
                    return true;
                })
                .reply(200, { response: { id: 'render-branding' } });

            nock(baseUrl)
                .get('/render/render-branding')
                .reply(200, { response: { status: 'done', url: 'https://test.com/video.mp4' } });

            await renderer.render(manifest);

            // Branding is now the LAST clip in Track 1 (visuals), not a separate track
            const visualTrack = capturedPayload.timeline.tracks[0];
            const brandingClip = visualTrack.clips.find((c: any) => c.asset.type === 'html');

            expect(brandingClip).toBeDefined();
            expect(brandingClip.asset.type).toBe('html');
            expect(brandingClip.asset.html).toContain('My Cafe'); // Business name shows when no logo
            expect(brandingClip.asset.html).toContain('Berlin Str 1');
            expect(brandingClip.asset.html).toContain('9-5');
            // Branding starts 1.5s into last segment (10 + 1.5 = 11.5)
            expect(brandingClip.start).toBeCloseTo(11.5, 1);
            // Branding last until end (15 - 11.5 = 3.5s)
            expect(brandingClip.length).toBeCloseTo(3.5, 1);
        });
    });

    describe('Rate limiting and retries', () => {
        it('should handle 404 during polling gracefully', async () => {
            const renderer = new TimelineVideoRenderer(apiKey, baseUrl, 10, 5);
            const manifest = createTestManifest();

            nock(baseUrl)
                .post('/render')
                .reply(200, { response: { id: 'render-404' } });

            // First poll returns 404 (job not ready yet)
            nock(baseUrl)
                .get('/render/render-404')
                .reply(404);

            // Second poll succeeds
            nock(baseUrl)
                .get('/render/render-404')
                .reply(200, { response: { status: 'done', url: 'https://test.com/video.mp4' } });

            const result = await renderer.render(manifest);
            expect(result.videoUrl).toBe('https://test.com/video.mp4');
        });
    });
});
