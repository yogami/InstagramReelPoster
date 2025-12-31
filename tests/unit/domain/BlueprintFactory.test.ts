import { BlueprintFactory } from '../../../src/domain/services/BlueprintFactory';
import { NormalizedPage, SiteType, PrimaryIntent, SiteClassification } from '../../../src/domain/entities/Intelligence';

describe('BlueprintFactory', () => {
    let factory: BlueprintFactory;

    const mockPage: NormalizedPage = {
        hero: { headline: 'Automate Everything', subhead: 'Save time.', visualUrl: 'hero.jpg' },
        features: [{ title: 'API', description: 'Fast API' }],
        socialProof: { testimonials: [], logos: [], stats: [] },
        pricing: { hasFreeTier: true },
        cta: { text: 'Start Free', link: '/', type: 'signup' },
        contact: {},
        meta: { title: '', description: '', originalUrl: '' },
        rawAnalysis: {} as any
    };

    beforeEach(() => {
        factory = new BlueprintFactory();
    });

    it('should generate SAAS/FAST_EASY blueprint', () => {
        const classification: SiteClassification = {
            type: SiteType.SAAS_LANDING,
            intent: PrimaryIntent.FAST_EASY,
            confidence: 1,
            reasoning: []
        };

        const blueprint = factory.create(mockPage, classification);

        expect(blueprint.beats.length).toBeGreaterThanOrEqual(3);
        expect(blueprint.beats[0].kind).toBe('HOOK');
        expect(blueprint.beats[0].style).toBe('kinetic_text');
        expect(blueprint.beats[1].kind).toBe('DEMO'); // SAAS usually has a demo beat
    });

    it('should generate PORTFOLIO blueprint with specific style', () => {
        const classification: SiteClassification = {
            type: SiteType.PORTFOLIO,
            intent: PrimaryIntent.AUTHORITY,
            confidence: 1,
            reasoning: []
        };

        mockPage.hero.visualUrl = 'profile.jpg'; // Has headshot

        const blueprint = factory.create(mockPage, classification);

        expect(blueprint.beats[0].style).toBe('talking_head'); // Portfolio starts with face
        expect(blueprint.beats[1].kind).toBe('PROOF'); // Show work
    });

    it('should fallback to generic blueprint for unknown types', () => {
        const classification: SiteClassification = {
            type: SiteType.OTHER,
            intent: PrimaryIntent.FAST_EASY,
            confidence: 0,
            reasoning: []
        };

        const blueprint = factory.create(mockPage, classification);

        expect(blueprint.beats.length).toBe(3); // Standard Hook, Value, CTA
        expect(blueprint.beats[0].kind).toBe('HOOK');
        expect(blueprint.beats[2].kind).toBe('CTA');
    });
});
