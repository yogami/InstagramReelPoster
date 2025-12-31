
import dotenv from 'dotenv';
dotenv.config();

import { getConfig } from '../src/config';
import { createDependencies } from '../src/presentation/app';
import { WebsitePromoInput } from '../src/domain/entities/WebsitePromo';

/**
 * GENERATE REAL DIDIBERMAN VIDEO
 */
async function generateRealDidibermanVideo() {
    console.log("🚀 Generating REAL SOTA Video for didiberman.com");
    console.log("---------------------------------------------------");

    const config = getConfig();
    const { orchestrator, jobManager } = createDependencies(config);

    // 1. Setup Input for Didiberman
    const input: WebsitePromoInput = {
        websiteUrl: 'https://didiberman.com',
        businessName: 'Didi Berman',
        category: 'tech', // providing hint
        language: 'en',
        consent: true
    };

    // 2. Create Job
    const job = await jobManager.createJob({
        type: 'website_promo',
        websitePromoInput: input,
        forceMode: 'website-promo'
    } as any);

    console.log(`✅ Job Created: ${job.id}`);
    console.log("⏳ Processing Job with REAL dependencies...");

    try {
        const completedJob = await orchestrator.processJob(job.id);

        console.log("---------------------------------------------------");
        console.log("✅ REAL VIDEO GENERATED");
        console.log(`🔗 Link: ${completedJob.finalVideoUrl}`);
        console.log("---------------------------------------------------");
    } catch (error) {
        console.error("❌ Job Failed:", error);
    }
}

if (require.main === module) {
    generateRealDidibermanVideo().catch(console.error);
}
