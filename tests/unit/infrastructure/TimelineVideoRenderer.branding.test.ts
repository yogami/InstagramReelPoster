import { TimelineVideoRenderer } from '../../../src/infrastructure/video/TimelineVideoRenderer';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';

describe('TimelineVideoRenderer - QR Dominant Branding', () => {
    const renderer = new TimelineVideoRenderer('test-key', 'https://api.timeline.io/v1');

    it('should create branding track with QR-dominant layout', () => {
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
                logoUrl: 'https://example.com/logo.png',
                businessName: 'Test Business',
                address: '123 Test St, Berlin',
                phone: '+1234567890',
                qrCodeUrl: 'https://reserve.example.com'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);

        expect(brandingTrack).toBeDefined();
        expect(brandingTrack.clips).toHaveLength(1);

        const clip = brandingTrack.clips[0];
        const html = clip.asset.html;
        const css = clip.asset.css;

        // Should have QR-dominant layout structure
        expect(html).toContain('cta-section');
        expect(html).toContain('qr-section');
        expect(html).toContain('bottom-section');

        // Should have CTA text
        expect(html).toContain('SCAN JETZT');

        // CSS should have QR section taking 55% of screen
        expect(css).toContain('.qr-section');
        expect(css).toContain('flex: 0 0 55%');
    });

    it('should show fallback when no QR code provided', () => {
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

        // No qrCodeDataUri passed
        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const html = brandingTrack.clips[0].asset.html;

        // Should show placeholder
        expect(html).toContain('qr-placeholder');
        expect(html).toContain('Link in Bio');
    });

    it('should include QR code image when qrCodeDataUri is provided', () => {
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
                address: '123 Test St',
                qrCodeUrl: 'https://reserve.example.com'
            }
        };

        const qrCodeDataUri = 'data:image/png;base64,QRCodeBase64Data==';
        const brandingTrack = (renderer as any).createBrandingTrack(manifest, undefined, qrCodeDataUri);
        const html = brandingTrack.clips[0].asset.html;

        // Should contain QR code image
        expect(html).toContain('<img');
        expect(html).toContain('qr-code');
        expect(html).toContain('QRCodeBase64Data');
        expect(html).not.toContain('qr-placeholder');
    });

    it('should position logo in bottom-right corner', () => {
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
                address: '123 Test St'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const html = brandingTrack.clips[0].asset.html;
        const css = brandingTrack.clips[0].asset.css;

        // Logo should be in logo-corner section with small-logo class
        expect(html).toContain('logo-corner');
        expect(html).toContain('small-logo');
        expect(html).toContain('logo.jpg');

        // CSS should constrain logo size
        expect(css).toContain('.small-logo');
        expect(css).toContain('max-width: 150px');
    });

    it('should include contact details in bottom-left', () => {
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
                businessName: 'Sushi Yana',
                address: 'Flughafenstraße 76, Berlin',
                hours: 'Mo-Fr 11:00-22:00',
                phone: '+49 30 12345678'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const html = brandingTrack.clips[0].asset.html;

        // Contact info should be in contact-info section
        expect(html).toContain('contact-info');
        expect(html).toContain('contact-line');

        // Should include shortened address (first part before comma)
        expect(html).toContain('Flughafenstraße 76');

        // Should include hours (first line)
        expect(html).toContain('Mo-Fr 11:00-22:00');

        // Should include phone
        expect(html).toContain('+49 30 12345678');
    });

    it('should use base64 logo when logoDataUri is provided', () => {
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
                address: '123 Test St'
            }
        };

        const logoDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
        const brandingTrack = (renderer as any).createBrandingTrack(manifest, logoDataUri);
        const html = brandingTrack.clips[0].asset.html;

        // Should use the base64 data URI instead of the URL
        expect(html).toContain('data:image/png;base64,');
        expect(html).not.toContain('logo.jpg');
    });

    it('should show brand text when no logo provided', () => {
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
                businessName: 'Berlin AI Labs Restaurant',
                address: '123 Test St'
            }
        };

        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        const html = brandingTrack.clips[0].asset.html;

        // Should show brand text (truncated to 15 chars)
        expect(html).toContain('brand-text');
        expect(html).toContain('Berlin AI Labs');
    });

    it('should return track even without contact details (for QR display)', () => {
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
                qrCodeUrl: 'https://reserve.example.com'
                // No contact details
            }
        };

        // With QR-dominant design, we always show the end card for QR
        const brandingTrack = (renderer as any).createBrandingTrack(manifest);
        expect(brandingTrack).toBeDefined();
        expect(brandingTrack).not.toBeNull();
    });
});
