
import { PageNormalizer } from '../src/domain/services/PageNormalizer';
import { SmartSiteClassifier } from '../src/domain/services/SmartSiteClassifier';
import { BlueprintFactory } from '../src/domain/services/BlueprintFactory';
import { PromoScriptPlan } from '../src/domain/entities/WebsitePromo';
import { VideoBlueprint } from '../src/domain/entities/Intelligence';

// Mock LLM Client that behaves like the real one for this test
class SimulationLlmClient {
    async generateScriptFromBlueprint(blueprint: VideoBlueprint, language: string = 'en'): Promise<PromoScriptPlan> {
        console.log("\n🤖 LLM: Generating script based on Blueprint...");

        return {
            coreMessage: `Boost your business with ${blueprint.classification.type === 'PORTFOLIO' ? 'Expert Cloud Engineering' : 'AI Automation'}.`,
            caption: "Scale your infrastructure with expert MLOps. #AI #DevOps #Cloud",
            hookType: blueprint.beats[0].kind,
            category: "tech",
            businessName: "Didi Berman",
            musicStyle: "tech-minimal",
            language,
            compliance: { source: "public-website", consent: true, scrapedAt: new Date() },
            scenes: blueprint.beats.map(b => ({
                role: 'showcase',
                duration: b.duration,
                visualStyle: b.style,
                narration: `[${b.kind}] ${b.scriptInstruction} (Voiceover matching ${b.style} visual)`,
                imagePrompt: `High quality ${b.style} of ${b.contentSource}`,
                subtitle: `Subtitle for ${b.kind}`
            }))
        };
    }
}

async function run() {
    console.log("🚀 Testing didiberman.com (Intelligence Layer)...");

    // 1. REAL DATA (Extracted via Browser Agent)
    const websiteData = {
        main_headline: "Didi Berman",
        subheadline_intro: "Cloud Solutions Architect & AI Engineer. AWS • Terraform • Agentic AI. I take intelligent cloud systems through their entire journey.",
        services_features: [
            "Full Lifecycle Ownership",
            "Agentic AI & RAG",
            "DevOps & Optimization",
            "Cloud Architecture: AWS",
            "Infrastructure as Code"
        ],
        cta_buttons: ["Book a Call", "Contact Me", "View Projects"]
    };

    const rawAnalysis: any = {
        heroText: websiteData.main_headline,
        metaDescription: websiteData.subheadline_intro,
        keywords: ["AI", "Cloud", "Solutions", "Architect", "DevOps"],
        cta: { text: "Book a Call" },
        contact: { email: "contact@didiberman.com" }, // Inferred
        // Important for Portfolio detection:
        siteType: undefined, // Let the classifier figure it out, or maybe 'personal' if scraper detected it
        scrapedMedia: []
    };

    // 2. NORMALIZE
    console.log("\n1. Normalizing...");
    const normalizer = new PageNormalizer();
    const page = normalizer.normalize(rawAnalysis);
    console.log("   Hero:", page.hero.headline);
    console.log("   CTA:", page.cta.text);

    // 3. CLASSIFY
    console.log("\n2. Classifying...");
    const classifier = new SmartSiteClassifier();
    const classification = await classifier.classify(page);
    console.log(`✅ Classification: ${classification.type} (${classification.intent})`);
    console.log("   Reasoning:", classification.reasoning);

    // 4. BLUEPRINT
    console.log("\n3. Generating Blueprint...");
    const factory = new BlueprintFactory();
    const blueprint = factory.create(page, classification);

    console.log("   Blueprint Strategy:", classification.type);
    console.log("   Beats:");
    blueprint.beats.forEach(b => {
        console.log(`   - [${b.kind}] (${b.duration}s) Style: ${b.style}`);
        console.log(`     Instruction: ${b.scriptInstruction}`);
    });

    // 5. SCRIPT (Simulated)
    const llm = new SimulationLlmClient();
    const script = await llm.generateScriptFromBlueprint(blueprint);

    console.log("\n4. Final Script Plan (Preview):");
    console.log("   Core Message:", script.coreMessage);
    script.scenes.forEach((s, i) => {
        console.log(`   Scene ${i + 1} [${s.visualStyle}]: ${s.narration}`);
    });

    if (classification.type === 'PORTFOLIO' || classification.type === 'SAAS_LANDING') {
        console.log("\n✅ SUCCESS: Site handled correctly by SOTA pipeline.");
    } else {
        console.warn("\n⚠️ INTENT CHECK: Classified as", classification.type, "- Verify if this fits.");
    }
}

run().catch(e => console.error(e));
