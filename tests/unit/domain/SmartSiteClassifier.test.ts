import { SmartSiteClassifier } from '../../../src/domain/services/SmartSiteClassifier';
import { NormalizedPage, SiteType, PrimaryIntent } from '../../../src/domain/entities/Intelligence';

describe('SmartSiteClassifier', () => {
    let classifier: SmartSiteClassifier;
    let mockPage: NormalizedPage;

    beforeEach(() => {
        classifier = new SmartSiteClassifier();
        mockPage = {
            hero: { headline: '', subhead: '' },
            features: [],
            socialProof: { testimonials: [], logos: [], stats: [] },
            pricing: { hasFreeTier: false },
            cta: { text: '', link: '', type: 'demo' },
            contact: {},
            meta: { title: '', description: '', originalUrl: '' },
            rawAnalysis: {} as any
        };
    });

    it('should classify SAAS_LANDING correctly', async () => {
        mockPage.hero.headline = 'The #1 API for Payment Processing';
        mockPage.hero.subhead = 'Integrate in minutes. 99.9% uptime.';
        mockPage.cta.text = 'Get API Key';
        mockPage.pricing.hasFreeTier = true;

        const result = await classifier.classify(mockPage);

        expect(result.type).toBe(SiteType.SAAS_LANDING);
        expect(result.confidence).toBeGreaterThan(0.2);
    });

    it('should classify PORTFOLIO correctly', async () => {
        mockPage.hero.headline = 'I design beautiful interfaces';
        mockPage.meta.title = 'Alex Smith - UX Designer';
        mockPage.rawAnalysis.siteType = 'personal'; // Leverage existing detector hint

        const result = await classifier.classify(mockPage);

        expect(result.type).toBe(SiteType.PORTFOLIO);
    });

    it('should classify LOCAL_SERVICE correctly', async () => {
        mockPage.hero.headline = 'Best Plumbing in Berlin';
        mockPage.contact.phone = '+49 30 123456';
        mockPage.contact.address = 'Alexanderplatz 1';

        const result = await classifier.classify(mockPage);

        expect(result.type).toBe(SiteType.LOCAL_SERVICE);
    });

    it('should detect FAST_EASY intent', async () => {
        mockPage.hero.headline = 'Setup in 5 minutes';
        mockPage.hero.subhead = 'No coding required. Simple and fast.';

        const result = await classifier.classify(mockPage);

        expect(result.intent).toBe(PrimaryIntent.FAST_EASY);
    });

    it('should detect TRUST_PROOF intent', async () => {
        mockPage.hero.subhead = 'Trusted by 500+ enterprises. SOC2 Compliant.';
        mockPage.socialProof.logos = ['Bank of America', 'Google'];

        const result = await classifier.classify(mockPage);

        expect(result.intent).toBe(PrimaryIntent.TRUST_PROOF);
    });
});
