import { JobManager } from '../src/application/JobManager';
import * as dotenv from 'dotenv';

dotenv.config();

async function patchJobWithUrl(jobId: string, videoUrl: string) {
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

    console.log(`Patching job ${jobId} with direct URL: ${videoUrl}`);

    await jobManager.updateJob(jobId, {
        animatedVideoUrl: videoUrl,
        status: 'building_manifest',
        currentStep: 'Manual URL Injection'
    });

    console.log(`Success! Job updated. Restart your server to finish rendering.`);
    process.exit(0);
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: npx ts-node scripts/patch_job_url.ts <jobId> <videoUrl>');
    process.exit(1);
}

patchJobWithUrl(args[0], args[1]);
