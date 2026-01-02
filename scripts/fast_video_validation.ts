
import { loadConfig } from '../src/config';
import { createDependencies } from '../src/presentation/app';

async function productionE2EValidation() {
    console.log('🚀 Running REAL Production E2E for Video Validation...');
    console.log('This script uses the exact same dependency graph as the production app.');

    const config = loadConfig();
    // Ensure slice is manually enabled for this test script if not already in env
    config.featureFlags.enableWebsitePromoSlice = true;

    const { orchestrator: mainOrchestrator } = createDependencies(config);

    // Access the slice through the main orchestrator's dependencies
    const promoSlice = (mainOrchestrator as any).deps.websitePromoSlice;

    if (!promoSlice) {
        console.error('❌ WebsitePromoSlice not found in dependencies. Check config.featureFlags.enableWebsitePromoSlice');
        return;
    }

    const jobId = 'prod_e2e_' + Date.now();
    const websiteUrl = 'https://example.com';

    console.log(`🌐 Processing: ${websiteUrl} [Job: ${jobId}]`);

    try {
        const job = await promoSlice.orchestrator.processJob(jobId, {
            websiteUrl,
            consent: true,
            motionStyle: 'ken_burns', // Phase 2 Quality Boost
            subtitleStyle: 'bold'    // Phase 2 Quality Boost
        });

        if (job.status === 'completed') {
            const result = job.result!;
            console.log('\n✨ PRODUCTION E2E SUCCESS!');
            console.log('--------------------------------------------------');
            console.log(`🎥 FINAL VIDEO URL: ${result.videoUrl}`);
            console.log(`🧬 DNA Signals: Pain=${result.siteDNA.painScore}, Trust=${result.siteDNA.trustSignals.length}`);
            console.log('--------------------------------------------------');
            console.log('\nPlease open the link above in your browser to validate the final result.');
        } else {
            console.error('\n❌ PRODUCTION E2E FAILED:', job.error);
        }
    } catch (error) {
        console.error('\n❌ SYSTEM CRASH:', error);
    }
}

productionE2EValidation().catch(console.error);
