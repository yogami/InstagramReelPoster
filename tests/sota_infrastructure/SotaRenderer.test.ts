import { TimelineVideoRenderer } from '../../src/infrastructure/video/TimelineVideoRenderer';
import { ReelManifest } from '../../src/domain/entities/ReelManifest';

describe('SOTA Renderer Verification', () => {
    let renderer: TimelineVideoRenderer;

    beforeEach(() => {
        renderer = new TimelineVideoRenderer('test-key', 'https://api.timeline.com');
    });

    // TEST 1: Verify Visual Styles map to Correct Zoom/Pan Effects
    test('should map SOTA visual styles to correct Timeline effects', async () => {
        const manifest: ReelManifest = {
            durationSeconds: 10,
            voiceoverUrl: 'http://voice.mp3',
            subtitlesUrl: 'http://subs.srt',
            segments: [
                {
                    index: 0,
                    start: 0,
                    end: 3,
                    imageUrl: 'img1.png',
                    visualStyle: 'zoom_screenshot' // SOTA Style
                },
                {
                    index: 1,
                    start: 3,
                    end: 6,
                    imageUrl: 'img2.png',
                    visualStyle: 'scroll_capture' // SOTA Style
                },
                {
                    index: 2,
                    start: 6,
                    end: 10,
                    imageUrl: 'img3.png',
                    visualStyle: 'logo_button' // SOTA Style
                }
            ]
        };

        const payload = await renderer.createTimelinePayload(manifest);
        const visualTrack = payload.timeline.tracks[0]; // Track 0 is visuals

        // Check Beat 1: Zoom Screenshot -> zoomIn
        expect(visualTrack.clips[0].effect).toBe('zoomIn');

        // Check Beat 2: Scroll Capture -> slideLeft (Mapped fallback)
        expect(visualTrack.clips[1].effect).toBe('slideLeft'); // slideUp was invalid

        // Check Beat 3: Logo Button -> zoomOut (Focus pull)
        expect(visualTrack.clips[2].effect).toBe('zoomOut');
    });

    // TEST 2: Verify High-Impact Text Overlays for Kinetic Text
    // Note: Kinetic Text isn't just a zoom, it usually implies overlay text
    test('should generate overlays for captioned segments', async () => {
        const manifest: ReelManifest = {
            durationSeconds: 5,
            voiceoverUrl: 'http://voice.mp3',
            subtitlesUrl: 'http://subs.srt',
            segments: [
                {
                    index: 0,
                    start: 0,
                    end: 5,
                    imageUrl: 'img1.png',
                    caption: 'BIG TEXT', // Trigger for kinetic overlay
                    visualStyle: 'kinetic_text'
                }
            ]
        };

        const payload = await renderer.createTimelinePayload(manifest);

        // Find the overlay track (it uses 'html' type assets)
        const overlayTrack = payload.timeline.tracks.find((t: any) =>
            t.clips.some((c: any) => c.asset.type === 'html' && c.asset.html.includes('BIG TEXT'))
        );

        expect(overlayTrack).toBeDefined();
        // Use any to bypass TS checks for 'html' property which might not be on generic asset type
        expect((overlayTrack?.clips[0].asset as any).html).toContain('BIG TEXT');
        expect((overlayTrack?.clips[0].asset as any).css).toContain('font-weight: 900'); // CSS is separate from html
    });
});
