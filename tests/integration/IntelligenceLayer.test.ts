import { PageNormalizer } from '../../src/domain/services/PageNormalizer';
import { SmartSiteClassifier } from '../../src/domain/services/SmartSiteClassifier';
import { BlueprintFactory } from '../../src/domain/services/BlueprintFactory';
import { WebsiteAnalysis } from '../../src/domain/entities/WebsitePromo';

describe('Intelligence Layer Pipeline', () => {
    const normalizer = new PageNormalizer();
    const classifier = new SmartSiteClassifier();
    const blueprintFactory = new BlueprintFactory();

    const runPipeline = async (analysis: WebsiteAnalysis) => {
        const normalized = normalizer.normalize(analysis);
        const classification = await classifier.classify(normalized);
        const blueprint = blueprintFactory.create(normalized, classification);
        return { normalized, classification, blueprint };
    };

    it('Scenario 1: SaaS Landing Page', async () => {
        const mockSaas: WebsiteAnalysis = {
            sourceUrl: 'https://saas-example.com',
            heroText: 'The ultimate API for developers',
            metaDescription: 'Integrate in minutes. Trusted by 500 companies.',
            keywords: ['api', 'integration', 'dashboard'],
            pricingContent: { text: 'Free tier available', plans: [] },
            scrapedMedia: [],
        } as any;

        const { classification, blueprint } = await runPipeline(mockSaas);

        expect(classification.type).toBe('SAAS_LANDING');
        expect(blueprint.beats[0].kind).toBe('HOOK');
        expect(blueprint.beats[1].kind).toBe('DEMO');
        expect(blueprint.beats[2].kind).toBe('SOLUTION');
        expect(blueprint.beats[1].style).toBe('split_ui');
    });

    it('Scenario 2: Personal Portfolio', async () => {
        const mockPortfolio: WebsiteAnalysis = {
            sourceUrl: 'https://jane.design',
            heroText: 'Designing digital experiences',
            metaDescription: 'Jane Doe - UX Designer based in Berlin.',
            keywords: ['portfolio', 'ux design', 'projects'],
            email: 'jane@design.com',
            scrapedMedia: [{ url: 'headshot.jpg', isHero: true }],
            siteType: 'personal' // Mocking scraper detection
        } as any;

        const { classification, blueprint } = await runPipeline(mockPortfolio);

        expect(classification.type).toBe('PORTFOLIO');
        expect(blueprint.beats[0].style).toBe('talking_head'); // Portfolio specific style
    });

    it('Scenario 3: Local Restaurant', async () => {
        const mockLocal: WebsiteAnalysis = {
            sourceUrl: 'https://pizzaplace.com',
            heroText: 'Authentic Italian in NYC',
            metaDescription: 'Book a table now. Best pasta in town.',
            keywords: ['Italian', 'Pasta', 'Book table', 'Menu'],
            phone: '555-0123',
            address: '123 Main St',
            scrapedMedia: [],
        } as any;

        const { classification, blueprint } = await runPipeline(mockLocal);

        expect(classification.type).toBe('LOCAL_SERVICE'); // Restaurant -> LOCAL_SERVICE
        expect(blueprint.beats.length).toBe(3);
        expect(blueprint.beats[2].contentSource).toBe('contact.phone'); // Call CTA
    });
});
