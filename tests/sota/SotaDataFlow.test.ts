import { BlueprintFactory } from '../../src/domain/services/BlueprintFactory';
import { buildBlueprintPrompt } from '../../src/infrastructure/llm/BlueprintPrompt';
import { NormalizedPage, SiteType, PrimaryIntent } from '../../src/domain/entities/Intelligence';

describe('SOTA Data Flow Verification', () => {
    // 1. Setup Mock Data
    const mockPage: NormalizedPage = {
        hero: {
            headline: "SOTA Verified Headline",
            subhead: "Subhead Content",
            visualUrl: "https://example.com/hero.jpg"
        },
        features: [
            { title: "Feature 1", description: "Desc 1" }
        ],
        socialProof: {
            testimonials: [{ quote: "Best Tool Ever", author: "User" }],
            logos: [],
            stats: []
        },
        pricing: { hasFreeTier: true },
        cta: { text: "Start Free", link: "/start", type: "signup" },
        contact: { email: "test@example.com" },
        meta: { title: "Test", description: "Desc", originalUrl: "https://test.com" },
        rawAnalysis: {} as any
    };

    const mockClassification = {
        type: SiteType.SAAS_LANDING,
        intent: PrimaryIntent.FAST_EASY,
        confidence: 1.0,
        reasoning: []
    };

    test('BlueprintFactory should resolve path values from NormalizedPage', () => {
        const factory = new BlueprintFactory();
        const blueprint = factory.create(mockPage, mockClassification);

        // Verify Beat Structure
        expect(blueprint.beats.length).toBeGreaterThan(0);

        // CHECK 1: HOOK beat should have resolved "hero.headline"
        const hookBeat = blueprint.beats.find((b: any) => b.kind === 'HOOK');
        expect(hookBeat).toBeDefined();
        expect(hookBeat?.contentSource).toBe('hero.headline');

        // CRITICAL DATA INTEGRITY CHECK
        // This is what failed before: ensuring the actual TEXT is resolved in the object
        expect(hookBeat?.contentValue).toBe("SOTA Verified Headline");

        // CHECK 2: CTA beat should have resolved "cta.text"
        const ctaBeat = blueprint.beats.find((b: any) => b.kind === 'CTA');
        expect(ctaBeat?.contentValue).toBe("Start Free");
    });

    test('BlueprintPrompt should inject resolved content into LLM Prompt', () => {
        const factory = new BlueprintFactory();
        const blueprint = factory.create(mockPage, mockClassification);

        const prompt = buildBlueprintPrompt(blueprint, 'en');

        // CRITICAL PROMPT INTEGRITY CHECK
        // The prompt sent to GPT must contain the actual user content
        expect(prompt).toContain('"contextData": "SOTA Verified Headline"');
        expect(prompt).toContain('"contextData": "Start Free"');

        // Ensure Styles are passed
        expect(prompt).toContain('"style": "zoom_screenshot"');
    });
});
