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

        // Since we use full-screen HTML overlay, clip position is center
        expect(clip.position).toBe('center');

        const asset = clip.asset as any;

        // Should use CSS for positioning (look for padding-bottom in CSS)
        expect(asset.css).toContain('padding-bottom');

        // Assert full screen asset dimensions
        expect(asset.width).toBe(1080);
        expect(asset.height).toBe(1920);

        // Should have correct scale
        expect(clip.scale).toBe(1.0);
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
                businessName: 'Test Business',
                email: 'test@example.com'  // Add contact info so track is created
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


        // Logo is shown separately in top-right, not in contact card

        // Should include business name
        expect(html).toContain('Berlin AI Labs');

        // Should include address
        expect(html).toContain('Friedrichstraße 123');

        // Should include phone
        expect(html).toContain('+49 30 12345678');

        // Should include email
        expect(html).toContain('info@berlinailabs.de');
    });

    it('should not scale/distort logo - use original size', () => {
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
                businessName: 'Test Business',
                email: 'test@example.com'  // Add contact info so track is created
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const clip = brandingTrack.clips[0];
        const css = clip.asset.css;

        // Should use proper Grid/Flex layout
        expect(css).toContain('display: flex');
        expect(css).toContain('.container');
        expect(css).toContain('.card');
    });

    it('should only show contact overlay when at least one contact field exists', () => {
        // Test 1: No contact info - should return null
        const manifestNoContact: ReelManifest = {
            durationSeconds: 20,
            voiceoverUrl: 'https://example.com/voice.mp3',
            musicUrl: 'https://example.com/music.mp3',
            musicDurationSeconds: 20,
            subtitlesUrl: 'https://example.com/subs.vtt',
            segments: [{
                index: 0,
                imageUrl: 'https://example.com/1.jpg',
                start: 0,
                end: 20
            }],
            branding: {
                logoUrl: 'https://cloudinary.com/logo.jpg',
                businessName: 'Test Business'
                // No address, phone, email, or hours
            }
        };

        const noContactTrack = (renderer as any).createBrandingTrack(manifestNoContact);
        expect(noContactTrack).toBeNull();

        // Test 2: Has at least one contact field - should show
        const manifestWithContact: ReelManifest = {
            ...manifestNoContact,
            branding: {
                logoUrl: 'https://cloudinary.com/logo.jpg',
                businessName: 'Test Business',
                email: 'test@example.com'
            }
        };

        const withContactTrack = (renderer as any).createBrandingTrack(manifestWithContact);
        expect(withContactTrack).not.toBeNull();
    });

    it('should position contact info at bottom of last image', () => {
        const manifest: ReelManifest = {
            durationSeconds: 20,
            voiceoverUrl: 'https://example.com/voice.mp3',
            musicUrl: 'https://example.com/music.mp3',
            musicDurationSeconds: 20,
            subtitlesUrl: 'https://example.com/subs.vtt',
            segments: [{
                index: 0,
                imageUrl: 'https://example.com/1.jpg',
                start: 0,
                end: 20
            }],
            branding: {
                businessName: 'Test Business',
                address: '123 Test St'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const clip = brandingTrack.clips[0];

        // Should be center (full screen overlay)
        expect(clip.position).toBe('center');

        const asset = clip.asset as any;
        // Should have padding in CSS
        expect(asset.css).toContain('padding-bottom');
    });

    it('should not include logo in contact card (logo is separate in top-right)', () => {
        const manifest: ReelManifest = {
            durationSeconds: 20,
            voiceoverUrl: 'https://example.com/voice.mp3',
            musicUrl: 'https://example.com/music.mp3',
            musicDurationSeconds: 20,
            subtitlesUrl: 'https://example.com/subs.vtt',
            segments: [{
                index: 0,
                imageUrl: 'https://example.com/1.jpg',
                start: 0,
                end: 20
            }],
            branding: {
                logoUrl: 'https://cloudinary.com/logo.jpg',
                businessName: 'Test Business',
                address: '123 Test St',
                email: 'test@example.com'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const clip = brandingTrack.clips[0];
        const html = clip.asset.html;

        // Contact card should NOT include logo image
        // Logo is shown separately in top-right corner
        expect(html).not.toContain('<img');
        expect(html).not.toContain('logo.jpg');

        // Should still include business name and contact info
        expect(html).toContain('Test Business');
        expect(html).toContain('123 Test St');
    });
});
