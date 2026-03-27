/**
 * War & Peace — Seamless Dual Animation (v7)
 *
 * Both characters in the exact same scene. Both characters feel "alive" 100% of the time.
 * 
 * Pipeline:
 * 1. FLUX generates a SINGLE 1:1 image of both characters at a table.
 * 2. We split it into Left (Arya) and Right (Seneca).
 * 3. We generate TTS for the speaker. We also generate a "Silence" audio file of the exact same length.
 * 4. We call D-ID **TWICE** per turn:
 *    - Speaker gets the real dialogue audio (lips sync to speech).
 *    - Listener gets the silent audio (D-ID makes them blink, breathe, and move their head slightly, so they aren't frozen).
 * 5. FFmpeg stitches both moving D-ID videos back together. 
 * 
 * Result: A single seamless scene where one person talks, the other listens and blinks, 
 * and it feels like a real movie set.
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
const DID_API_KEY    = process.env.D_ID_API_KEY;

const ARYA_VOICE     = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';
const SENECA_VOICE   = process.env.FISH_AUDIO_SCENARIO_FEMALE_VOICE_ID || '3895f5f7c6ac43f092bec1b2c04f431f';

const TMP = '/tmp/war_peace_v7';
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

cloudinary.config({ cloud_name: CLOUD_NAME, api_key: CLOUD_KEY, api_secret: CLOUD_SECRET });

const TURNS = [
    {
        speaker: 'left',
        character: 'ARYA',
        voice: ARYA_VOICE,
        line: "War is not failure. It is the forge. Every age of peace was built on the bones of a previous war.",
    },
    {
        speaker: 'right',
        character: 'SENECA',
        voice: SENECA_VOICE,
        line: "That is the trap we cannot escape. We burn civilisations and call the ash progress.",
    }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractUrl(output) {
    if (Array.isArray(output)) {
        const item = output[0];
        if (item?.url && typeof item.url === 'function') return String(item.url());
        return typeof item === 'string' ? item : String(item);
    }
    if (typeof output === 'string') return output;
    if (output?.url && typeof output.url === 'function') return String(output.url());
    return String(output);
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

async function replicateRun(replicate, model, input) {
    for (let i = 1; i <= 8; i++) {
        try { return await replicate.run(model, { input }); } catch (err) {
            const msg = String(err.message || '');
            if ((msg.includes('429') || msg.includes('throttled')) && i < 8) {
                const secs = (msg.match(/resets in ~(\d+)s/) || [])[1];
                const wait = secs ? +secs + 3 : 12;
                console.warn(`  ⚠  Rate limited. Retry ${i + 1}/8 in ${wait}s...`);
                await new Promise(r => setTimeout(r, wait * 1000));
            } else throw err;
        }
    }
}

// ─── Step 1: FLUX Shared Scene ─────────────────────────────────────────────

async function generateSharedScene(replicate) {
    console.log('\n🎨 [FLUX] Generating Shared Scene...');

    const prompt = `wide shot of two philosophers sitting very close to each other at a small weathered stone table under a giant ancient tree during sunset. On the left is a male philosopher with short dark spiky hair in a red shirt. On the right is a female philosopher with long flowing blue hair in a blue dress. symmetric composition. high quality cinematic illustration. clear faces looking forward.`;
    
    const output = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt, aspect_ratio: '16:9', output_format: 'png', output_quality: 95, seed: 188
    });
    
    const sceneUrl = extractUrl(output);
    const scenePath = path.join(TMP, 'scene_full.png');
    await download(sceneUrl, scenePath);
    console.log(`✅ Scene saved: ${scenePath}`);

    const leftPath = path.join(TMP, 'left.png');
    const rightPath = path.join(TMP, 'right.png');
    
    // Split perfectly in half
    execSync(`ffmpeg -y -i "${scenePath}" -update 1 -filter:v "crop=iw/2:ih:0:0" "${leftPath}" -loglevel warning`);
    execSync(`ffmpeg -y -i "${scenePath}" -update 1 -filter:v "crop=iw/2:ih:iw/2:0" "${rightPath}" -loglevel warning`);
    
    const leftUp = await cloudinary.uploader.upload(leftPath, { resource_type: 'image' });
    const rightUp = await cloudinary.uploader.upload(rightPath, { resource_type: 'image' });

    return { scenePath, leftUrl: leftUp.secure_url, rightUrl: rightUp.secure_url };
}

// ─── Step 2: Audio Prep (TTS & Silence) ────────────────────────────────────────

async function synthesise(text, voiceId, idx) {
    console.log(`\n🎙️  [TTS] Generating Turn ${idx + 1}...`);
    const res = await axios.post(
        'https://api.fish.audio/v1/tts',
        JSON.stringify({ text, reference_id: voiceId, format: 'mp3', mp3_bitrate: 192, latency: 'normal' }),
        { headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    const speechPath = path.join(TMP, `turn${idx + 1}_speech.mp3`);
    fs.writeFileSync(speechPath, Buffer.from(res.data));
    const dur = duration(speechPath);

    // Generate SILENT audio of the exact same duration for the listening character
    const silencePath = path.join(TMP, `turn${idx + 1}_silence.mp3`);
    execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${dur} -q:a 9 -acodec libmp3lame "${silencePath}" -loglevel warning`);

    // Upload both to Cloudinary for D-ID
    const speechUp = await cloudinary.uploader.upload(speechPath, { resource_type: 'auto' });
    const silenceUp = await cloudinary.uploader.upload(silencePath, { resource_type: 'auto' });

    return { dur, speechUrl: speechUp.secure_url, silenceUrl: silenceUp.secure_url, speechPath };
}

// ─── Step 3: D-ID Lip-Sync Generator ──────────────────────────────────────────

async function callDid(imageUrl, audioUrl, label) {
    console.log(`🗣️  [D-ID] Creating video for: ${label}`);
    const authHeaders = {
        'Authorization': `Basic ${Buffer.from(DID_API_KEY).toString('base64')}`,
        'Content-Type': 'application/json'
    };
    
    const response = await axios.post('https://api.d-id.com/talks', {
        source_url: imageUrl,
        script: { type: 'audio', audio_url: audioUrl },
        config: { fluent: true, pad_audio: 0.0, align_driver: true }
    }, { headers: authHeaders });
    
    const id = response.data.id;
    let resultUrl = null;
    while (!resultUrl) {
        await new Promise(r => setTimeout(r, 3000));
        const check = await axios.get(`https://api.d-id.com/talks/${id}`, { headers: authHeaders });
        if (check.data.status === 'done') resultUrl = check.data.result_url;
        else if (check.data.status === 'error') throw new Error(`D-ID Error: ${JSON.stringify(check.data)}`);
        else if (check.data.status === 'rejected') throw new Error(`D-ID Rejected image.`);
    }
    return resultUrl;
}

// ─── Step 4: FFmpeg Seamless Composite ──────────────────────────────────────

function compileTurn(leftDidPath, rightDidPath, audioPath, turn, dur, idx) {
    console.log(`🎞️  [FFmpeg] Stitching living videos for Turn ${idx + 1}...`);
    const out = path.join(TMP, `turn${idx + 1}.mp4`);
    const fps = 25;
    const isMac = process.platform === 'darwin';
    const font = isMac ? '/System/Library/Fonts/Helvetica.ttc' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

    const charColor = turn.speaker === 'left' ? 'FF6666' : '66AAFF';
    const safeLine = turn.line.substring(0, 60).replace(/'/g, "\\'").replace(/\./g, '\\.').replace(/—/g, '-').replace(/:/g, '\\:');

    // Both left and right inputs are living D-ID videos.
    // D-ID might scale them slightly, so we force scale to 512x576 exactly before hstack.
    let filterComplex = `[0:v]scale=512:576[left];[1:v]scale=512:576[right];`;
    filterComplex += `[left][right]hstack=inputs=2[merged];`;
    
    // We upscale the resulting 1024x576 back to a standard 1080p horizontal or crop for vertical.
    // Let's keep it horizontal (1920x1080) with pad to feel like a movie scene.
    filterComplex += `[merged]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[bg];`;
    filterComplex += `[bg]drawtext=text='[ ${turn.character} ]':fontcolor=#${charColor}:fontsize=48:fontfile='${font}':x=(w-text_w)/2:y=800:box=1:boxcolor=black@0.6:boxborderw=12[c1];`;
    filterComplex += `[c1]drawtext=text='${safeLine}':fontcolor=white:fontsize=36:fontfile='${font}':x=(w-text_w)/2:y=900:box=1:boxcolor=black@0.65:boxborderw=10[out]`;

    const cmd = [
        'ffmpeg -y',
        `-i "${leftDidPath}"`,
        `-i "${rightDidPath}"`,
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
    console.log('\n🔗 [FFmpeg] Concatenating final seamless scene...');
    const list = path.join(TMP, 'list.txt');
    fs.writeFileSync(list, turnPaths.map(p => `file '${p}'`).join('\n'));
    const final = path.join(TMP, 'war_peace_seamless.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${list}" -c copy "${final}" -loglevel warning`);

    console.log('☁️  [Cloudinary] Uploading final video...');
    const result = await cloudinary.uploader.upload(final, { resource_type: 'video', public_id: `war_peace_seamless_${Date.now()}` });

    console.log(`\n🎉 ===============================================================`);
    console.log(`🎉 DONE! Watch the Seamless Alive version:`);
    console.log(`🎉 ${result.secure_url}`);
    console.log(`🎉 ===============================================================`);
    return result.secure_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log('🚀 War & Peace — Seamless Dual Animation (v7)\n');

    const replicate = new Replicate({ auth: REPLICATE_KEY });

    // 1. Generate wide scene and upload halves
    const { leftUrl, rightUrl } = await generateSharedScene(replicate);

    // 2. Process each turn
    const compiled = [];
    for (let i = 0; i < TURNS.length; i++) {
        const turn = TURNS[i];
        
        // Audio
        const { dur, speechUrl, silenceUrl, speechPath } = await synthesise(turn.line, turn.voice, i);
        
        // We trigger both D-ID videos concurrently:
        const leftAudioUrl = turn.speaker === 'left' ? speechUrl : silenceUrl;
        const rightAudioUrl = turn.speaker === 'right' ? speechUrl : silenceUrl;

        console.log(`\n--- Processing Turn ${i + 1} Dual Videos ---`);
        const [leftDidUrl, rightDidUrl] = await Promise.all([
            callDid(leftUrl, leftAudioUrl, 'Left Character'),
            callDid(rightUrl, rightAudioUrl, 'Right Character')
        ]);
        
        const leftDidPath = path.join(TMP, `turn${i + 1}_left_did.mp4`);
        const rightDidPath = path.join(TMP, `turn${i + 1}_right_did.mp4`);
        await Promise.all([
            download(leftDidUrl, leftDidPath),
            download(rightDidUrl, rightDidPath)
        ]);
        
        const clip = compileTurn(leftDidPath, rightDidPath, speechPath, turn, dur, i);
        compiled.push(clip);
    }

    // 3. Finish
    await finish(compiled);
})().catch(err => {
    console.error('\n❌', err.message);
    if(err.response) console.error(err.response.data);
    process.exit(1);
});
