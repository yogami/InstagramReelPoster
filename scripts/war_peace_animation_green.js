/**
 * War & Peace — Green Screen Compositing (v8)
 *
 * Both characters in the exact same scene, completely seamless.
 * 
 * Pipeline:
 * 1. FLUX generates an empty background "Set" (a table under a tree at sunset).
 * 2. FLUX generates Arya isolated on a pure neon green background.
 * 3. FLUX generates Seneca isolated on a pure neon green background.
 * 4. We trigger both D-ID videos (one speaking, one silent/listening) against the green screen.
 * 5. FFmpeg keys out the green screen perfectly and composites both characters
 *    into the real shared 3D background. 
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

const TMP = '/tmp/war_peace_v8';
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

cloudinary.config({ cloud_name: CLOUD_NAME, api_key: CLOUD_KEY, api_secret: CLOUD_SECRET });

const TURNS = [
    {
        speaker: 'arya',
        character: 'ARYA',
        voice: ARYA_VOICE,
        line: "War is not failure. It is the forge. Every age of peace was built on the bones of a previous war.",
    },
    {
        speaker: 'seneca',
        character: 'SENECA',
        voice: SENECA_VOICE,
        line: "That is the trap we cannot escape. We burn civilisations and call the ash progress.",
    }
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

async function replicateRun(replicate, model, input) {
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

// ─── Step 1: FLUX Generation (Background + 2 Green Screens) ─────────────────

async function generateAssets(replicate) {
    console.log('\n🎨 [FLUX] Generating Background and Green Screen Characters...');

    // 1. Background Set (9:16 Vertical)
    console.log('   -> Background Set');
    const bgOut = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: `beautiful cinematic empty set. weathered stone dinner table under a giant ancient tree at sunset. gorgeous lighting, sharp focus on the table, blurred background. 9:16 vertical. empty seats. no people.`,
        aspect_ratio: '9:16', output_format: 'png', output_quality: 95, seed: 101
    });
    const bgPath = path.join(TMP, 'background.png');
    await download(extractUrl(bgOut), bgPath);

    // 2. Arya Green Screen (1:1 Square)
    console.log('   -> Arya (Green Screen)');
    const gsPrompt = `perfectly uniform bright neon green background, exact hex #00FF00. perfectly flat even lighting. highly detailed graphic novel style bust portrait. `;
    const aryaOut = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: gsPrompt + `male philosopher with short dark spiky hair in a red shirt, angry intense expression, shoulders visible, facing slightly right towards center.`,
        aspect_ratio: '1:1', output_format: 'png', output_quality: 95, seed: 202
    });
    const aryaPath = path.join(TMP, 'arya_green.png');
    await download(extractUrl(aryaOut), aryaPath);

    // 3. Seneca Green Screen (1:1 Square)
    console.log('   -> Seneca (Green Screen)');
    const senecaOut = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: gsPrompt + `female philosopher with long flowing blue hair in a blue dress, calm serene expression, shoulders visible, facing slightly left towards center.`,
        aspect_ratio: '1:1', output_format: 'png', output_quality: 95, seed: 303
    });
    const senecaPath = path.join(TMP, 'seneca_green.png');
    await download(extractUrl(senecaOut), senecaPath);

    // Pre-upload the portraits to Cloudinary for D-ID
    console.log('☁️  Uploading portraits for D-ID...');
    const aryaUp = await cloudinary.uploader.upload(aryaPath, { resource_type: 'image' });
    const senecaUp = await cloudinary.uploader.upload(senecaPath, { resource_type: 'image' });

    console.log(`✅ Assets ready.`);
    return { bgPath, aryaUrl: aryaUp.secure_url, senecaUrl: senecaUp.secure_url };
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

// ─── Step 4: FFmpeg Chroma Key Composite ──────────────────────────────────────

function compileTurn(bgPath, aryaDidPath, senecaDidPath, audioPath, turn, dur, idx) {
    console.log(`🎞️  [FFmpeg] Compositing living scene for Turn ${idx + 1}...`);
    const out = path.join(TMP, `turn${idx + 1}.mp4`);
    const fps = 25;
    const isMac = process.platform === 'darwin';
    const font = isMac ? '/System/Library/Fonts/Helvetica.ttc' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

    const charColor = turn.speaker === 'arya' ? 'FF6666' : '66AAFF';
    const safeLine = turn.line.substring(0, 60).replace(/'/g, "\\'").replace(/\./g, '\\.').replace(/—/g, '-').replace(/:/g, '\\:');

    // 1. Scale background to 1080x1920 (9:16).
    // 2. Both D-ID videos (1:1 aspect) scaled to 900x900 so they fit as busts on the table.
    // 3. Apply chromakey to remove the green background (0x00FF00) with 0.1 similarity.
    // 4. Overlay Arya on the left side (x= -100, y= 900).
    // 5. Overlay Seneca on the right side (x= 280, y= 900).
    // 6. Apply a slow cinematic 2% zoom to the fully assembled 1080x1920 scene for life.
    // 7. Render captions.

    let filterComplex = `[0:v]scale=1080:1920[bg];`;
    filterComplex += `[1:v]scale=900:900,chromakey=0x00FF00:0.15:0.1[arya_keyed];`;
    filterComplex += `[2:v]scale=900:900,chromakey=0x00FF00:0.15:0.1[seneca_keyed];`;
    
    // Drop Arya onto the background
    filterComplex += `[bg][arya_keyed]overlay=x=-150:y=850[bg2];`;
    // Drop Seneca onto the background next to him
    filterComplex += `[bg2][seneca_keyed]overlay=x=330:y=850[merged];`;
    
    // Slow cinematic zoom on the whole composite
    const frames = Math.ceil(dur * fps);
    filterComplex += `[merged]zoompan=z='min(zoom+0.0005,1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}[zoomed];`;

    // Captions
    filterComplex += `[zoomed]drawtext=text='[ ${turn.character} ]':fontcolor=#${charColor}:fontsize=48:fontfile='${font}':x=(w-text_w)/2:y=300:box=1:boxcolor=black@0.6:boxborderw=12[c1];`;
    filterComplex += `[c1]drawtext=text='${safeLine}':fontcolor=white:fontsize=36:fontfile='${font}':x=(w-text_w)/2:y=1500:box=1:boxcolor=black@0.65:boxborderw=10[out]`;

    const cmd = [
        'ffmpeg -y',
        `-loop 1 -i "${bgPath}"`,
        `-i "${aryaDidPath}"`,
        `-i "${senecaDidPath}"`,
        `-i "${audioPath}"`,
        `-filter_complex "${filterComplex}"`,
        `-map "[out]" -map 3:a`,
        `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k`,
        `-r ${fps} -shortest -t ${dur}`,
        `"${out}"`,
        `-loglevel warning`,
    ].join(' ');

    execSync(cmd);
    return out;
}

// ─── Step 5: Concat + Cloudinary ─────────────────────────────────────────────

async function finish(turnPaths) {
    console.log('\n🔗 [FFmpeg] Concatenating final movie...');
    const list = path.join(TMP, 'list.txt');
    fs.writeFileSync(list, turnPaths.map(p => `file '${p}'`).join('\n'));
    const final = path.join(TMP, 'war_peace_movie.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${list}" -c copy "${final}" -loglevel warning`);

    console.log('☁️  [Cloudinary] Uploading final video...');
    const result = await cloudinary.uploader.upload(final, { resource_type: 'video', public_id: `war_peace_movie_${Date.now()}` });

    console.log(`\n🎉 ===============================================================`);
    console.log(`🎉 DONE! Watch the True Movie version:`);
    console.log(`🎉 ${result.secure_url}`);
    console.log(`🎉 ===============================================================`);
    return result.secure_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log('🚀 War & Peace — Green Screen Movie Environment (v8)\n');

    const replicate = new Replicate({ auth: REPLICATE_KEY });

    // 1. Generate Environment and Green-Screen Actors
    const { bgPath, aryaUrl, senecaUrl } = await generateAssets(replicate);

    // 2. Process each turn
    const compiled = [];
    for (let i = 0; i < TURNS.length; i++) {
        const turn = TURNS[i];
        
        // Audio
        const { dur, speechUrl, silenceUrl, speechPath } = await synthesise(turn.line, turn.voice, i);
        
        // Concurrent D-ID generation (Speaker gets speech, Listener gets silence)
        const aryaAudioUrl = turn.speaker === 'arya' ? speechUrl : silenceUrl;
        const senecaAudioUrl = turn.speaker === 'seneca' ? speechUrl : silenceUrl;

        console.log(`\n--- Processing Turn ${i + 1} Dual Actors ---`);
        const [aryaDidUrl, senecaDidUrl] = await Promise.all([
            callDid(aryaUrl, aryaAudioUrl, 'Arya (Green)'),
            callDid(senecaUrl, senecaAudioUrl, 'Seneca (Green)')
        ]);
        
        const aryaDidPath = path.join(TMP, `turn${i + 1}_arya_did.mp4`);
        const senecaDidPath = path.join(TMP, `turn${i + 1}_seneca_did.mp4`);
        await Promise.all([
            download(aryaDidUrl, aryaDidPath),
            download(senecaDidUrl, senecaDidPath)
        ]);
        
        const clip = compileTurn(bgPath, aryaDidPath, senecaDidPath, speechPath, turn, dur, i);
        compiled.push(clip);
    }

    // 3. Finish
    await finish(compiled);
})().catch(err => {
    console.error('\n❌', err.message);
    if(err.response) console.error(err.response.data);
    process.exit(1);
});
