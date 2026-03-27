/**
 * Koi Stoic Style Mini-Reel Pipeline
 * Full workflow: Scene Images → TTS → Lip-Sync → FFmpeg Composite
 * Usage: npx tsx scripts/test_koi_stoic_reel.ts
 */
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

dotenv.config();

const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY!;
const FISH_BASE = process.env.FISH_AUDIO_BASE_URL || 'https://api.fish.audio';
const KIE_API_KEY = process.env.KIE_API_KEY!;
const KIE_BASE = process.env.KIE_API_BASE_URL || 'https://api.kie.ai/api/v1';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const OUT_DIR = path.join(__dirname, '..', 'assets', 'koi-stoic-test');

// Voice IDs
const ADAM_VOICE = '3f21f85fe38c4e66823a985de9bd4238';
const KATKAT_VOICE = 'bddf65d5a84c4a9aa36b7136bdac57a9';

// Character style description (consistent across all prompts)
const CHAR_STYLE = 'flat 2D cartoon art style, thick black outlines, minimal cell shading, Webtoon aesthetic, anime-inspired large eyes, clean flat colors, digital illustration';
const SCENE_BG = 'modern apartment kitchen with marble countertop, warm evening lighting, wooden cabinets, city skyline visible through window';

// Scene prompts — consistent character descriptions
const MALE_DESC = 'young man with short messy dark brown hair, warm brown skin, wearing a dark green casual jacket over a white v-neck t-shirt';
const FEMALE_DESC = 'young woman with long wavy dark brown hair, light brown skin, wearing a fitted red dress';

const SCENES = [
    {
        id: 'wide_intro',
        prompt: `Wide medium shot of a couple standing at a kitchen counter. On the left: ${MALE_DESC}, holding a coffee mug looking defensive. On the right: ${FEMALE_DESC}, arms crossed looking disappointed. ${SCENE_BG}. ${CHAR_STYLE}. 9:16 vertical portrait composition.`,
    },
    {
        id: 'closeup_female',
        prompt: `Close-up portrait shot from shoulders up. ${FEMALE_DESC}. She looks disappointed and hurt, slightly turned away. ${SCENE_BG} blurred in background. ${CHAR_STYLE}. 9:16 vertical portrait composition.`,
    },
    {
        id: 'closeup_male',
        prompt: `Close-up portrait shot from shoulders up. ${MALE_DESC}. He looks frustrated and defensive, one hand gesturing. ${SCENE_BG} blurred in background. ${CHAR_STYLE}. 9:16 vertical portrait composition.`,
    },
];

// Dialogue script
const DIALOGUE = [
    { speaker: 'female', voice: KATKAT_VOICE, text: "You always do this. Every single time.", scene: 'closeup_female' },
    { speaker: 'male', voice: ADAM_VOICE, text: "Do what? I'm just being honest.", scene: 'closeup_male' },
    { speaker: 'female', voice: KATKAT_VOICE, text: "Honest? You call that honest?", scene: 'closeup_female' },
];

// === API Helpers ===

async function kieCreateTask(model: string, input: any): Promise<string> {
    const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input }),
    });
    const data = await res.json();
    if (data.code !== 200) throw new Error(`Task failed: ${JSON.stringify(data)}`);
    return data.data.taskId;
}

async function kiePollTask(taskId: string, label: string, maxAttempts = 120): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        });
        const data = await res.json();
        const state = data.data?.state || 'pending';
        process.stdout.write(`   [${label}] ${i + 1}/${maxAttempts}: ${state}   \r`);

        if (state === 'success') {
            console.log(`   [${label}] ✅ Done in ~${(i + 1) * 3}s`);
            return data.data;
        }
        if (state === 'fail') {
            console.log(`   [${label}] ❌ Failed: ${data.data.failMsg}`);
            throw new Error(`${label} failed: ${data.data.failMsg}`);
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error(`${label} timed out`);
}

