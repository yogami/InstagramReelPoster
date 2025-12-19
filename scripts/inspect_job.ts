
import dotenv from 'dotenv';
import path from 'path';
import Redis from 'ioredis';

// Load env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const jobId = 'job_62269816'; // The failed job ID

async function inspect() {
    if (!process.env.REDIS_URL) {
        console.error('No REDIS_URL in .env. Cannot connect to production Redis.');
        return;
    }
    console.log('Connecting to Redis...');
    const redis = new Redis(process.env.REDIS_URL);

    try {
        const key = `reel_job:${jobId}`;
        const data = await redis.get(key);

        if (!data) {
            console.error(`Job ${jobId} not found in Redis.`);
            return;
        }

        const job = JSON.parse(data);
        console.log('✅ Job Found!');
        console.log('------------------------------------------------');
        console.log('Status:', job.status);
        console.log('Source Audio URL:', job.sourceAudioUrl);
        console.log('Telegram Chat ID:', job.telegramChatId);
        console.log('Target Duration:', job.targetDurationRange);
        console.log('------------------------------------------------');

        // Output for automatic parsing if needed
        console.log(`__AUDIO_URL::${job.sourceAudioUrl}::END__`);

    } catch (err) {
        console.error('Error inspecting job:', err);
    } finally {
        redis.disconnect();
    }
}

inspect();
