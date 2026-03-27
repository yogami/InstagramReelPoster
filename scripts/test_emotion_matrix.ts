/**
 * Emotion Matrix Test: One video per voice covering all emotions
 * Male (Adam Sped Up) + Female (KatKat)
 * Usage: npx tsx scripts/test_emotion_matrix.ts
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

const VOICES = {
    male: { id: '3f21f85fe38c4e66823a985de9bd4238', name: 'Adam Sped Up', image: 'male_character_resized.png' },
    female: { id: 'bddf65d5a84c4a9aa36b7136bdac57a9', name: 'KatKat', image: 'female_character_resized.png' },
};

// Multi-emotion script — trimmed to fit 15s audio limit
// Covers: sigh → disappointment → excitement → anger
const EMOTION_SCRIPT = `*sigh* I don't even know what to say anymore.
I really thought you'd be different.
Wait, are you serious!? That's amazing!
You always do this! You just walk away.`;

async function generateTTS(text: string, voiceId: string, outputPath: string): Promise<string> {
    console.log(`🎤 Generating TTS (${path.basename(outputPath)})...`);

    const response = await fetch(`${FISH_BASE_URL}/v1/tts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${FISH_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text,
            reference_id: voiceId,
            format: 'mp3',
            mp3_bitrate: 128,
        }),
    });

    if (!response.ok) {
        throw new Error(`TTS failed (${response.status}): ${await response.text()}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputPath, audioBuffer);
    const durationEstimate = (audioBuffer.length / (128 * 1024 / 8)).toFixed(1);
    console.log(`   ✅ ${(audioBuffer.length / 1024).toFixed(1)} KB (~${durationEstimate}s estimated)`);
    return outputPath;
}

async function uploadToCloudinary(filePath: string, resourceType: 'image' | 'video', publicId: string): Promise<string> {
    console.log(`📤 Uploading ${path.basename(filePath)}...`);
    const result = await cloudinary.uploader.upload(filePath, {
        resource_type: resourceType,
        folder: 'emotion-matrix-test',
        public_id: publicId,
        overwrite: true,
    });
    console.log(`   ✅ ${result.secure_url}`);
    return result.secure_url;
}

async function createInfinitalkTask(imageUrl: string, audioUrl: string, prompt: string): Promise<string> {
    console.log('🎬 Submitting InfiniteTalk task...');
    const response = await fetch(`${KIE_BASE}/jobs/createTask`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${KIE_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'infinitalk/from-audio',
            input: { image_url: imageUrl, audio_url: audioUrl, prompt, resolution: '480p' },
        }),
    });

    const data = await response.json();
    if (data.code !== 200) throw new Error(`Task failed: ${JSON.stringify(data)}`);
    console.log(`   ✅ Task ID: ${data.data.taskId}`);
    return data.data.taskId;
}

async function pollTask(taskId: string, label: string, maxAttempts = 120): Promise<string> {
    console.log(`⏳ Waiting for ${label}...`);

    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        });
        const data = await response.json();
        const state = data.data?.state || 'pending';

        process.stdout.write(`   [${i + 1}/${maxAttempts}] ${state}   \r`);

        if (state === 'success') {
            const resultJson = JSON.parse(data.data.resultJson || '{}');
            const videoUrl = resultJson.resultUrls?.[0];
            console.log(`\n   ✅ Done in ~${(i + 1) * 5}s`);
            return videoUrl;
        }
        if (state === 'failed') {
            throw new Error(`${label} failed: ${data.data.failMsg}`);
        }

        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error(`${label} timed out`);
}

async function testVoice(gender: 'male' | 'female') {
    const voice = VOICES[gender];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Testing ${gender.toUpperCase()} — ${voice.name}`);
    console.log(`${'='.repeat(60)}\n`);

    // 1. Generate TTS
    const ttsPath = path.join(ASSETS_DIR, `emotion_${gender}.mp3`);
    await generateTTS(EMOTION_SCRIPT, voice.id, ttsPath);

    // 2. Upload assets
    const imageUrl = await uploadToCloudinary(
        path.join(ASSETS_DIR, voice.image), 'image', `emotion_${gender}_char`
    );
    const audioUrl = await uploadToCloudinary(ttsPath, 'video', `emotion_${gender}_audio`);

    // 3. Run InfiniteTalk
    const prompt = gender === 'male'
        ? 'A young man cycling through emotions — sighing, disappointed, suddenly excited, then angry, finally sad. Expressive face, warm cinematic lighting, conversational delivery.'
        : 'A young woman cycling through emotions — sighing, disappointed, suddenly excited, then angry, finally sad. Expressive face, warm cinematic lighting, conversational delivery.';

    const taskId = await createInfinitalkTask(imageUrl, audioUrl, prompt);

    // 4. Wait for result
    const videoUrl = await pollTask(taskId, `${gender} emotion video`);

    // 5. Download locally
    const localPath = path.join(ASSETS_DIR, `emotion_${gender}_result.mp4`);
    const videoResponse = await fetch(videoUrl);
    fs.writeFileSync(localPath, Buffer.from(await videoResponse.arrayBuffer()));

    // 6. Upload final to Cloudinary
    const finalUrl = await uploadToCloudinary(localPath, 'video', `emotion_${gender}_final`);

    console.log(`\n🎉 ${gender.toUpperCase()} RESULT: ${finalUrl}\n`);
    return finalUrl;
}

async function main() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   EMOTION MATRIX TEST — InfiniteTalk + Fish  ║');
    console.log('╚══════════════════════════════════════════════╝\n');
    console.log('Script covering: sigh, disappointment, excitement, anger, sadness\n');

    const maleUrl = await testVoice('male');
    const femaleUrl = await testVoice('female');

    console.log('\n' + '='.repeat(60));
    console.log('📺 FINAL COMPARISON LINKS:');
    console.log('='.repeat(60));
    console.log(`  MALE (Adam):   ${maleUrl}`);
    console.log(`  FEMALE (KatKat): ${femaleUrl}`);
}

main().catch(console.error);
