import { TimelineVideoRenderer } from '../../../src/infrastructure/video/TimelineVideoRenderer';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';

describe('TimelineVideoRenderer - Branding Overlay', () => {
    const renderer = new TimelineVideoRenderer('test-key', 'https://api.timeline.io/v1');

    it('should position branding card for entire duration of last segment', () => {
        const manifest: ReelManifest = {
            durationSeconds: 20,
            voiceoverUrl: 'https://example.com/voice.mp3',
            musicUrl: 'https://example.com/music.mp3',
            musicDurationSeconds: 20,
            subtitlesUrl: 'https://example.com/subs.vtt',
            segments: [
                {
                    index: 0,
                    caption: 'First',
                    imageUrl: 'https://example.com/1.jpg',
                    start: 0,
                    end: 10
                },
                {
                    index: 1,
                    caption: 'Last',
                    imageUrl: 'https://example.com/2.jpg',
                    start: 10,
                    end: 20
                }
            ],
            branding: {
                logoUrl: 'https://example.com/logo.png',
                businessName: 'Test Business',
                address: '123 Test St',
                phone: '+1234567890',
                email: 'test@example.com'
            }
        };

        // Access private method via type assertion
        const brandingTrack = (renderer as any).createBrandingTrack(manifest);

        expect(brandingTrack).toBeDefined();
        expect(brandingTrack.clips).toHaveLength(1);

        const clip = brandingTrack.clips[0];

        // Should start at the beginning of last segment
        expect(clip.start).toBe(10);

        // Should last for the entire duration of last segment
        expect(clip.length).toBe(10);

        // Should be positioned at bottom
        expect(clip.position).toBe('bottom');

        // Should have offset from bottom
        expect(clip.offset?.y).toBe(0.15);

        // Should have correct scale
        expect(clip.scale).toBe(0.85);
    });

    it('should fallback to last 5 seconds when no segments', () => {
        const manifest: ReelManifest = {
            durationSeconds: 20,
            voiceoverUrl: 'https://example.com/voice.mp3',
            musicUrl: 'https://example.com/music.mp3',
            musicDurationSeconds: 20,
            subtitlesUrl: 'https://example.com/subs.vtt',
            segments: [],
            branding: {
                logoUrl: 'https://example.com/logo.png',
                businessName: 'Test Business'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);

        expect(brandingTrack).toBeDefined();
        const clip = brandingTrack.clips[0];

        // Should start 5 seconds before end
        expect(clip.start).toBe(15);

        // Should last 5 seconds
        expect(clip.length).toBe(5);
    });

    it('should include logo, business name, and contact details in HTML', () => {
        const manifest: ReelManifest = {
            durationSeconds: 20,
            voiceoverUrl: 'https://example.com/voice.mp3',
            musicUrl: 'https://example.com/music.mp3',
            musicDurationSeconds: 20,
            subtitlesUrl: 'https://example.com/subs.vtt',
            segments: [{
                index: 0,
                caption: 'Test',
                imageUrl: 'https://example.com/1.jpg',
                start: 0,
                end: 20
            }],
            branding: {
                logoUrl: 'https://cloudinary.com/logo.jpg',
                businessName: 'Berlin AI Labs',
                address: 'Friedrichstraße 123, 10117 Berlin',
                phone: '+49 30 12345678',
                email: 'info@berlinailabs.de'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const clip = brandingTrack.clips[0];
        const html = clip.asset.html;

        // Should include logo
        expect(html).toContain('https://cloudinary.com/logo.jpg');

        // Should include business name
        expect(html).toContain('Berlin AI Labs');

        // Should include address
        expect(html).toContain('Friedrichstraße 123');

        // Should include phone
        expect(html).toContain('+49 30 12345678');

        // Should include email
        expect(html).toContain('info@berlinailabs.de');
    });
});
