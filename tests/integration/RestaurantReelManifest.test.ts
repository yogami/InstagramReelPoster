
import { ReelManifest } from '../../src/domain/entities/ReelManifest';
import { TimelineVideoRenderer } from '../../src/infrastructure/video/TimelineVideoRenderer';

// Mock Config
jest.mock('../../src/config', () => ({
    getConfig: () => ({
        timeline: {
            apiUrl: 'https://api.timeline.com',
            apiKey: 'mock-key',
        }
    })
}));

describe('Restaurant Reel Manifest Verification', () => {
    it('should generate overlay tracks correctly for restaurant pivot', () => {
        console.log('🚀 Verifying Restaurant Manifest Overlay Generation...');

        // 1. Mock Manifest with Restaurant Data
        const manifest: ReelManifest = {
            durationSeconds: 15,
            voiceoverUrl: 'https://mock.com/voice.mp3',
            segments: [
                { index: 0, start: 0, end: 3, imageUrl: 'https://img.com/1.jpg', caption: 'Sold out...' },
                { index: 1, start: 3, end: 12, imageUrl: 'https://img.com/2.jpg', caption: 'Crispy...' },
                { index: 2, start: 12, end: 15, imageUrl: 'https://img.com/3.jpg', caption: 'Book now...' }
            ],
            subtitlesUrl: 'https://mock.com/subs.srt',
            branding: {
                businessName: 'Pasta Punk',
                address: 'Berlin, Kreuzberg'
            },
            overlays: [
                {
                    type: 'rating_badge',
                    content: '4.8⭐',
                    start: 3.5,
                    end: 11.5,
                    position: 'top_right'
                },
                {
                    type: 'qr_code',
                    content: 'https://reservation.com',
                    start: 12,
                    end: 15,
                    position: 'center'
                }
            ]
        };

        // 2. Instantiate Renderer
        const renderer = new TimelineVideoRenderer({} as any, {} as any); // Mocks

        // Access private method
        const timelineEdit = (renderer as any).mapManifestToTimelineEdit(manifest);

        console.log('✅ Timeline Edit Generated');

        // 3. Inspect Tracks
        const tracks = timelineEdit.timeline.tracks;
        expect(tracks.length).toBeGreaterThan(4);

        // Verification Logic
        const overlayTrack = tracks.find((t: any) => t.clips.some((c: any) => c.asset.type === 'html' || (c.asset.src && c.asset.src.includes('qrserver'))));

        expect(overlayTrack).toBeDefined();
        if (overlayTrack) {
            const ratingClip = overlayTrack.clips.find((c: any) => c.asset.type === 'html' && c.asset.html.includes('4.8'));
            const qrClip = overlayTrack.clips.find((c: any) => c.asset.type === 'image' && c.asset.src.includes('qrserver'));

            expect(ratingClip).toBeDefined();
            expect(ratingClip.start).toBe(3.5);

            expect(qrClip).toBeDefined();
            expect(qrClip.start).toBe(12);
        }
    });
});
