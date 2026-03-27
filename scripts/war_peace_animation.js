/**
 * War & Peace — Professional Option (v5)
 *
 * Full Lip-Sync with D-ID in a Shared Scene.
 * 
 * Pipeline:
 * 1. FLUX generates a SINGLE 1:1 image of BOTH characters sitting together at a table.
 * 2. FFmpeg splits the image exactly down the middle: left.png (ARYA) and right.png (SENECA).
 * 3. Fish Audio generates the TTS line.
 * 4. D-ID API animates the relevant half-image (since it only supports 1 face per image).
 * 5. FFmpeg hstacks the animated half with the static other half back into a full 1024x1024 scene.
 * 6. We crop the 1024x1024 square to 576x1024 (9:16 aspect ratio) focusing on the center table.
 * 7. Overlay captions and concatenate.
 */

require('dotenv').config();
const Replicate = require('replicate');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FISH_API_KEY   = process.env.FISH_AUDIO_API_KEY;
const CLOUD_NAME     = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUD_KEY      = process.env.CLOUDINARY_API_KEY;
const CLOUD_SECRET   = process.env.CLOUDINARY_API_SECRET;
const REPLICATE_KEY  = process.env.REPLICATE_API_TOKEN;
const DID_API_KEY    = process.env.D_ID_API_KEY;

const ARYA_VOICE     = process.env.FISH_AUDIO_VOICE_ID             || '716594c03801446bb87a964a1c2a5895';
const SENECA_VOICE   = process.env.FISH_AUDIO_SCENARIO_FEMALE_VOICE_ID || '3895f5f7c6ac43f092bec1b2c04f431f';

const TMP = '/tmp/war_peace_v5';
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

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
        line: "That is the trap we cannot escape. We burn civilisations and call the ash progress. Restructure society at its roots — war becomes unnecessary.",
    },
    {
        speaker: 'left',
        character: 'ARYA',
        voice: ARYA_VOICE,
        line: "Remove the fire... and you remove the will to survive. Cycles are not failure. They are our nature.",
    },
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
    return parseFloat(
        execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${p}"`).toString().trim()
    );
}

