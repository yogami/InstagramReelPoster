import { PageNormalizer } from '../../../src/domain/services/PageNormalizer';
import { WebsiteAnalysis } from '../../../src/domain/entities/WebsitePromo';

describe('PageNormalizer', () => {
    let normalizer: PageNormalizer;
    let mockAnalysis: WebsiteAnalysis;

    beforeEach(() => {
        normalizer = new PageNormalizer();

        // Base mock with minimal required fields
        mockAnalysis = {
            sourceUrl: 'https://example.com',
            heroText: 'Build Faster. Ship Better.',
            aboutContent: 'We help you ship code.',
            keywords: ['dev', 'tools'],
            metaDescription: 'The best dev tool.',
            scrapedMedia: [
                { url: 'https://example.com/hero.jpg', isHero: true, width: 1920, height: 1080, sourcePage: '/', altText: 'Hero' }
            ],
            // Add other fields as optional/undefined initially
            scrapedContent: {
                headlines: ['Build Faster. Ship Better.', 'Feature 1', 'Feature 2'],
                paragraphs: ['We help you ship code.', 'It is fast.', 'It is reliable.'],
                links: []
            } as any
        } as WebsiteAnalysis;
    });

    it('should normalize hero section correctly', () => {
        const result = normalizer.normalize(mockAnalysis);

        expect(result.hero.headline).toBe('Build Faster. Ship Better.');
        // Should fallback to meta description or first paragraph if subhead not explicit
        expect(result.hero.subhead).toBeTruthy();
        expect(result.hero.visualUrl).toBe('https://example.com/hero.jpg');
    });

    it('should extract pricing model availability', () => {
        mockAnalysis.pricingContent = {
            rawText: 'Plans start at $29/mo. Free tier available.',
            pricingTiers: [],
            painPoints: []
        };

        const result = normalizer.normalize(mockAnalysis);

        expect(result.pricing.hasFreeTier).toBe(true);
        expect(result.pricing.pricePoint).toContain('$29');
    });

    it('should map social proof from testimonials', () => {
        mockAnalysis.testimonialsContent = {
            quotes: ['Amazing service', 'Changed my life'],
            starRatings: [],
            clientCounts: [],
            pressMentions: []
        };

        const result = normalizer.normalize(mockAnalysis);

        expect(result.socialProof.testimonials).toHaveLength(2);
        // Note: Authors are not currently extracted by scraper, defaults to 'Customer'
        expect(result.socialProof.testimonials[0].author).toBe('Customer');
    });

    it('should normalize contact info', () => {
        mockAnalysis.email = 'hello@example.com';
        mockAnalysis.phone = '+1234567890';

        const result = normalizer.normalize(mockAnalysis);

        expect(result.contact.email).toBe('hello@example.com');
        expect(result.contact.phone).toBe('+1234567890');
    });
});
