
import { loadConfig } from '../src/config';
import { createDependencies } from '../src/presentation/app';
import { BusinessCategory } from '../src/domain/entities/WebsitePromo';

async function main() {
    console.log('🚀 Loading Configuration...');
    const config = loadConfig();
    config.featureFlags.usePlaywrightScraper = true; // FORCE PLAYWRIGHT

    console.log('🔧 Initializing Dependencies...');
    const { orchestrator, jobManager } = createDependencies(config);

    // Single Target (Known Good)
    const restaurants: { url: string; category: BusinessCategory }[] = [
        { url: 'https://sushi-yana.de/', category: 'restaurant' }
    ];

    console.log('🚀 Starting Verification for 1 Berlin Restaurant...');
    const results: any[] = [];

    for (const restaurant of restaurants) {
        console.log(`\n👨‍🍳 Processing: ${restaurant.url}`);
        try {
            const input = {
                websiteUrl: restaurant.url,
                category: restaurant.category,
                consent: true,
                language: 'en'
            };

            const job = await jobManager.createJob({
                websitePromoInput: input,
                telegramChatId: 0
            });
            console.log(`   Job ID: ${job.id}`);

            const startTime = Date.now();
            const finalJob = await orchestrator.processWebsitePromoJob(job.id, job);
            const duration = (Date.now() - startTime) / 1000;

            console.log(`✅ Completed in ${duration.toFixed(1)}s`);
            console.log(`📹 Video URL: ${finalJob.finalVideoUrl}`);

            results.push({
                restaurant: restaurant.url,
                videoUrl: finalJob.finalVideoUrl,
                status: 'success',
                duration
            });

        } catch (e) {
            console.error(`❌ Failed: ${restaurant.url}`, e);
            results.push({
                restaurant: restaurant.url,
                error: (e as Error).message,
                status: 'failed'
            });
        }
    }

    console.log('\n\n🏁 Verification Summary 🏁');
    console.table(results);
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