async function replicateRun(replicate, model, input) {
    for (let i = 1; i <= 8; i++) {
        try {
            return await replicate.run(model, { input });
        } catch (err) {
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

// ─── Step 1: FLUX Shared Scene & Splits ───────────────────────────────────────

async function generateSharedScene(replicate) {
    console.log('\n🎨 [FLUX] Generating Shared Scene...');

    // We constrain them to the center so the 9:16 crop covers both faces nicely
    const prompt = `two philosophers sitting very close to each other at a small weathered stone table, both facing the camera in a dramatic candlelit room. On the left side is a male philosopher with short dark spiky hair in a red shirt with an intense expression. On the right side is a female philosopher with long flowing blue hair in a blue dress with a serene expression. their shoulders are almost touching in the center of the frame. clean graphic novel style, symmetric composition, perfect clear faces.`;
    
    const output = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt, aspect_ratio: '1:1', output_format: 'png', output_quality: 95, seed: 104,
    });
    
    const sceneUrl = extractUrl(output);
    const scenePath = path.join(TMP, 'scene_1024.png');
    await download(sceneUrl, scenePath);
    console.log(`✅ Scene saved: ${scenePath}`);

    // Split down the middle
    const leftPath = path.join(TMP, 'arya_left.png');
    const rightPath = path.join(TMP, 'seneca_right.png');
    
    // FFmpeg 1:1 (roughly 1024x1024) -> 512x1024 left and right
    execSync(`ffmpeg -y -i "${scenePath}" -update 1 -filter:v "crop=iw/2:ih:0:0" "${leftPath}" -loglevel warning`);
    execSync(`ffmpeg -y -i "${scenePath}" -update 1 -filter:v "crop=iw/2:ih:iw/2:0" "${rightPath}" -loglevel warning`);
    console.log(`✅ Split generated: left and right halves`);
    
    return { scenePath, leftPath, rightPath };
}

// ─── Step 2: Fish Audio TTS ───────────────────────────────────────────────────

async function synthesise(text, voiceId, idx) {
    console.log(`\n🎙️  [TTS] Turn ${idx + 1}...`);
    const res = await axios.post(
        'https://api.fish.audio/v1/tts',
        JSON.stringify({ text, reference_id: voiceId, format: 'mp3', mp3_bitrate: 192, latency: 'normal' }),
        {
            headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' },
            responseType: 'arraybuffer',
        }
    );
    const audioPath = path.join(TMP, `turn${idx + 1}_audio.mp3`);
    fs.writeFileSync(audioPath, Buffer.from(res.data));
    return { audioPath, dur: duration(audioPath) };
}

// ─── Step 3: D-ID Lip-Sync Generator ──────────────────────────────────────────

async function generateDidVideo(imageUrl, audioUrl) {
    console.log(`🗣️  [D-ID] Creating lip-sync video...`);
    const authHeaders = {
        'Authorization': `Basic ${Buffer.from(DID_API_KEY).toString('base64')}`,
        'Content-Type': 'application/json'
    };
    
    const requestBody = {
        source_url: imageUrl,
        script: { type: 'audio', audio_url: audioUrl },
        config: { fluent: true, pad_audio: 0.0, align_driver: true }
    };
    
    const response = await axios.post('https://api.d-id.com/talks', requestBody, { headers: authHeaders });
    const id = response.data.id;

    let resultUrl = null;
    while (!resultUrl) {
        await new Promise(r => setTimeout(r, 3000));
        const check = await axios.get(`https://api.d-id.com/talks/${id}`, { headers: authHeaders });
        if (check.data.status === 'done') resultUrl = check.data.result_url;
        else if (check.data.status === 'error') throw new Error(`D-ID Error: ${JSON.stringify(check.data)}`);
        else if (check.data.status === 'rejected') throw new Error(`D-ID Rejected image (no face found).`);
    }
    console.log(`✅ D-ID Video ready`);
    return resultUrl;
}

// ─── Step 4: FFmpeg Composite ────────────────────────────────────────────────

function compileTurn(dIdVideoPath, leftStaticPath, rightStaticPath, turn, dur, idx) {
    console.log(`🎞️  [FFmpeg] Compiling Turn ${idx + 1} (${turn.character} speaks)...`);
    const out = path.join(TMP, `turn${idx + 1}.mp4`);
    
    const isMac = process.platform === 'darwin';
    const font = isMac ? '/System/Library/Fonts/Helvetica.ttc' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    const isLeft = turn.speaker === 'left';
    const charColor = isLeft ? 'FF6666' : '66AAFF';

    const shortLine = turn.line.length > 55 ? turn.line.substring(0, 52) + '...' : turn.line;
    const safeLine = shortLine.replace(/'/g, "\\'").replace(/\./g, '\\.').replace(/—/g, '-').replace(/:/g, '\\:');
    const safeChar = turn.character.replace(/'/g, "\\'");

    let filterComplex = '';
    
    // Force inputs to exactly 512x1024 so hstack doesn't fail if D-ID resizes
    filterComplex += `[0:v]scale=512:1024[vid];`;
    filterComplex += `[1:v]scale=512:1024[stat];`;
    
    if (isLeft) {
        filterComplex += `[vid][stat]hstack=inputs=2[full];`;
    } else {
        filterComplex += `[stat][vid]hstack=inputs=2[full];`;
    }
    
    // crop to 9:16 aspect ratio (576x1024) from the center
    filterComplex += `[full]crop=576:1024:224:0[cropped];`;
    
    // upscale to 1080x1920 to keep standard resolution
    filterComplex += `[cropped]scale=1080:1920[scaled];`;
    
    // Captions (scaled frame is 1080 wide)
    filterComplex += `[scaled]drawtext=text='[ ${safeChar} ]':fontcolor=#${charColor}:fontsize=48:fontfile='${font}':x=(w-text_w)/2:y=300:box=1:boxcolor=black@0.6:boxborderw=12[c1];`;
    filterComplex += `[c1]drawtext=text='${safeLine}':fontcolor=white:fontsize=36:fontfile='${font}':x=(w-text_w)/2:y=1500:box=1:boxcolor=black@0.65:boxborderw=10[out]`;

    const cmd = [
        'ffmpeg -y',
        `-i "${dIdVideoPath}"`,                     // [0:v] Speaker
        `-loop 1 -i "${isLeft ? rightStaticPath : leftStaticPath}"`, // [1:v] Static
        `-i "${audioPath}"`,                        // [2:a] Audio (we pass it directly)
        `-filter_complex "${filterComplex}"`,
        `-map "[out]" -map 2:a`,
        `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k`,
        `-r 25 -shortest -t ${dur}`,
        `"${out}"`,
        `-loglevel warning`,
    ].join(' ');

    execSync(cmd);
    return out;
}

// ─── Step 5: Concat + Cloudinary ─────────────────────────────────────────────

async function finish(turnPaths) {
    console.log('\n🔗 [FFmpeg] Concatenating turns...');
    const list = path.join(TMP, 'list.txt');
    fs.writeFileSync(list, turnPaths.map(p => `file '${p}'`).join('\n'));
    const final = path.join(TMP, 'war_peace_v5_shared.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${list}" -c copy "${final}" -loglevel warning`);

    console.log('☁️  [Cloudinary] Uploading...');
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: CLOUD_NAME, api_key: CLOUD_KEY, api_secret: CLOUD_SECRET });
    const result = await cloudinary.uploader.upload(final, { resource_type: 'video', public_id: `war_peace_shared_${Date.now()}` });

    console.log(`\n🎉 ===============================================================`);
    console.log(`🎉 DONE!`);
    console.log(`🎉 ${result.secure_url}`);
    console.log(`🎉 ===============================================================`);
    return result.secure_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
let audioPath = ''; // Scope for ffmpg

(async () => {
    console.log('🚀 War & Peace — Shared Scene Lip-Sync (v5)\n');

    const replicate = new Replicate({ auth: REPLICATE_KEY });
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: CLOUD_NAME, api_key: CLOUD_KEY, api_secret: CLOUD_SECRET });

    // 1. Generate & Split Scene
    const { leftPath, rightPath } = await generateSharedScene(replicate);
    
    console.log(`☁️  Uploading split halves to Cloudinary...`);
    const leftUp = await cloudinary.uploader.upload(leftPath, { resource_type: 'image' });
    const rightUp = await cloudinary.uploader.upload(rightPath, { resource_type: 'image' });

    // 2. Process each turn
    const compiled = [];
    for (let i = 0; i < TURNS.length; i++) {
        const turn = TURNS[i];
        
        const tts = await synthesise(turn.line, turn.voice, i);
        audioPath = tts.audioPath; // Update module-scoped variable for compileTurn
        
        console.log(`☁️  Uploading TTS string...`);
        const audioUp = await cloudinary.uploader.upload(audioPath, { resource_type: 'video' }); // audio acts as video in cloudinary uploads sometimes, but let's use auto
        
        const speakingImageUrl = turn.speaker === 'left' ? leftUp.secure_url : rightUp.secure_url;
        
        // Pass to D-ID
        // D-ID needs reliable public audio url. we specify resource_type auto just in case.
        const audioSecure = await cloudinary.uploader.upload(tts.audioPath, { resource_type: 'auto' });
        const didVideoUrl = await generateDidVideo(speakingImageUrl, audioSecure.secure_url);
        
        const didPath = path.join(TMP, `turn${i + 1}_did.mp4`);
        await download(didVideoUrl, didPath);
        
        const clip = compileTurn(didPath, leftPath, rightPath, turn, tts.dur, i);
        compiled.push(clip);
    }

    // 3. Finish
    await finish(compiled);
})().catch(err => {
    console.error('\n❌', err.message);
    if(err.response) console.error(err.response.data);
    process.exit(1);
});
