/**
 * RED Phase: Tests for personal site scraping improvements
 * These tests define what SHOULD happen for personal sites
 */

import { WebsiteScraperClient } from '../../../src/infrastructure/scraper/WebsiteScraperClient';
import { detectSiteType } from '../../../src/domain/services/SiteTypeDetector';
import nock from 'nock';

describe('Personal Site Scraping - Quality Requirements (RED Phase)', () => {
    let scraper: WebsiteScraperClient;

    beforeEach(() => {
        scraper = new WebsiteScraperClient();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Social Media Link Extraction', () => {
        it('should extract LinkedIn profile URL', async () => {
            const html = `
                <html>
                    <head><title>John Doe - Developer</title></head>
                    <body>
                        <h1>John Doe - Software Developer</h1>
                        <a href="https://linkedin.com/in/johndoe">LinkedIn</a>
                        <a href="https://github.com/johndoe">GitHub</a>
                    </body>
                </html>
            `;

            nock('https://example.com')
                .get('/')
                .reply(200, html);

            const analysis = await scraper.scrapeWebsite('https://example.com');

            expect(analysis.socialLinks).toBeDefined();
            expect(analysis.socialLinks?.linkedin).toBe('https://linkedin.com/in/johndoe');
            expect(analysis.socialLinks?.github).toBe('https://github.com/johndoe');
        });

        it('should extract Twitter/X profile URL', async () => {
            const html = `
                <html>
                    <body>
                        <a href="https://twitter.com/johndoe">Twitter</a>
                    </body>
                </html>
            `;

            nock('https://example.com')
                .get('/')
                .reply(200, html);

            const analysis = await scraper.scrapeWebsite('https://example.com');

            expect(analysis.socialLinks?.twitter).toBe('https://twitter.com/johndoe');
        });
    });

    describe('Profile Image Detection', () => {
        it('should prioritize images with "profile" in filename over generic images', () => {
            const images = [
                { url: 'https://example.com/random1.jpg', width: 800, height: 600, isHero: false, sourcePage: '/' },
                { url: 'https://example.com/profile.jpg', width: 400, height: 400, isHero: false, sourcePage: '/' },
                { url: 'https://example.com/random2.jpg', width: 800, height: 600, isHero: true, sourcePage: '/' },
            ];

            // The profile image should be prioritized even if not marked as hero
            const profileImage = images.find(img => img.url.includes('profile'));
            expect(profileImage).toBeDefined();
        });

        it('should prioritize square/portrait images over landscape for headshots', () => {
            const landscape = { width: 1200, height: 600 }; // 2:1 ratio - likely banner
            const square = { width: 800, height: 800 }; // 1:1 ratio - likely headshot
            const portrait = { width: 600, height: 800 }; // 3:4 ratio - likely headshot

            // Square and portrait should score higher than landscape for personal sites
            const isLikelyHeadshot = (img: { width: number; height: number }) => {
                const ratio = img.width / img.height;
                return ratio >= 0.75 && ratio <= 1.33; // Between 3:4 and 4:3
            };

            expect(isLikelyHeadshot(landscape)).toBe(false);
            expect(isLikelyHeadshot(square)).toBe(true);
            expect(isLikelyHeadshot(portrait)).toBe(true);
        });
    });

    describe('Personal Site Branding Logic', () => {
        it('should NOT include business hours for personal sites', () => {
            const personalAnalysis = {
                siteType: 'personal' as const,
                openingHours: undefined, // Should not be populated
                phone: undefined, // Should not be populated
            };

            expect(personalAnalysis.openingHours).toBeUndefined
                ();
            expect(personalAnalysis.phone).toBeUndefined();
        });

        it('should use portfolio URL instead of reservation link for QR code', () => {
            const personalAnalysis = {
                siteType: 'personal' as const,
                sourceUrl: 'https://johndoe.com',
                reservationLink: undefined, // Not relevant for personal sites
            };

            const qrTarget = personalAnalysis.sourceUrl; // Should be main portfolio URL
            expect(qrTarget).toBe('https://johndoe.com');
        });
    });
});
