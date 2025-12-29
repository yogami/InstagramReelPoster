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

        it('should extract branding (logo, address, opening hours)', async () => {
            nock('https://branding-test.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head>
                            <title>Branding Test</title>
                        </head>
                        <body>
                            <img src="/assets/logo-main.png" class="header-logo" alt="Logo">
                            <p class="address">Address: Musterstraße 42, 10115 Berlin</p>
                            <div class="hours">
                                Opening Hours:
                                Mon-Fri: 9:00 - 18:00
                                Sat: 10:00 - 16:00
                            </div>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://branding-test.de/');

            expect(result.logoUrl).toBe('https://branding-test.de/assets/logo-main.png');
            expect(result.address).toContain('Musterstraße 42, 10115 Berlin');
            expect(result.openingHours).toContain('Mon-Fri: 9:00 - 18:00');
        });

        it('should detect email and phone from contact sections', async () => {
            nock('https://contact-test.de')
                .get('/')
                .reply(200, `
                    <html>
                        <body>
                            <footer id="footer">
                                <p>Contact us: sales@berlinailabs.de</p>
                                <p>Tel: +49 30 12345678</p>
                                <a href="mailto:support@berlinailabs.de">Email Support</a>
                            </footer>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://contact-test.de/');

            expect(result.email).toBe('sales@berlinailabs.de');
            expect(result.phone).toContain('49 30 12345678');
        });

        it('should find contact info on subpages if missing from main page', async () => {
            nock('https://subpage-contact.de')
                .get('/')
                .reply(200, '<html><body><h1>Welcome</h1></body></html>')
                .get('/contact')
                .reply(200, '<html><body><p>Email: info@subpage.de</p></body></html>');

            const result = await client.scrapeWebsite('https://subpage-contact.de/', { includeSubpages: true });

            expect(result.email).toBe('info@subpage.de');
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

    describe('multi-page scraping', () => {
        it('should scrape /about page when includeSubpages is true', async () => {
            nock('https://business.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head><title>Business</title></head>
                        <body><h1>Welcome</h1></body>
                    </html>
                `)
                .get('/about')
                .reply(200, `
                    <html>
                        <body>
                            <p>We have been serving customers since 2010. Our team of experts is dedicated to quality.</p>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://business.de/', { includeSubpages: true });

            expect(result.aboutContent).toBeDefined();
            expect(result.aboutContent).toContain('serving customers since 2010');
        });

        it('should scrape /pricing page and extract pain points', async () => {
            nock('https://business.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head><title>Business</title></head>
                        <body><h1>Welcome</h1></body>
                    </html>
                `)
                .get('/pricing')
                .reply(200, `
                    <html>
                        <body>
                            <p>Tired of wasting money? Frustrated with slow results?</p>
                            <div class="tier">Basic - $10/mo</div>
                            <div class="tier">Pro - $25/mo</div>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://business.de/', { includeSubpages: true });

            expect(result.pricingContent).toBeDefined();
            expect(result.pricingContent?.rawText).toContain('wasting money');
        });

        it('should scrape /testimonials page and extract trust signals', async () => {
            nock('https://business.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head><title>Business</title></head>
                        <body><h1>Welcome</h1></body>
                    </html>
                `)
                .get('/testimonials')
                .reply(200, `
                    <html>
                        <body>
                            <div class="testimonial">"Great service, highly recommend!" - John D.</div>
                            <div class="rating">4.9 out of 5 stars</div>
                            <p>500+ satisfied customers</p>
                            <p>Featured in TechCrunch</p>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://business.de/', { includeSubpages: true });

            expect(result.testimonialsContent).toBeDefined();
            expect(result.testimonialsContent?.starRatings).toContain('4.9 out of 5 stars');
            expect(result.testimonialsContent?.clientCounts).toContain('500+ satisfied customers');
            expect(result.testimonialsContent?.pressMentions).toContain('Featured in TechCrunch');
        });

        it('should gracefully handle 404 on subpages', async () => {
            nock('https://business.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head><title>Business</title></head>
                        <body><h1>Welcome</h1></body>
                    </html>
                `)
                .get('/about')
                .reply(404)
                .get('/pricing')
                .reply(404)
                .get('/testimonials')
                .reply(404);

            const result = await client.scrapeWebsite('https://business.de/', { includeSubpages: true });

            expect(result.heroText).toBe('Welcome');
            expect(result.aboutContent).toBeUndefined();
            expect(result.pricingContent).toBeUndefined();
            expect(result.testimonialsContent).toBeUndefined();
        });

        it('should not scrape subpages when includeSubpages is false', async () => {
            nock('https://business.de')
                .get('/')
                .reply(200, `
                    <html>
                        <head><title>Business</title></head>
                        <body><h1>Welcome</h1></body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://business.de/', { includeSubpages: false });

            expect(result.heroText).toBe('Welcome');
            expect(result.aboutContent).toBeUndefined();
            expect(result.pricingContent).toBeUndefined();
            expect(result.testimonialsContent).toBeUndefined();
        });
    });

    describe('testimonial extraction', () => {
        it('should extract quotes from testimonial blocks', async () => {
            nock('https://business.de')
                .get('/')
                .reply(200, '<html><head><title>Biz</title></head><body><h1>Hi</h1></body></html>')
                .get('/testimonials')
                .reply(200, `
                    <html>
                        <body>
                            <blockquote>"This changed my life!" - Sarah</blockquote>
                            <div class="quote">"Amazing product, would buy again!"</div>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://business.de/', { includeSubpages: true });

            expect(result.testimonialsContent?.quotes.length).toBeGreaterThan(0);
        });

        it('should extract star ratings in various formats', async () => {
            nock('https://business.de')
                .get('/')
                .reply(200, '<html><head><title>Biz</title></head><body><h1>Hi</h1></body></html>')
                .get('/testimonials')
                .reply(200, `
                    <html>
                        <body>
                            <span>4.9/5 stars</span>
                            <span>5 out of 5</span>
                            <span>Rating: 4.8/5</span>
                        </body>
                    </html>
                `);

            const result = await client.scrapeWebsite('https://business.de/', { includeSubpages: true });

            expect(result.testimonialsContent?.starRatings.length).toBeGreaterThanOrEqual(1);
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
