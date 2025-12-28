import { JobManager } from '../src/application/JobManager';
import { MultiModelVideoClient } from '../src/infrastructure/video/MultiModelVideoClient';
import { getConfig } from '../src/config';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function rescueJob(jobId: string, taskId: string) {
    const config = getConfig();
    const jobManager = new JobManager(10, 90, process.env.REDIS_URL);

    // Give it a moment to load from disk if not using Redis
    if (!process.env.REDIS_URL) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const job = await jobManager.getJob(jobId);
    if (!job) {
        console.error(`Job not found: ${jobId}`);
        process.exit(1);
    }

    console.log(`Found job ${jobId}. Status: ${job.status}`);
    console.log(`Attempting to fetch video URL for Kie.ai Task: ${taskId}...`);

    const videoClient = new MultiModelVideoClient(
        config.kieApiKey,
        config.kieVideoBaseUrl,
        config.kieVideoModel
    );

    try {
        // We use the poll method's internal logic to get the result
        // @ts-ignore - access private method for rescue
        const videoUrl = await videoClient.pollForCompletion(taskId);

        console.log(`Success! Video URL: ${videoUrl}`);

        await jobManager.updateJob(jobId, {
            animatedVideoUrl: videoUrl,
            status: 'building_manifest',
            currentStep: 'Rescued from task ID'
        });

        console.log(`Job updated. Next time you run the server, it will resume from rendering.`);
        process.exit(0);
    } catch (err: any) {
        console.error(`Failed to rescue task: ${err.message}`);
        process.exit(1);
    }
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: npx ts-node scripts/patch_job_video.ts <jobId> <taskId>');
    process.exit(1);
}

rescueJob(args[0], args[1]);
