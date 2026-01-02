import { createWebsitePromoSlice } from '../src/slices/website-promo';
import { WebsitePromoWorker } from '../src/slices/website-promo/application/WebsitePromoWorker';
import {
    StressTestScraperMock,
    StressTestScriptMock,
    StressTestAssetMock,
    StressTestRenderingMock,
    StressTestAvatarMock,
    StressTestTranslationMock
} from '../src/slices/website-promo/adapters/StressTestMocks';
import { BullMqJobQueueAdapter } from '../src/slices/website-promo/adapters/BullMqJobQueueAdapter';
import { InMemoryCacheAdapter } from '../src/slices/website-promo/adapters/InMemoryCacheAdapter';
import { NoOpMetricsAdapter } from '../src/slices/website-promo/adapters/ConsoleMetricsAdapter';
import { InMemoryTemplateRepository } from '../src/slices/website-promo/adapters/InMemoryTemplateRepository';
import Redis from 'ioredis';

/**
 * 🚀 E2E STRESS TEST SCRIPT
 * 
 * Objectives:
 * 1. Verify BullMQ throughput without spending API credits.
 * 2. Simulate 100 parallel requests.
 * 3. Monitor worker completion rate.
 */

async function runStressTest() {
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    const redis = new Redis(REDIS_URL, { connectTimeout: 1000, maxRetriesPerRequest: 0 });
    let useRedis = true;

    try {
        await redis.ping();
        console.log('⚡ Redis detected. Running in Queue/Worker mode.');
        console.log('🧹 Cleaning up Redis...');
        await redis.flushdb();
    } catch (err) {
        console.warn('⚠️  Redis is DOWN. Running in Direct/Synchronous mode.');
        useRedis = false;
    }

    // 1. Setup Slice with Stress Mocks (Zero-Cost)
    console.log('🏗️ Setting up Stress Test Orbit...');
    const slice = createWebsitePromoSlice({
        scrapingPort: new StressTestScraperMock(),
        scriptPort: new StressTestScriptMock(),
        assetPort: new StressTestAssetMock(),
        renderingPort: new StressTestRenderingMock(),
        translationPort: new StressTestTranslationMock(),
        templateRepository: new InMemoryTemplateRepository(),
        cachePort: new InMemoryCacheAdapter(),
        metricsPort: new NoOpMetricsAdapter(),
        avatarPort: new StressTestAvatarMock(),
        jobQueuePort: useRedis ? new BullMqJobQueueAdapter(REDIS_URL) : undefined,
        onComplete: async (job) => {
            if (!useRedis) console.log(`✅ Job Completed: ${job.id}`);
        }
    });

    // 2. Setup Worker (Concurrency: 10)
    let worker: WebsitePromoWorker | undefined;
    if (useRedis) {
        console.log('👷 Initializing Worker (Concurrency: 10)...');
        worker = new WebsitePromoWorker(slice.orchestrator, REDIS_URL, 10);
    }

    // 3. Spawning 100 Jobs
    const JOB_COUNT = 100;
    console.log(`🔥 Spawning ${JOB_COUNT} Jobs...`);
    const startTime = Date.now();

    for (let i = 0; i < JOB_COUNT; i++) {
        await slice.orchestrator.processJob(`stress_job_${i}`, {
            websiteUrl: `https://test-site-${i}.com`,
            consent: true,
            avatarId: 'stress-avatar'
        });
    }

    console.log(`📤 All ${JOB_COUNT} jobs triggered. Monitoring completion...`);

    // 4. Wait for completion
    let completed = 0;
    if (useRedis) {
        while (completed < JOB_COUNT) {
            const completedCount = await redis.zcard('bull:website_promo_queue:completed');
            if (completedCount !== completed) {
                completed = completedCount;
                console.log(`📊 Progress: ${completed}/${JOB_COUNT} (${Math.round((completed / JOB_COUNT) * 100)}%)`);
            }

            if (completed < JOB_COUNT) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    } else {
        completed = JOB_COUNT; // In sync mode, processJob waits for completion
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log('\n--- STRESS TEST COMPLETE ---');
    console.log(`Execution Mode: ${useRedis ? 'BullMQ/Redis' : 'Synchronous/Direct'}`);
    console.log(`Total Jobs: ${JOB_COUNT}`);
    console.log(`Total Time: ${duration.toFixed(2)}s`);
    console.log(`Throughput: ${((JOB_COUNT / duration) * 3600).toFixed(0)} jobs/hour`);
    console.log('-----------------------------\n');

    if (worker) await worker.close();
    if (redis) await redis.quit();
    process.exit(0);
}

runStressTest().catch(console.error);
