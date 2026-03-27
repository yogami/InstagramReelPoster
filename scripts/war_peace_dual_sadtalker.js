/**
 * War & Peace — Reverted Dual-Halves Architecture (v10)
 *
 * Implements the preferred "two animated characters talking to each other
 * in two halves with perfect lip sync" architecture from Option 7, 
 * but replaces the expensive D-ID engine ($1.20/min) with 
 * Replicate SadTalker (~$0.02/clip).
 * 
 * Pipeline:
 * 1. FLUX generates a SINGLE 1:1 image of both characters.
 * 2. Split into Left (Arya) and Right (Seneca).
 * 3. Fish Audio generates the TTS line AND a silent audio of the same length.
 * 4. We trigger **Replicate cjwbw/sadtalker** TWICE per turn:
 *    - Speaker gets the dialogue audio.
 *    - Listener gets the silent audio.
 * 5. FFmpeg stitches both moving videos back together seamlessly.
 */

require('dotenv').config();
const Replicate = require('replicate');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cloudinary = require('cloudinary').v2;

const FISH_API_KEY   = process.env.FISH_AUDIO_API_KEY;
const CLOUD_NAME     = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUD_KEY      = process.env.CLOUDINARY_API_KEY;
const CLOUD_SECRET   = process.env.CLOUDINARY_API_SECRET;
const REPLICATE_KEY  = process.env.REPLICATE_API_TOKEN;

const ARYA_VOICE     = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';
const SENECA_VOICE   = process.env.FISH_AUDIO_SCENARIO_FEMALE_VOICE_ID || '3895f5f7c6ac43f092bec1b2c04f431f';

const TMP = '/tmp/war_peace_v10';
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

cloudinary.config({ cloud_name: CLOUD_NAME, api_key: CLOUD_KEY, api_secret: CLOUD_SECRET });
const replicate = new Replicate({ auth: REPLICATE_KEY });

