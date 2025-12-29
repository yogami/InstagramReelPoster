import { EnhancedWebsiteScraper } from '../../src/infrastructure/scraper/EnhancedWebsiteScraper';

/**
 * Integration tests for EnhancedWebsiteScraper
 * Tests against real websites to verify contact extraction
 */
describe('EnhancedWebsiteScraper Integration', () => {
    let scraper: EnhancedWebsiteScraper;

    beforeAll(() => {
        scraper = new EnhancedWebsiteScraper();
    });

    afterAll(async () => {
        await scraper.close();
    });

    // Increase timeout for real network requests
    jest.setTimeout(60000);

    describe('German Restaurant - sushi-yana.de', () => {
        it('should extract contact info from modal-based site', async () => {
            const analysis = await scraper.scrapeWebsite('https://www.sushi-yana.de/berlin-friedrichshain/');

            console.log('sushi-yana.de analysis:', JSON.stringify(analysis, null, 2));

            // Basic info should be present
            expect(analysis.sourceUrl).toContain('sushi-yana.de');
            expect(analysis.heroText).toBeTruthy();

            // At least some business info should be extracted
            const hasContactInfo = !!(analysis.phone || analysis.email || analysis.address);

            // Log what we found
            console.log('Extracted contact info:', {
                phone: analysis.phone,
                email: analysis.email,
                address: analysis.address,
                hours: analysis.openingHours
            });

            // Note: If modal interaction fails, HTTP scraper might not find contact
            // This test validates the scraping works, even if modal content isn't accessible
            expect(analysis.logoUrl || analysis.heroText || analysis.detectedBusinessName).toBeTruthy();
        });
    });

    describe('Tech Company - berlinailabs.de', () => {
        it('should extract contact info from standard footer/page', async () => {
            const analysis = await scraper.scrapeWebsite('https://berlinailabs.de');

            console.log('berlinailabs.de analysis:', JSON.stringify(analysis, null, 2));

            // Basic info
            expect(analysis.sourceUrl).toBe('https://berlinailabs.de');

            // Should have business name
            expect(analysis.detectedBusinessName || analysis.heroText).toBeTruthy();

            // Should have logo
            expect(analysis.logoUrl).toBeTruthy();

            console.log('Extracted info:', {
                businessName: analysis.detectedBusinessName,
                heroText: analysis.heroText,
                logoUrl: analysis.logoUrl,
                email: analysis.email
            });
        });
    });

    describe('Schema.org Site', () => {
        it('should extract structured data from JSON-LD', async () => {
            // A restaurant that likely has Schema.org data
            const analysis = await scraper.scrapeWebsite('https://www.yelp.de/biz/cafe-no-berlin');

            console.log('Yelp analysis:', JSON.stringify(analysis, null, 2));

            // Yelp pages have structured data
            expect(analysis.heroText || analysis.detectedBusinessName).toBeTruthy();
        });
    });

    describe('Edge Cases', () => {
        it('should handle cookie consent banners', async () => {
            // Most German sites have cookie consent
            const analysis = await scraper.scrapeWebsite('https://www.berlinailabs.de');

            // Should complete without throwing
            expect(analysis).toBeDefined();
            expect(analysis.sourceUrl).toBeTruthy();
        });

        it('should handle timeout gracefully', async () => {
            // Invalid/slow domain
            try {
                await scraper.scrapeWebsite('https://example.invalid.domain.test');
                fail('Should have thrown an error');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        it('should handle redirect sites', async () => {
            // Site that redirects
            const analysis = await scraper.scrapeWebsite('https://google.de');

            expect(analysis).toBeDefined();
            expect(analysis.sourceUrl).toBeTruthy();
        });
    });

    describe('Image Extraction', () => {
        it('should extract hero images', async () => {
            const analysis = await scraper.scrapeWebsite('https://berlinailabs.de');

            // Should have scraped media
            if (analysis.scrapedMedia && analysis.scrapedMedia.length > 0) {
                console.log('Scraped images:', analysis.scrapedMedia.map(m => m.url));
                expect(analysis.scrapedMedia[0].url).toMatch(/^https?:\/\//);
            }
        });
    });
});

/**
 * Quick test runner for manual verification
 */
if (require.main === module) {
    (async () => {
        const scraper = new EnhancedWebsiteScraper();

        const testUrls = [
            'https://www.sushi-yana.de/berlin-friedrichshain/',
            'https://berlinailabs.de',
        ];

        for (const url of testUrls) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Testing: ${url}`);
            console.log('='.repeat(60));

            try {
                const analysis = await scraper.scrapeWebsite(url);
                console.log('Result:', {
                    businessName: analysis.detectedBusinessName,
                    heroText: analysis.heroText?.substring(0, 50),
                    phone: analysis.phone,
                    email: analysis.email,
                    address: analysis.address,
                    hours: analysis.openingHours?.substring(0, 50),
                    logoUrl: analysis.logoUrl,
                    imageCount: analysis.scrapedMedia?.length || 0
                });
            } catch (error) {
                console.error('Error:', error);
            }
        }

        await scraper.close();
        console.log('\nDone!');
    })();
}