async function downloadFile(url: string, destPath: string): Promise<void> {
    const res = await fetch(url);
    fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function uploadCloudinary(filePath: string, resourceType: 'image' | 'video', publicId: string): Promise<string> {
    const result = await cloudinary.uploader.upload(filePath, {
        resource_type: resourceType, folder: 'koi-stoic-test', public_id: publicId, overwrite: true,
    });
    return result.secure_url;
}

async function generateTTS(text: string, voiceId: string, outputPath: string): Promise<void> {
    const res = await fetch(`${FISH_BASE}/v1/tts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3', mp3_bitrate: 128 }),
    });
    if (!res.ok) throw new Error(`TTS failed: ${await res.text()}`);
    fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

// === Main Pipeline ===

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║   KOI STOIC STYLE MINI-REEL PIPELINE          ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    // ── STEP 1: Generate Scene Images via Ideogram ──
    console.log('━━━ STEP 1: Generating Scene Images (Ideogram) ━━━\n');
    const sceneImages: Record<string, string> = {};

    for (const scene of SCENES) {
        const localPath = path.join(OUT_DIR, `${scene.id}.png`);
        if (fs.existsSync(localPath)) {
            console.log(`📸 Skipping ${scene.id} (already exists)...`);
            sceneImages[scene.id] = localPath;
            continue;
        }

        console.log(`📸 Generating ${scene.id}...`);
        const taskId = await kieCreateTask('ideogram/v3-text-to-image', {
            prompt: scene.prompt,
            rendering_speed: 'BALANCED',
            style: 'AUTO',
            expand_prompt: false,
            image_size: 'portrait_16_9',
            num_images: '1',
            negative_prompt: '3D render, photorealistic, blurry, low quality, deformed',
        });

        const result = await kiePollTask(taskId, scene.id);
        const resultJson = JSON.parse(result.resultJson || '{}');
        const imageUrl = resultJson.resultUrls?.[0];

        if (!imageUrl) throw new Error(`No image URL for ${scene.id}`);

        await downloadFile(imageUrl, localPath);
        sceneImages[scene.id] = localPath;
        console.log(`   Saved: ${localPath}\n`);
    }

    // ── STEP 2: Generate TTS Dialogue ──
    console.log('━━━ STEP 2: Generating TTS Dialogue (Fish Audio) ━━━\n');
    const ttsFiles: string[] = [];

    for (let i = 0; i < DIALOGUE.length; i++) {
        const line = DIALOGUE[i];
        const outputPath = path.join(OUT_DIR, `dialogue_${i}_${line.speaker}.mp3`);

        if (fs.existsSync(outputPath)) {
            console.log(`🎤 Skipping line ${i + 1} (already exists)...`);
            ttsFiles.push(outputPath);
            continue;
        }

        console.log(`🎤 Line ${i + 1} (${line.speaker}): "${line.text}"`);
        await generateTTS(line.text, line.voice, outputPath);
        ttsFiles.push(outputPath);
        const size = fs.statSync(outputPath).size;
        console.log(`   ✅ ${(size / 1024).toFixed(1)} KB\n`);
    }

    // ── STEP 3: InfiniteTalk Lip-Sync on Close-ups ──
    console.log('━━━ STEP 3: InfiniteTalk Lip-Sync Animation ━━━\n');
    const lipSyncVideos: string[] = [];

    for (let i = 0; i < DIALOGUE.length; i++) {
        const line = DIALOGUE[i];
        const sceneImage = sceneImages[line.scene];
        const localPath = path.join(OUT_DIR, `lipsync_${i}_${line.speaker}.mp4`);

        if (fs.existsSync(localPath)) {
            console.log(`🎬 Skipping line ${i + 1} (already exists)...`);
            lipSyncVideos.push(localPath);
            continue;
        }

        console.log(`🎬 Animating line ${i + 1} (${line.speaker})...`);

        // Upload image + audio to Cloudinary for public URLs
        const imgUrl = await uploadCloudinary(sceneImage, 'image', `lipsync_img_${i}`);
        const audioUrl = await uploadCloudinary(ttsFiles[i], 'video', `lipsync_audio_${i}`);

        const taskId = await kieCreateTask('infinitalk/from-audio', {
            image_url: imgUrl,
            audio_url: audioUrl,
            prompt: `${line.speaker === 'male' ? 'A young man' : 'A young woman'} speaking ${i === 0 ? 'with disappointment' : i === 1 ? 'defensively' : 'with hurt and frustration'
                }, subtle head movement, expressive eyes`,
            resolution: '480p',
        });

        const result = await kiePollTask(taskId, `lipsync_${i}`);
        const resultJson = JSON.parse(result.resultJson || '{}');
        const videoUrl = resultJson.resultUrls?.[0];

        await downloadFile(videoUrl, localPath);
        lipSyncVideos.push(localPath);
        console.log(`   Saved: ${localPath}\n`);
    }

    // ── STEP 4: FFmpeg Composite ──
    console.log('━━━ STEP 4: FFmpeg Composite (Ken Burns + Cuts) ━━━\n');

    // Get duration of each lip-sync video
    const durations = lipSyncVideos.map(v => {
        const probe = execSync(`ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${v}"`);
        return parseFloat(probe.toString().trim());
    });
    console.log('   Clip durations:', durations.map(d => `${d.toFixed(1)}s`).join(', '));

    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const wideIntroDur = 2.0;
    const wideOutroDur = 1.5;

    // Create Ken Burns zoom on wide shot (intro)
    const wideIntro = path.join(OUT_DIR, 'wide_intro_anim.mp4');
    execSync(`ffmpeg -y -loop 1 -i "${sceneImages['wide_intro']}" -t ${wideIntroDur} -vf "scale=1080:1920,zoompan=z='min(zoom+0.002,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${wideIntroDur * 25}:s=1080x1920:fps=25" -c:v libx264 -pix_fmt yuv420p "${wideIntro}"`);
    console.log('   ✅ Wide intro with Ken Burns zoom');

    // Create Ken Burns on wide shot (outro - zoom out)
    const wideOutro = path.join(OUT_DIR, 'wide_outro_anim.mp4');
    execSync(`ffmpeg -y -loop 1 -i "${sceneImages['wide_intro']}" -t ${wideOutroDur} -vf "scale=1080:1920,zoompan=z='if(eq(on,1),1.15,max(zoom-0.003,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${wideOutroDur * 25}:s=1080x1920:fps=25" -c:v libx264 -pix_fmt yuv420p "${wideOutro}"`);
    console.log('   ✅ Wide outro with Ken Burns zoom out');

    // Scale all lip-sync videos to 1080x1920
    const scaledClips: string[] = [];
    for (let i = 0; i < lipSyncVideos.length; i++) {
        const scaled = path.join(OUT_DIR, `lipsync_${i}_scaled.mp4`);
        execSync(`ffmpeg -y -i "${lipSyncVideos[i]}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -pix_fmt yuv420p -an "${scaled}"`);
        scaledClips.push(scaled);
    }
    console.log('   ✅ All clips scaled to 1080x1920');

    // Create concat list
    const concatList = path.join(OUT_DIR, 'concat_list.txt');
    const entries = [
        `file '${wideIntro}'`,
        ...scaledClips.map(c => `file '${c}'`),
        `file '${wideOutro}'`,
    ];
    fs.writeFileSync(concatList, entries.join('\n'));

    // Concat all video clips (no audio yet)
    const concatVideo = path.join(OUT_DIR, 'concat_video.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:v libx264 -pix_fmt yuv420p "${concatVideo}"`);
    console.log('   ✅ Concatenated all video clips');

    // Merge all audio files with silence gap for intro
    const silenceFile = path.join(OUT_DIR, 'silence.mp3');
    execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${wideIntroDur} -c:a libmp3lame "${silenceFile}"`);

    // Build audio concat
    const audioConcatList = path.join(OUT_DIR, 'audio_concat.txt');
    const audioEntries = [
        `file '${silenceFile}'`,
        ...ttsFiles.map(f => `file '${f}'`),
    ];
    fs.writeFileSync(audioConcatList, audioEntries.join('\n'));

    const fullAudio = path.join(OUT_DIR, 'full_audio.mp3');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${audioConcatList}" -c:a libmp3lame "${fullAudio}"`);
    console.log('   ✅ Merged all audio with intro silence');

    // Final: merge video + audio
    const finalReel = path.join(OUT_DIR, 'final_reel.mp4');
    execSync(`ffmpeg -y -i "${concatVideo}" -i "${fullAudio}" -c:v copy -c:a aac -shortest "${finalReel}"`);
    console.log(`\n   🎉 FINAL REEL: ${finalReel}`);

    // Upload to Cloudinary
    const finalUrl = await uploadCloudinary(finalReel, 'video', 'koi_stoic_mini_reel');
    console.log(`\n📺 CLOUDINARY LINK: ${finalUrl}`);
}

main().catch(console.error);
