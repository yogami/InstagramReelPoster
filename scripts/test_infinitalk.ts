/**
 * Quick test: Upload test assets to Cloudinary → call InfiniteTalk lip-sync via kie.ai
 * Usage: npx tsx scripts/test_infinitalk.ts
 */
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

dotenv.config();

const KIE_API_KEY = process.env.KIE_API_KEY!;
const KIE_BASE = process.env.KIE_API_BASE_URL || 'https://api.kie.ai/api/v1';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'hedra-test');

async function uploadToCloudinary(filePath: string, resourceType: 'image' | 'video' | 'raw'): Promise<string> {
    console.log(`📤 Uploading ${path.basename(filePath)} to Cloudinary...`);
    const result = await cloudinary.uploader.upload(filePath, {
        resource_type: resourceType,
        folder: 'infinitalk-test',
    });
    console.log(`   ✅ URL: ${result.secure_url}`);
    return result.secure_url;
}

async function createInfinitalkTask(imageUrl: string, audioUrl: string): Promise<string> {
    console.log('\n🎬 Creating InfiniteTalk lip-sync task...');
    const response = await fetch(`${KIE_BASE}/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${KIE_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'infinitalk/from-audio',
            input: {
                image_url: imageUrl,
                audio_url: audioUrl,
                prompt: 'A young man speaking emotionally with dramatic expression, warm cinematic lighting',
                resolution: '480p',
            },
        }),
    });

    const data = await response.json();
    console.log('   Response:', JSON.stringify(data, null, 2));

    if (data.code !== 200) {
        throw new Error(`Task creation failed: ${data.msg || JSON.stringify(data)}`);
    }

    return data.data.taskId;
}

async function pollTaskStatus(taskId: string, maxAttempts = 60): Promise<any> {
    console.log(`\n⏳ Polling task ${taskId}...`);

    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        });
        const data = await response.json();
        const status = data.data?.status || data.data?.taskStatus || 'unknown';

        process.stdout.write(`   [${i + 1}/${maxAttempts}] Status: ${status}\r`);

        if (status === 'success' || status === 'completed') {
            console.log(`\n   ✅ Task completed!`);
            console.log('   Result:', JSON.stringify(data.data, null, 2));
            return data.data;
        }

        if (status === 'failed' || status === 'failure') {
            console.log(`\n   ❌ Task failed!`);
            console.log('   Error:', JSON.stringify(data.data, null, 2));
            throw new Error(`Task failed: ${JSON.stringify(data.data)}`);
        }

        // Wait 5 seconds between polls
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error('Task timed out after max attempts');
}

async function main() {
    console.log('=== InfiniteTalk Lip-Sync Test via kie.ai ===\n');

    // Step 1: Upload test assets to Cloudinary
    const imageUrl = await uploadToCloudinary(
        path.join(ASSETS_DIR, 'male_character_resized.png'),
        'image'
    );
    const audioUrl = await uploadToCloudinary(
        path.join(ASSETS_DIR, 'male_test_02.mp3'),
        'video' // Cloudinary treats audio as 'video' resource type
    );

    // Step 2: Create InfiniteTalk task
    const taskId = await createInfinitalkTask(imageUrl, audioUrl);
    console.log(`   Task ID: ${taskId}`);

    // Step 3: Poll for result
    const result = await pollTaskStatus(taskId);

    // Step 4: Extract video URL
    const videoUrl = result.output?.video_url || result.resultUrl || result.output?.url;
    if (videoUrl) {
        console.log(`\n🎉 VIDEO READY: ${videoUrl}`);
        console.log('\nOpen this URL in your browser to view the lip-synced video!');
    } else {
        console.log('\n📋 Full result (check for video URL):', JSON.stringify(result, null, 2));
    }
}

main().catch(console.error);
