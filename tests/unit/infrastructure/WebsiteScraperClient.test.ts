import nock from 'nock';
import { WebsiteScraperClient } from '../../../src/infrastructure/scraper/WebsiteScraperClient';

describe('WebsiteScraperClient', () => {
    let client: WebsiteScraperClient;

    beforeEach(() => {
        client = new WebsiteScraperClient({ timeout: 5000 });
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('scrapeWebsite()', () => {
        it('should extract hero text from H1', async () => {
            nock('https://example-cafe.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head>
                            <title>Kreuzberg Coffee | Berlin's Best</title>
                            <meta name="description" content="Fresh local roasts in the heart of Kreuzberg">
                        </head>
                        <body>
                            <h1>Welcome to Kreuzberg Coffee</h1>
                            <p>We serve the best espresso in Berlin.</p>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://example-cafe.de/');

            expect(result.heroText).toBe('Welcome to Kreuzberg Coffee');
            expect(result.metaDescription).toBe("Fresh local roasts in the heart of Kreuzberg");
            expect(result.sourceUrl).toBe('https://example-cafe.de/');
        });

        it('should fall back to title when H1 is missing', async () => {
            nock('https://example-gym.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head>
                            <title>FitBox Berlin - Your Fitness Destination</title>
                        </head>
                        <body>
                            <p>Join our community!</p>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://example-gym.de/');

            expect(result.heroText).toBe('FitBox Berlin - Your Fitness Destination');
        });

        it('should extract keywords for category detection', async () => {
            nock('https://example-cafe.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head><title>Coffee Shop</title></head>
                        <body>
                            <p>We serve the best coffee in Berlin. Our barista makes great espresso and latte.</p>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://example-cafe.de/');

            expect(result.keywords).toContain('coffee');
            expect(result.keywords).toContain('barista');
            expect(result.keywords).toContain('espresso');
            expect(result.keywords).toContain('latte');
        });

        it('should detect Berlin location from text', async () => {
            nock('https://example.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head><title>Local Shop</title></head>
                        <body>
                            <p>Visit us in Kreuzberg, Berlin!</p>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://example.de/');

            expect(result.detectedLocation).toBe('Kreuzberg');
        });

        it('should extract business name from og:site_name', async () => {
            nock('https://fancy-restaurant.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head>
                            <title>Menu - Fancy Restaurant</title>
                            <meta property="og:site_name" content="Fancy Restaurant Berlin">
                        </head>
                        <body></body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://fancy-restaurant.de/');

            expect(result.detectedBusinessName).toBe('Fancy Restaurant Berlin');
        });

        it('should extract business name from title when og:site_name missing', async () => {
            nock('https://example.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head>
                            <title>My Business | The Best in Town</title>
                        </head>
                        <body></body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://example.de/');

            expect(result.detectedBusinessName).toBe('My Business');
        });

        it('should decode HTML entities in text', async () => {
            nock('https://example.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head>
                            <title>Tom &amp; Jerry&#39;s Cafe</title>
                        </head>
                        <body>
                            <h1>Tom &amp; Jerry&#39;s Cafe</h1>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://example.de/');

            expect(result.heroText).toBe("Tom & Jerry's Cafe");
        });
    });

    describe('error handling', () => {
        it('should throw error for invalid URL', async () => {
            await expect(client.scrapeWebsite('not-a-valid-url'))
                .rejects.toThrow('Invalid website URL provided');
        });

        it('should throw error for 404 response', async () => {
            nock('https://missing-site.de')
                .get('/')
                .reply(404);

            await expect(client.scrapeWebsite('https://missing-site.de/'))
                .rejects.toThrow('Website not found (404)');
        });

        it('should throw error for 403 forbidden', async () => {
            nock('https://blocked-site.de')
                .get('/')
                .reply(403);

            await expect(client.scrapeWebsite('https://blocked-site.de/'))
                .rejects.toThrow('Website blocked scraping (403 Forbidden)');
        });
    });
});