const TURNS = [
    { speaker: 'left', character: 'ARYA', voice: ARYA_VOICE, line: "War is not failure. It is the forge. Every age of peace was built on the bones of a previous war." },
    { speaker: 'right', character: 'SENECA', voice: SENECA_VOICE, line: "That is the trap we cannot escape. We burn civilisations and call the ash progress." }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractUrl(output) {
    if (Array.isArray(output)) return String(output[0]?.url ? output[0].url() : output[0]);
    return String(output?.url ? output.url() : output);
}

async function download(url, dest) {
    const res = await axios.get(url, { responseType: 'stream' });
    const w = fs.createWriteStream(dest);
    res.data.pipe(w);
    return new Promise((ok, fail) => { w.on('finish', ok); w.on('error', fail); });
}

function duration(p) {
    return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${p}"`).toString().trim());
}

async function replicateRun(model, input) {
    for (let i = 1; i <= 8; i++) {
        try { return await replicate.run(model, { input }); } catch (err) {
            const msg = String(err.message || '');
            if ((msg.includes('429') || msg.includes('throttled')) && i < 8) {
                const wait = 12;
                console.warn(`  ⚠  Rate limited. Retry ${i + 1}/8 in ${wait}s...`);
                await new Promise(r => setTimeout(r, wait * 1000));
            } else throw err;
        }
    }
}

// ─── Step 1: FLUX Shared Scene ─────────────────────────────────────────────

async function generateSharedScene() {
    console.log('\n🎨 [FLUX] Generating Shared Scene...');

    // We must enforce perfectly frontal faces for SadTalker to not crash, but we angle the bodies inward.
    const prompt = `wide cinematic shot of two philosophers sitting extremely close to each other at a small table under a tree at sunset. Left: male philosopher with short dark spiky hair in red shirt, body turned right. Right: female philosopher with long flowing blue hair in blue dress, body turned left. Both faces are perfectly front-facing, looking directly forward at the camera.`;
    
    // SadTalker needs faces looking directly at the camera.
    const output = await replicateRun('black-forest-labs/flux-schnell', {
        prompt, aspect_ratio: '16:9', output_format: 'jpg', output_quality: 95, seed: 155 // new seed for straight faces
    });
    
    const sceneUrl = extractUrl(output);
    const scenePath = path.join(TMP, 'scene_full.jpg');
    await download(sceneUrl, scenePath);
    console.log(`✅ Scene saved: ${scenePath}`);

    const leftPath = path.join(TMP, 'left.jpg');
    const rightPath = path.join(TMP, 'right.jpg');
    
    // Split perfectly in half
    execSync(`ffmpeg -y -i "${scenePath}" -update 1 -filter:v "crop=iw/2:ih:0:0" "${leftPath}" -loglevel warning`);
    execSync(`ffmpeg -y -i "${scenePath}" -update 1 -filter:v "crop=iw/2:ih:iw/2:0" "${rightPath}" -loglevel warning`);
    
    const leftUp = await cloudinary.uploader.upload(leftPath, { resource_type: 'image' });
    const rightUp = await cloudinary.uploader.upload(rightPath, { resource_type: 'image' });

    return { leftUrl: leftUp.secure_url, rightUrl: rightUp.secure_url };
}

// ─── Step 2: Audio Prep (TTS & Silence) ────────────────────────────────────────

async function synthesise(text, voiceId, idx) {
    console.log(`\n🎙️  [TTS] Generating Audio for Turn ${idx + 1}...`);
    const res = await axios.post(
        'https://api.fish.audio/v1/tts',
        JSON.stringify({ text, reference_id: voiceId, format: 'mp3', mp3_bitrate: 192, latency: 'normal' }),
        { headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    const speechPath = path.join(TMP, `turn${idx + 1}_speech.mp3`);
    fs.writeFileSync(speechPath, Buffer.from(res.data));
    const dur = duration(speechPath);

    const silencePath = path.join(TMP, `turn${idx + 1}_silence.mp3`);
    execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${dur} -q:a 9 -acodec libmp3lame "${silencePath}" -loglevel warning`);

    // SadTalker on Replicate needs public URLs for both image and audio
    const speechUp = await cloudinary.uploader.upload(speechPath, { resource_type: 'auto' });
    const silenceUp = await cloudinary.uploader.upload(silencePath, { resource_type: 'auto' });

    return { dur, speechUrl: speechUp.secure_url, silenceUrl: silenceUp.secure_url, speechPath };
}

// ─── Step 3: Replicate SadTalker Lip-Sync ─────────────────────────────────────

async function generateSadTalker(imageUrl, audioUrl, label) {
    console.log(`🗣️  [SadTalker] Animating ${label}...`);
    
    const output = await replicateRun('cjwbw/sadtalker:3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376', {
        source_image: imageUrl,
        driven_audio: audioUrl,
        still: false, // true = no head movement, false = head movement (like D-ID)
        enhancer: "gfpgan", // face enhancer
        preprocess: "full", // ensures standard bounds
    });

    return extractUrl(output);
}

// ─── Step 4: FFmpeg Seamless Composite ──────────────────────────────────────

function compileTurn(leftVideoPath, rightVideoPath, audioPath, turn, dur, idx) {
    console.log(`🎞️  [FFmpeg] Stitching dual-halves scene for Turn ${idx + 1}...`);
    const out = path.join(TMP, `turn${idx + 1}.mp4`);
    const fps = 25;
    const isMac = process.platform === 'darwin';
    const font = isMac ? '/System/Library/Fonts/Helvetica.ttc' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

    const charColor = turn.speaker === 'left' ? 'FF6666' : '66AAFF';
    const safeLine = turn.line.substring(0, 60).replace(/'/g, "\\'").replace(/\./g, '\\.').replace(/—/g, '-').replace(/:/g, '\\:');

    // SadTalker might return arbitrary sizes depending on the face bounding box.
    // We strictly force scale them to exactly 512x576 before hstacking them back together.
    let filterComplex = `[0:v]scale=512:576,setsar=1[left];[1:v]scale=512:576,setsar=1[right];`;
    filterComplex += `[left][right]hstack=inputs=2[merged];`;
    
    // Upscale the stitched 1024x576 to 1920x1080 (padded to black bars)
    filterComplex += `[merged]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[bg];`;
    
    // Captions
    filterComplex += `[bg]drawtext=text='[ ${turn.character} ]':fontcolor=#${charColor}:fontsize=48:fontfile='${font}':x=(w-text_w)/2:y=800:box=1:boxcolor=black@0.6:boxborderw=12[c1];`;
    filterComplex += `[c1]drawtext=text='${safeLine}':fontcolor=white:fontsize=36:fontfile='${font}':x=(w-text_w)/2:y=900:box=1:boxcolor=black@0.65:boxborderw=10[out]`;

    const cmd = [
        'ffmpeg -y',
        `-i "${leftVideoPath}"`,
        `-i "${rightVideoPath}"`,
        `-i "${audioPath}"`,
        `-filter_complex "${filterComplex}"`,
        `-map "[out]" -map 2:a`,
        `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k`,
        `-r ${fps} -shortest`,
        `"${out}"`,
        `-loglevel warning`,
    ].join(' ');

    execSync(cmd);
    return out;
}

// ─── Step 5: Concat + Cloudinary ─────────────────────────────────────────────

async function finish(turnPaths) {
    console.log('\n🔗 [FFmpeg] Concatenating final dual-halves scene...');
    const list = path.join(TMP, 'list.txt');
    fs.writeFileSync(list, turnPaths.map(p => `file '${p}'`).join('\n'));
    const final = path.join(TMP, 'war_peace_sadtalker.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${list}" -c copy "${final}" -loglevel warning`);

    console.log('☁️  [Cloudinary] Uploading final video...');
    const result = await cloudinary.uploader.upload(final, { resource_type: 'video', public_id: `war_peace_dual_${Date.now()}` });

    console.log(`\n🎉 ===============================================================`);
    console.log(`🎉 DONE! Watch the Dual-Halves Low-Cost version:`);
    console.log(`🎉 ${result.secure_url}`);
    console.log(`🎉 ===============================================================`);
    return result.secure_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log('🚀 War & Peace — Dual-Halves Low-Cost (v10)\n');

    // 1. Generate wide scene and upload halves
    const { leftUrl, rightUrl } = await generateSharedScene();

    // 2. Process each turn
    const compiled = [];
    for (let i = 0; i < TURNS.length; i++) {
        const turn = TURNS[i];
        
        // Audio
        const { dur, speechUrl, silenceUrl, speechPath } = await synthesise(turn.line, turn.voice, i);
        
        const leftAudioUrl = turn.speaker === 'left' ? speechUrl : silenceUrl;
        const rightAudioUrl = turn.speaker === 'right' ? speechUrl : silenceUrl;

        console.log(`\n--- Processing Turn ${i + 1} Dual Videos (${turn.character} speaks) ---`);
        // Trigger both SadTalker animations concurrently
        const [leftVidUrl, rightVidUrl] = await Promise.all([
            generateSadTalker(leftUrl, leftAudioUrl, 'Left Character'),
            generateSadTalker(rightUrl, rightAudioUrl, 'Right Character')
        ]);
        
        const leftVidPath = path.join(TMP, `turn${i + 1}_left.mp4`);
        const rightVidPath = path.join(TMP, `turn${i + 1}_right.mp4`);
        await Promise.all([
            download(leftVidUrl, leftVidPath),
            download(rightVidUrl, rightVidPath)
        ]);
        
        const clip = compileTurn(leftVidPath, rightVidPath, speechPath, turn, dur, i);
        compiled.push(clip);
    }

    // 3. Finish
    await finish(compiled);
})().catch(err => {
    console.error('\n❌', err.message);
    if(err.response) console.error(err.response.data);
    process.exit(1);
});
