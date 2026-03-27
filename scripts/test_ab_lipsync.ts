/**
 * A/B Test: Better TTS voice → InfiniteTalk lip-sync
 * Test 1: Adam Sped Up voice vs original robotic voice
 * Usage: npx tsx scripts/test_ab_lipsync.ts
 */
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs';

dotenv.config();

const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY!;
const FISH_BASE_URL = process.env.FISH_AUDIO_BASE_URL || 'https://api.fish.audio';
const KIE_API_KEY = process.env.KIE_API_KEY!;
const KIE_BASE = process.env.KIE_API_BASE_URL || 'https://api.kie.ai/api/v1';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'hedra-test');
const ADAM_VOICE_ID = '3f21f85fe38c4e66823a985de9bd4238';

// The dialogue line for testing
const DIALOGUE = "You always do this. Walk away when things get real.";

async function generateTTS(text: string, voiceId: string, outputPath: string): Promise<string> {
    console.log(`🎤 Generating TTS with voice ${voiceId}...`);
    console.log(`   Text: "${text}"`);

    const response = await fetch(`${FISH_BASE_URL}/v1/tts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${FISH_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: text,
            reference_id: voiceId,
            format: 'mp3',
            mp3_bitrate: 128,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS failed (${response.status}): ${errorText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, audioBuffer);
    console.log(`   ✅ Saved: ${path.basename(outputPath)} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
    return outputPath;
}

async function uploadToCloudinary(filePath: string, resourceType: 'image' | 'video' | 'raw', publicId?: string): Promise<string> {
    console.log(`📤 Uploading ${path.basename(filePath)} to Cloudinary...`);
    const result = await cloudinary.uploader.upload(filePath, {
        resource_type: resourceType,
        folder: 'infinitalk-test',
        public_id: publicId,
        overwrite: true,
    });
    console.log(`   ✅ URL: ${result.secure_url}`);
    return result.secure_url;
}

async function createInfinitalkTask(imageUrl: string, audioUrl: string, prompt: string): Promise<string> {
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
                prompt: prompt,
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

async function pollTaskStatus(taskId: string, maxAttempts = 90): Promise<any> {
    console.log(`\n⏳ Polling task ${taskId} (max ${maxAttempts * 5}s)...`);

    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        });
        const data = await response.json();
        const state = data.data?.state || 'pending';

        process.stdout.write(`   [${i + 1}/${maxAttempts}] State: ${state}   \r`);

        if (state === 'success' || state === 'completed') {
            console.log(`\n   ✅ Task completed in ~${(i + 1) * 5}s`);
            return data.data;
        }

        if (state === 'failed' || state === 'failure') {
            console.log(`\n   ❌ Task failed!`);
            console.log('   Error:', JSON.stringify(data.data, null, 2));
            throw new Error(`Task failed: ${data.data.failMsg || JSON.stringify(data.data)}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error('Task timed out');
}

async function main() {
    console.log('=== A/B Test: Better TTS → InfiniteTalk Lip-Sync ===');
    console.log('=== Test 1: Adam Sped Up voice ===\n');

    // Step 1: Generate TTS with Adam Sped Up
    const ttsOutputPath = path.join(ASSETS_DIR, 'adam_speedup_test.mp3');
    await generateTTS(DIALOGUE, ADAM_VOICE_ID, ttsOutputPath);

    // Step 2: Upload assets to Cloudinary
    const imageUrl = await uploadToCloudinary(
        path.join(ASSETS_DIR, 'male_character_resized.png'),
        'image',
        'ab_test_male_character'
    );
    const audioUrl = await uploadToCloudinary(
        ttsOutputPath,
        'video', // Cloudinary treats audio as 'video'
        'ab_test_adam_speedup'
    );

    // Step 3: Run InfiniteTalk
    const taskId = await createInfinitalkTask(
        imageUrl,
        audioUrl,
        'A young man speaking emotionally with dramatic expression and subtle head movements, warm cinematic lighting, conversational delivery'
    );
    console.log(`   Task ID: ${taskId}`);

    // Step 4: Poll for result
    const result = await pollTaskStatus(taskId);

    // Step 5: Extract and download video
    const resultJson = JSON.parse(result.resultJson || '{}');
    const videoUrl = resultJson.resultUrls?.[0] || result.resultUrl;

    if (videoUrl) {
        console.log(`\n🎉 VIDEO READY: ${videoUrl}`);

        // Download locally
        const localPath = path.join(ASSETS_DIR, 'infinitalk_ab_test_adam.mp4');
        const videoResponse = await fetch(videoUrl);
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        fs.writeFileSync(localPath, videoBuffer);
        console.log(`   Saved locally: ${localPath}`);

        // Upload to Cloudinary for easy sharing
        const cloudinaryUrl = await uploadToCloudinary(localPath, 'video', 'ab_test_adam_lipsync_result');
        console.log(`\n📺 CLOUDINARY LINK: ${cloudinaryUrl}`);
        console.log('\nCompare with previous test:');
        console.log('  OLD (robotic): https://res.cloudinary.com/djol0rpn5/video/upload/v1771486573/infinitalk-test/infinitalk_lipsync_result.mp4');
        console.log(`  NEW (Adam):    ${cloudinaryUrl}`);
    } else {
        console.log('\n📋 Full result:', JSON.stringify(result, null, 2));
    }
}

main().catch(console.error);
