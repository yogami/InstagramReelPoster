import { loadConfig } from '../src/config';
import { createDependencies } from '../src/presentation/app';

async function main() {
    console.log('🚀 Generating reel for berlinailabs.de...\n');

    const config = loadConfig();
    config.featureFlags.usePlaywrightScraper = true;

    const { orchestrator, jobManager } = createDependencies(config);

    try {
        const input = {
            websiteUrl: 'https://berlinailabs.de',
            category: 'service' as const,
            consent: true,
            language: 'de'
        };

        const job = await jobManager.createJob({
            websitePromoInput: input,
            telegramChatId: 0
        });

        console.log(`Job ID: ${job.id}`);

        const startTime = Date.now();
        const finalJob = await orchestrator.processWebsitePromoJob(job.id, job);
        const duration = (Date.now() - startTime) / 1000;

        console.log(`\n✅ Completed in ${duration.toFixed(1)}s`);
        console.log(`📹 Video URL: ${finalJob.finalVideoUrl}`);

        return finalJob;
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
