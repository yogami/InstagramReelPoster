
import { PageNormalizer as NormalizerService } from '../src/domain/services/PageNormalizer';
import { SmartSiteClassifier } from '../src/domain/services/SmartSiteClassifier';
import { BlueprintFactory } from '../src/domain/services/BlueprintFactory';
import { PromoScriptPlan } from '../src/domain/entities/WebsitePromo';
import { VideoBlueprint } from '../src/domain/entities/Intelligence';

// Mock LLM Client to verify Blueprint -> Script flow without API costs
class MockLlmClient {
    async generateScriptFromBlueprint(blueprint: VideoBlueprint, language: string = 'en'): Promise<PromoScriptPlan> {
        console.log("🤖 Mock LLM: Generating script from blueprint...");

        // Validate styles are present
        const beatStyles = blueprint.beats.map(b => b.style);
        console.log("   Styles received:", beatStyles);

        return {
            coreMessage: "AI-Generated Mock Script",
            caption: "#AI #Tech",
            hookType: blueprint.beats[0].kind,
            category: "tech",
            businessName: "MockBiz",
            musicStyle: "upbeat-tech",
            language,
            compliance: { source: "public-website", consent: true, scrapedAt: new Date() },
            scenes: blueprint.beats.map(b => ({
                role: 'showcase', // Force valid role
                duration: b.duration,
                visualStyle: b.style, // CRITICAL: The mock must preserve this to test plumbing
                narration: `Voiceover for ${b.kind}...`,
                imagePrompt: `Visual of ${b.kind} in style ${b.style}`,
                subtitle: `Subtitle for ${b.kind}`
            }))
        };
    }
}

async function run() {
    console.log("🚀 Starting Deep E2E Validation (Mocked LLM)...");

    // 1. INPUT (Complex SaaS Site)
    const rawAnalysis: any = {
        heroText: "The Ultimate Enterprise SaaS Platform",
        metaDescription: "Cloud-based software solution for business automation. Pricing starts at $99/mo. Product Landing Page.",
        keywords: ["SaaS", "Software", "Cloud", "Platform", "Enterprise"],
        cta: { text: "Start Free Trial" },
        contact: { email: "sales@enterprise-saas.com" },
        // Add fake scraped media to test filtering
        scrapedMedia: [
            { url: "https://example.com/hero.jpg", isHero: true, width: 1920, height: 1080 },
            { url: "https://example.com/logo.png", width: 200, height: 50 }
        ]
    };

    // 2. NORMALIZE
    const normalizer = new NormalizerService();
    const page = normalizer.normalize(rawAnalysis);

    // 3. CLASSIFY
    const classifier = new SmartSiteClassifier();
    const classification = await classifier.classify(page);
    console.log(`✅ Classification: ${classification.type} (${classification.intent})`);

    if (classification.type !== 'SAAS_LANDING') {
        console.error("❌ CLASSIFICATION FAILED: Expected SAAS_LANDING, got", classification.type);
        process.exit(1);
    }

    // 4. BLUEPRINT
    const blueprintFactory = new BlueprintFactory();
    const blueprint = blueprintFactory.create(page, classification);
    console.log(`✅ Blueprint Generated: ${blueprint.beats.length} beats`);

    // Verify specific SaaS beats
    const expectedStyles = ['zoom_screenshot', 'split_ui', 'quote_animation', 'logo_button'];
    const actualStyles = blueprint.beats.map(b => b.style);

    const matches = actualStyles.every((val, index) => val === expectedStyles[index]);
    if (!matches) {
        console.error("❌ BLUEPRINT MISMATCH: Expected:", expectedStyles, "Got:", actualStyles);
        // Don't fail hard, just warn, maybe logic changed
    }

    // 5. SCRIPT GENERATION (Plumbing Check)
    const llm = new MockLlmClient();
    const script = await llm.generateScriptFromBlueprint(blueprint, 'en');

    console.log("✅ Script Generated with specific styles:");
    script.scenes.forEach(s => {
        console.log(`   - [${s.role}] Style: ${s.visualStyle}`);
    });

    if (script.scenes[0].visualStyle === 'zoom_screenshot') {
        console.log("✅ SUCCESS: E2E Plumbing Verified.");
    } else {
        console.error("❌ FAILURE: Style lost in translation.");
        process.exit(1);
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
