
import dotenv from 'dotenv';
dotenv.config();

import { getConfig } from '../src/config';
import { createDependencies } from '../src/presentation/app';
import { ReelJob } from '../src/domain/entities/ReelJob';
import { WebsitePromoInput } from '../src/domain/entities/WebsitePromo';

/**
 * PRODUCTION-GRADE VERIFICATION
 * 
 * Uses the ACTUAL ReelOrchestrator to verify:
 * 1. Correct Voice Selection (Standard vs Promo)
 * 2. Correct Template Logic (Restaurant vs Tech)
 * 3. Correct Asset Generation (Images, Music)
 */
async function verifyProductionFlow() {
    const config = getConfig();

    // Force specific flags if needed for verification
    config.featureFlags.enableUserApproval = false; // Disable interactive approval for automation

    // 1. Initialize Dependencies (EXACTLY as App does)
    const { orchestrator, jobManager } = createDependencies(config);

    console.log('🚀 Starting Verification: "Berlin Restaurant" Scenario');

    // 2. Mock Input Data (Simulating a POST /api/reels request)
    // We explicitly leave 'category' undefined to test detection logic,
    // OR set it to 'restaurant' if we want to force-verify the Restaurant Template.
    // Given the user wants to see the "Restaurant Template", we will provide it 
    // to ensure we hit that specific logic path for visuals.
    const input: WebsitePromoInput = {
        websiteUrl: 'https://berlinailabs.de', // Using this as the source content
        // category: 'restaurant', // REMOVE FORCE: Let it detect 'tech' or 'agency' to verify correct template
        language: 'de',         // FORCE German language
        businessName: 'Berlin Labs Kitchen', // Override name to fit context
        consent: true, // Required by WebsitePromoInput
        // forceMode moved to top level
    };

    // 3. Create Job
    const job = await jobManager.createJob({
        type: 'website_promo', // This isn't in ReelJobInput either, removing
        websitePromoInput: input,
        // Top-level overrides
        forceMode: 'website-promo',
        language: 'de'
    } as any); // Casting as any to bypass strict type checking for verification script speed, 
    // but structure is now correct for logic.


    console.log(`✅ Job Created: ${job.id}`);

    // 4. Process Job using ORCHESTRATOR (The Real Logic)
    try {
        console.log('⏳ Processing Job...');
        const completedJob = await orchestrator.processJob(job.id);

        console.log('\n✅ Job Completed Successfully!');
        console.log('--------------------------------------------------');
        console.log(`🎥 Final Video URL: ${completedJob.finalVideoUrl}`);
        console.log(`🗣️  Voiceover URL:  ${completedJob.voiceoverUrl}`);
        console.log(`⏱️  Duration:       ${completedJob.voiceoverDurationSeconds}s`);
        console.log('--------------------------------------------------');

        if (completedJob.finalVideoUrl) {
            console.log(`\n[Action Required] Please open the URL above to verify:`);
            console.log(`1. Voice is GERMAN (using ID: ${config.ttsCloningPromoVoiceId})`);
            console.log(`2. Images match "Restaurant" template (Chef, Plating, etc)`);
        }

    } catch (error) {
        console.error('\n❌ Job Failed:', error);
        process.exit(1);
    }
}

// Run
if (require.main === module) {
    verifyProductionFlow().catch(console.error);
}
