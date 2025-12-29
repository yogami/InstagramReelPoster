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

        // Logo should NOT have fixed width/height that causes distortion
        // Should use max-width/max-height with object-fit: contain
        expect(css).toContain('object-fit: contain');
        expect(css).not.toContain('width: 150px');
        expect(css).not.toContain('height: 150px');
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

        // Should be at bottom
        expect(clip.position).toBe('bottom');

        // Should have appropriate offset from bottom
        expect(clip.offset?.y).toBeGreaterThan(0);
    });
});
