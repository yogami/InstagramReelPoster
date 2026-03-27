/**
 * War & Peace — Cinematic Cuts (v6)
 *
 * Full Lip-Sync with D-ID, No Green Screen Compositing.
 * 
 * Pipeline:
 * 1. FLUX generates two separate 9:16 "Camera Angle" shots. 
 *    Shot A: Arya in the tavern.
 *    Shot B: Seneca in the same tavern.
 * 2. Fish Audio generates the TTS lines.
 * 3. D-ID API animates the full 9:16 image for the speaking character.
 * 4. FFmpeg applies a slow, continuous "Ken Burns" 3% zoom to the D-ID video 
 *    to make the whole scene feel alive and cinematic.
 * 5. We cut directly between the clips. No frozen split-screens, no green screen halos.
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

const TMP = '/tmp/war_peace_v6';
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
        line: "That is the trap we cannot escape. We burn civilisations and call the ash progress. Restructure society at its roots — war becomes unnecessary.",
    },
    {
        speaker: 'arya',
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

// ─── Step 1: FLUX Cinematic Shots ─────────────────────────────────────────────

async function generateCinematicShots(replicate) {
    console.log('\n🎨 [FLUX] Generating separate cinematic camera shots...');

    const baseEnv = 'dark cinematic worn stone tavern, candlelight, 9:16 vertical framing. intense movie cinematography, shallow depth of field (blurred background). perfectly clear face, character looking directly at the camera.';
    
    // Shot A: Arya
    const aryaOutput = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: `male philosopher with short dark spiky hair in a red collared shirt. angry intense expression. ${baseEnv}`,
        aspect_ratio: '9:16', output_format: 'png', output_quality: 95, seed: 10
    });
    const aryaPath = path.join(TMP, 'shot_arya.png');
    await download(extractUrl(aryaOutput), aryaPath);

    // Shot B: Seneca
    const senecaOutput = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: `female philosopher with long flowing blue hair in a blue dress. calm serene expression. ${baseEnv}`,
        aspect_ratio: '9:16', output_format: 'png', output_quality: 95, seed: 20
    });
    const senecaPath = path.join(TMP, 'shot_seneca.png');
    await download(extractUrl(senecaOutput), senecaPath);

    console.log(`✅ Shots generated and saved.`);
    
    // Upload to Cloudinary for D-ID
    const aryaUp = await cloudinary.uploader.upload(aryaPath, { resource_type: 'image' });
    const senecaUp = await cloudinary.uploader.upload(senecaPath, { resource_type: 'image' });
    
    return { aryaShotUrl: aryaUp.secure_url, senecaShotUrl: senecaUp.secure_url };
}

// ─── Step 2: Fish Audio TTS ───────────────────────────────────────────────────

async function synthesise(text, voiceId, idx) {
    console.log(`\n🎙️  [TTS] Turn ${idx + 1}...`);
    const res = await axios.post(
        'https://api.fish.audio/v1/tts',
        JSON.stringify({ text, reference_id: voiceId, format: 'mp3', mp3_bitrate: 192, latency: 'normal' }),
        { headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
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

// ─── Step 4: FFmpeg Cinematic Composite ──────────────────────────────────────

function compileTurn(dIdVideoPath, audioPath, turn, dur, idx) {
    console.log(`🎞️  [FFmpeg] Applying cinematic movement & captions for Turn ${idx + 1}...`);
    const out = path.join(TMP, `turn${idx + 1}.mp4`);
    const fps = 25;
    const isMac = process.platform === 'darwin';
    const font = isMac ? '/System/Library/Fonts/Helvetica.ttc' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

    const shortLine = turn.line.length > 55 ? turn.line.substring(0, 52) + '...' : turn.line;
    const safeLine = shortLine.replace(/'/g, "\\'").replace(/\./g, '\\.').replace(/—/g, '-').replace(/:/g, '\\:');
    const charColor = turn.speaker === 'arya' ? 'FF6666' : '66AAFF';

    // 1. We take the D-ID video (which is entirely static except for the face).
    // 2. We apply a very slow Ken Burns zoom (1.0 -> 1.05) over the duration of the clip.
    //    This makes the background AND the character feel like a real moving camera shot.
    // 3. We draw the captions.
    
    const frames = Math.ceil(dur * fps);
    
    // D-ID will return the same aspect ratio we fed it (9:16). Let's force it to 1080x1920 to be safe.
    let filterComplex = `[0:v]scale=1080:1920[scaled];`;
    filterComplex += `[scaled]zoompan=z='min(zoom+0.0005,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}[moved];`;
    filterComplex += `[moved]drawtext=text='[ ${turn.character} ]':fontcolor=#${charColor}:fontsize=48:fontfile='${font}':x=(w-text_w)/2:y=300:box=1:boxcolor=black@0.6:boxborderw=12[c1];`;
    filterComplex += `[c1]drawtext=text='${safeLine}':fontcolor=white:fontsize=36:fontfile='${font}':x=(w-text_w)/2:y=1500:box=1:boxcolor=black@0.65:boxborderw=10[out]`;

    const cmd = [
        'ffmpeg -y',
        `-i "${dIdVideoPath}"`,
        `-i "${audioPath}"`,
        `-filter_complex "${filterComplex}"`,
        `-map "[out]" -map 1:a`,
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
    console.log('\n🔗 [FFmpeg] Concatenating cuts...');
    const list = path.join(TMP, 'list.txt');
    fs.writeFileSync(list, turnPaths.map(p => `file '${p}'`).join('\n'));
    const final = path.join(TMP, 'war_peace_cinematic.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${list}" -c copy "${final}" -loglevel warning`);

    console.log('☁️  [Cloudinary] Uploading final video...');
    const result = await cloudinary.uploader.upload(final, { resource_type: 'video', public_id: `war_peace_cine_${Date.now()}` });

    console.log(`\n🎉 ===============================================================`);
    console.log(`🎉 DONE! Watch the cinematic cut:`);
    console.log(`🎉 ${result.secure_url}`);
    console.log(`🎉 ===============================================================`);
    return result.secure_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log('🚀 War & Peace — Cinematic Cuts (v6)\n');

    const replicate = new Replicate({ auth: REPLICATE_KEY });

    // 1. Generate the two camera shots
    const shots = await generateCinematicShots(replicate);

    // 2. Process each turn
    const compiled = [];
    for (let i = 0; i < TURNS.length; i++) {
        const turn = TURNS[i];
        
        const { audioPath, dur } = await synthesise(turn.line, turn.voice, i);
        
        console.log(`☁️  Uploading TTS for D-ID...`);
        const audioUp = await cloudinary.uploader.upload(audioPath, { resource_type: 'auto' });
        
        const shotUrl = turn.speaker === 'arya' ? shots.aryaShotUrl : shots.senecaShotUrl;
        const didVideoUrl = await generateDidVideo(shotUrl, audioUp.secure_url);
        
        const didPath = path.join(TMP, `turn${i + 1}_did.mp4`);
        await download(didVideoUrl, didPath);
        
        const clip = compileTurn(didPath, audioPath, turn, dur, i);
        compiled.push(clip);
    }

    // 3. Finish
    await finish(compiled);
})().catch(err => {
    console.error('\n❌', err.message);
    if(err.response) console.error(err.response.data);
    process.exit(1);
});
