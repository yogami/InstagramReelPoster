import { WebsiteScraperClient } from '../../../src/infrastructure/scraper/WebsiteScraperClient';

describe('WebsiteScraperClient.extractImages', () => {
    let client: WebsiteScraperClient;

    beforeEach(() => {
        client = new WebsiteScraperClient({ timeout: 5000 });
    });

    describe('basic extraction', () => {
        it('should extract images with src attributes', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/hero.jpg" alt="Hero image" width="1920" height="1080">
                        <img src="https://example.com/product.jpg" alt="Product shot" width="1200" height="800">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(2);
            expect(images[0].url).toBe('https://example.com/hero.jpg');
            expect(images[0].altText).toBe('Hero image');
            expect(images[0].width).toBe(1920);
            expect(images[0].height).toBe(1080);
        });

        it('should convert relative URLs to absolute', () => {
            const html = `
                <html>
                    <body>
                        <img src="/images/cafe.jpg" alt="Cafe">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/about');

            expect(images.length).toBe(1);
            expect(images[0].url).toBe('https://example.com/images/cafe.jpg');
        });

        it('should extract og:image as high priority', () => {
            const html = `
                <html>
                    <head>
                        <meta property="og:image" content="https://example.com/og-image.jpg">
                    </head>
                    <body>
                        <img src="https://example.com/normal.jpg" width="1000" height="800">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(2);
            expect(images[0].url).toBe('https://example.com/og-image.jpg');
            expect(images[0].isHero).toBe(true);
        });
    });

    describe('noise filtering', () => {
        it('should exclude social media icons', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/facebook-icon.png" width="32" height="32">
                        <img src="https://example.com/twitter-share.svg">
                        <img src="https://example.com/instagram-badge.png">
                        <img src="https://example.com/real-photo.jpg" width="1200" height="800">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(1);
            expect(images[0].url).toBe('https://example.com/real-photo.jpg');
        });

        it('should exclude logos and favicons', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/logo.svg">
                        <img src="https://example.com/favicon.ico">
                        <img src="https://example.com/company-logo-small.png">
                        <img src="https://example.com/hero-banner.jpg" width="1920" height="1080">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(1);
            expect(images[0].url).toBe('https://example.com/hero-banner.jpg');
        });

        it('should exclude tracking pixels and sprites', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/pixel.gif" width="1" height="1">
                        <img src="https://analytics.com/tracking.png">
                        <img src="https://example.com/sprite-icons.png">
                        <img src="https://example.com/menu-photo.jpg" width="1000" height="800">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(1);
            expect(images[0].url).toBe('https://example.com/menu-photo.jpg');
        });
    });

    describe('dimension filtering', () => {
        it('should exclude images smaller than 800x600', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/thumbnail.jpg" width="200" height="150">
                        <img src="https://example.com/small.jpg" width="400" height="300">
                        <img src="https://example.com/medium.jpg" width="799" height="599">
                        <img src="https://example.com/valid.jpg" width="800" height="600">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(1);
            expect(images[0].url).toBe('https://example.com/valid.jpg');
        });

        it('should include images with unknown dimensions (default to HD)', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/unknown-size.jpg" alt="Unknown size">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(1);
            expect(images[0].width).toBe(1920);
            expect(images[0].height).toBe(1080);
        });
    });

    describe('hero detection', () => {
        it('should detect hero images from class/id names', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/img1.jpg" class="hero-image" width="1920" height="1080">
                        <img src="https://example.com/img2.jpg" class="banner-main" width="1200" height="800">
                        <img src="https://example.com/img3.jpg" width="1000" height="800">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images[0].isHero).toBe(true);
            expect(images[1].isHero).toBe(true);
            expect(images[2].isHero).toBe(false);
        });
    });

    describe('sorting and limiting', () => {
        it('should sort hero images first, then by size', () => {
            const html = `
                <html>
                    <body>
                        <img src="https://example.com/small.jpg" width="800" height="600">
                        <img src="https://example.com/hero.jpg" class="hero" width="1920" height="1080">
                        <img src="https://example.com/large.jpg" width="2000" height="1500">
                    </body>
                </html>
            `;

            const images = client.extractImages(html, 'https://example.com/');

            expect(images[0].url).toBe('https://example.com/hero.jpg');
            expect(images[1].url).toBe('https://example.com/large.jpg');
            expect(images[2].url).toBe('https://example.com/small.jpg');
        });

        it('should limit to 10 images', () => {
            let html = '<html><body>';
            for (let i = 0; i < 20; i++) {
                html += `<img src="https://example.com/img${i}.jpg" width="1000" height="800">`;
            }
            html += '</body></html>';

            const images = client.extractImages(html, 'https://example.com/');

            expect(images.length).toBe(10);
        });
    });
});
