
import { PageNormalizer } from '../src/domain/services/PageNormalizer';
import { SmartSiteClassifier } from '../src/domain/services/SmartSiteClassifier';
import { BlueprintFactory } from '../src/domain/services/BlueprintFactory';

async function run() {
    console.log("🚀 Verifying SOTA Intelligence Pipeline...");

    // 1. Mock Raw Analysis (Simulating Scraper Output)
    // 1. Mock Raw Analysis (Simulating Scraper Output)
    const rawAnalysis: any = {
        heroText: "Enterprise AI Cloud Platform",
        metaDescription: "Scalable Machine Learning Solutions for Business. SaaS Software for Data Science. Science & Technology at its best.",
        keywords: ["AI", "Machine Learning", "SaaS", "Cloud", "Software"],
        cta: { text: "Start Free Trial" },
        contact: { email: "sales@cloud.ai" }
    };

    // 2. Normalize
    console.log("\n1. Normalizing...");
    const normalizer = new PageNormalizer();
    const normalized = normalizer.normalize(rawAnalysis);

    // 3. Classify (Calls Python)
    console.log("\n2. Classifying (Python SOTA)...");
    const classifier = new SmartSiteClassifier();
    const classification = await classifier.classify(normalized);
    console.log("   Type:", classification.type); // Expect SAAS_LANDING
    console.log("   Intent:", classification.intent);
    console.log("   Reasoning:", classification.reasoning);

    // 4. Blueprint
    console.log("\n3. Generating Blueprint...");
    const factory = new BlueprintFactory();
    const blueprint = factory.create(normalized, classification);

    console.log("   Blueprint Beats:");
    blueprint.beats.forEach(b => {
        console.log(`   - [${b.kind}] ${b.id} (${b.duration}s) Style: ${b.style}`);
    });

    if (classification.type === 'SAAS_LANDING' && blueprint.beats[0].style === 'zoom_screenshot') {
        console.log("\n✅ SUCCESS: Pipeline implemented SOTA logic correctly.");
    } else {
        console.error("\n❌ FAILURE: Pipeline did not match expected SOTA logic.");
    }
}

run().catch(console.error);
