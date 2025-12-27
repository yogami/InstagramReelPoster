import { SemanticAnalyzer } from '../../../src/infrastructure/analysis/SemanticAnalyzer';
import {
    WebsiteAnalysis,
    SiteDNA,
    TestimonialsContent,
    PricingContent,
} from '../../../src/domain/entities/WebsitePromo';

describe('SemanticAnalyzer', () => {
    let analyzer: SemanticAnalyzer;

    beforeEach(() => {
        analyzer = new SemanticAnalyzer();
    });

    describe('analyzeSiteDNA()', () => {
        it('should return SiteDNA with all required fields', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Welcome to Our Business',
                metaDescription: 'We help you succeed',
                keywords: ['service', 'professional'],
                sourceUrl: 'https://example.com',
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result).toHaveProperty('painScore');
            expect(result).toHaveProperty('trustSignals');
            expect(result).toHaveProperty('urgency');
            expect(result).toHaveProperty('confidence');
            expect(typeof result.painScore).toBe('number');
            expect(Array.isArray(result.trustSignals)).toBe(true);
        });

        it('should return painScore between 0 and 10', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Frustrated with slow results? We fix that.',
                metaDescription: 'Tired of wasting time? Our solution works.',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.painScore).toBeGreaterThanOrEqual(0);
            expect(result.painScore).toBeLessThanOrEqual(10);
        });
    });

    describe('calculatePainScore()', () => {
        it('should score higher for pain point phrases in hero text', () => {
            const highPainAnalysis: WebsiteAnalysis = {
                heroText: 'Frustrated with slow service? Tired of waiting? Struggling to get results?',
                metaDescription: 'We solve your problems',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const lowPainAnalysis: WebsiteAnalysis = {
                heroText: 'Welcome to our lovely business',
                metaDescription: 'We are the best',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const highResult = analyzer.analyzeSiteDNA(highPainAnalysis);
            const lowResult = analyzer.analyzeSiteDNA(lowPainAnalysis);

            expect(highResult.painScore).toBeGreaterThan(lowResult.painScore);
        });

        it('should score higher when pricing page has pain points', () => {
            const analysisWithPricing: WebsiteAnalysis = {
                heroText: 'Our Service',
                metaDescription: 'Professional help',
                keywords: [],
                sourceUrl: 'https://example.com',
                pricingContent: {
                    painPoints: ['wasting time', 'losing money', 'frustrating process'],
                    pricingTiers: [],
                    rawText: '',
                },
            };

            const analysisWithoutPricing: WebsiteAnalysis = {
                heroText: 'Our Service',
                metaDescription: 'Professional help',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const withPricing = analyzer.analyzeSiteDNA(analysisWithPricing);
            const withoutPricing = analyzer.analyzeSiteDNA(analysisWithoutPricing);

            expect(withPricing.painScore).toBeGreaterThan(withoutPricing.painScore);
        });
    });

    describe('extractTrustSignals()', () => {
        it('should extract star ratings from testimonials', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Our Business',
                metaDescription: 'Best in town',
                keywords: [],
                sourceUrl: 'https://example.com',
                testimonialsContent: {
                    quotes: [],
                    starRatings: ['4.9/5', '5 stars'],
                    clientCounts: [],
                    pressMentions: [],
                },
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.trustSignals).toContain('4.9/5');
            expect(result.trustSignals).toContain('5 stars');
        });

        it('should extract client counts from testimonials', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Our Business',
                metaDescription: 'Best in town',
                keywords: [],
                sourceUrl: 'https://example.com',
                testimonialsContent: {
                    quotes: [],
                    starRatings: [],
                    clientCounts: ['500+ clients', '1000+ happy customers'],
                    pressMentions: [],
                },
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.trustSignals).toContain('500+ clients');
            expect(result.trustSignals).toContain('1000+ happy customers');
        });

        it('should extract press mentions from testimonials', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Our Business',
                metaDescription: 'Best in town',
                keywords: [],
                sourceUrl: 'https://example.com',
                testimonialsContent: {
                    quotes: [],
                    starRatings: [],
                    clientCounts: [],
                    pressMentions: ['Featured in TechCrunch', 'As seen on Forbes'],
                },
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.trustSignals).toContain('Featured in TechCrunch');
            expect(result.trustSignals).toContain('As seen on Forbes');
        });

        it('should return empty array when no trust signals found', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Simple Business',
                metaDescription: 'Just a business',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.trustSignals).toEqual([]);
        });
    });

    describe('detectUrgency()', () => {
        it('should detect "Limited spots" urgency triggers', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Limited spots available! Book now!',
                metaDescription: 'Act fast',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.urgency).not.toBeNull();
            expect(result.urgency?.toLowerCase()).toContain('limited');
        });

        it('should detect "Book now" urgency triggers', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Book now before its too late!',
                metaDescription: 'Hurry',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.urgency).not.toBeNull();
        });

        it('should detect "Offer ends" urgency triggers', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Special discount',
                metaDescription: 'Offer ends soon! Last chance to save 50%',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.urgency).not.toBeNull();
        });

        it('should return null when no urgency triggers found', () => {
            const analysis: WebsiteAnalysis = {
                heroText: 'Welcome to our business',
                metaDescription: 'We are here to help',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const result = analyzer.analyzeSiteDNA(analysis);

            expect(result.urgency).toBeNull();
        });
    });

    describe('confidence score', () => {
        it('should have higher confidence with more data sources', () => {
            const richAnalysis: WebsiteAnalysis = {
                heroText: 'Frustrated with slow service?',
                metaDescription: 'We fix your problems',
                keywords: ['gym', 'fitness'],
                sourceUrl: 'https://example.com',
                aboutContent: 'We have been helping customers since 2010',
                testimonialsContent: {
                    quotes: ['Great service!'],
                    starRatings: ['4.9/5'],
                    clientCounts: ['500+ clients'],
                    pressMentions: [],
                },
                pricingContent: {
                    painPoints: ['wasting money'],
                    pricingTiers: ['Basic', 'Pro'],
                    rawText: 'Affordable pricing',
                },
            };

            const sparseAnalysis: WebsiteAnalysis = {
                heroText: 'Welcome',
                metaDescription: '',
                keywords: [],
                sourceUrl: 'https://example.com',
            };

            const richResult = analyzer.analyzeSiteDNA(richAnalysis);
            const sparseResult = analyzer.analyzeSiteDNA(sparseAnalysis);

            expect(richResult.confidence).toBeGreaterThan(sparseResult.confidence);
        });
    });
});
