/**
 * War & Peace — Sprite Swapping Movie Set (v9)
 *
 * Implements the "Stoic Cole" professional creator architecture.
 * ZERO API video cost. 100% audio-reactive lip sync.
 * 
 * Pipeline:
 * 1. FLUX generates the Background Set + Green Screen assets:
 *    - Arya (Mouth Closed), Arya (Mouth Open)
 *    - Seneca (Mouth Closed), Seneca (Mouth Open)
 * 2. Fish Audio generates the TTS line.
 * 3. We use FFmpeg to convert the audio to raw PCM (1000 Hz) to analyze the waveform volume.
 * 4. We build an FFmpeg concat demuxer file: for every 1/25th of a second (1 frame), 
 *    if the volume spikes, we show Mouth Open. If quiet, Mouth Closed.
 * 5. FFmpeg composites the dynamically speaking character and the silent listener 
 *    (green-screen keyed) seamlessly onto the background with a cinematic zoom.
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

const TMP = '/tmp/war_peace_v9';
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

// ─── Step 1: FLUX Generation (Background + Sprites) ──────────────────────────

async function generateAssets(replicate) {
    console.log('\n🎨 [FLUX] Generating Background and Sprite Assets...');

    // 1. Background Set
    console.log('   -> Background Set');
    const bgOut = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: `beautiful cinematic empty set. weathered stone dinner table under a giant ancient tree at sunset. gorgeous lighting, sharp focus on the table, blurred background. 9:16 vertical. empty seats. no people.`,
        aspect_ratio: '9:16', output_format: 'png', output_quality: 95, seed: 101
    });
    const bgPath = path.join(TMP, 'background.png');
    await download(extractUrl(bgOut), bgPath);

    const gsPrompt = `perfectly uniform bright neon green background, exact hex #00FF00. seamlessly flat even lighting without shadows. highly detailed graphic novel style bust portrait. `;
    
    // 2. Arya Sprites
    console.log('   -> Arya (Mouth Closed)');
    const aryaClosed = path.join(TMP, 'arya_closed.png');
    const outA1 = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: gsPrompt + `male philosopher with short dark spiky hair in a red shirt, angry intense expression, MOUTH FIRMLY CLOSED, shoulders visible, facing slightly right towards center.`,
        aspect_ratio: '1:1', output_format: 'png', output_quality: 95, seed: 400
    });
    await download(extractUrl(outA1), aryaClosed);

    console.log('   -> Arya (Mouth Open)');
    const aryaOpen = path.join(TMP, 'arya_open.png');
    const outA2 = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: gsPrompt + `male philosopher with short dark spiky hair in a red shirt, angry intense expression, MOUTH WIDE OPEN SPEAKING LOUDLY, shoulders visible, facing slightly right towards center.`,
        aspect_ratio: '1:1', output_format: 'png', output_quality: 95, seed: 400 // same seed for consistency
    });
    await download(extractUrl(outA2), aryaOpen);

    // 3. Seneca Sprites
    console.log('   -> Seneca (Mouth Closed)');
    const senecaClosed = path.join(TMP, 'seneca_closed.png');
    const outS1 = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: gsPrompt + `female philosopher with long flowing blue hair in a blue dress, calm serene expression, MOUTH FIRMLY CLOSED, shoulders visible, facing slightly left towards center.`,
        aspect_ratio: '1:1', output_format: 'png', output_quality: 95, seed: 500
    });
    await download(extractUrl(outS1), senecaClosed);

    console.log('   -> Seneca (Mouth Open)');
    const senecaOpen = path.join(TMP, 'seneca_open.png');
    const outS2 = await replicateRun(replicate, 'black-forest-labs/flux-schnell', {
        prompt: gsPrompt + `female philosopher with long flowing blue hair in a blue dress, calm serene expression, MOUTH WIDE OPEN SPEAKING LOUDLY, shoulders visible, facing slightly left towards center.`,
        aspect_ratio: '1:1', output_format: 'png', output_quality: 95, seed: 500 // same seed
    });
    await download(extractUrl(outS2), senecaOpen);

    console.log(`✅ Assets ready.`);
    return {
        bgPath,
        aryaSprites: { closed: aryaClosed, open: aryaOpen },
        senecaSprites: { closed: senecaClosed, open: senecaOpen }
    };
}

// ─── Step 2: Audio Prep & Waveform Analysis (The Magic) ─────────────────────

async function processAudioSpriteAnimation(text, voiceId, idx, openSpritePath, closedSpritePath) {
    console.log(`\n🎙️  [TTS & Audio Analysis] Turn ${idx + 1}...`);
    
    // A. Generate Audio
    const res = await axios.post(
        'https://api.fish.audio/v1/tts',
        JSON.stringify({ text, reference_id: voiceId, format: 'mp3', mp3_bitrate: 192, latency: 'normal' }),
        { headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    const audioPath = path.join(TMP, `turn${idx + 1}.mp3`);
    fs.writeFileSync(audioPath, Buffer.from(res.data));
    const dur = duration(audioPath);

    // B. Extract raw PCM volume (8-bit signed, 1000 Hz)
    const pcmPath = path.join(TMP, `turn${idx + 1}.pcm`);
    execSync(`ffmpeg -y -i "${audioPath}" -f s8 -ac 1 -ar 1000 -acodec pcm_s8 "${pcmPath}" -loglevel warning`);
    
    // C. Analyze volume per frame (assuming 25 FPS)
    const fps = 25;
    const samplesPerFrame = 1000 / fps; // 40 samples per frame
    const pcmBuffer = fs.readFileSync(pcmPath);
    
    let concatData = '';
    const VOLUME_THRESHOLD = 15; // out of 127
    
    for (let i = 0; i < pcmBuffer.length; i += samplesPerFrame) {
        let maxVol = 0;
        let chunkEnd = Math.min(i + samplesPerFrame, pcmBuffer.length);
        
        for (let j = i; j < chunkEnd; j++) {
            let val = pcmBuffer[j];
            if (val > 127) val = 256 - val; // two's complement absolute value for s8
            if (val > maxVol) maxVol = val;
        }
        
        // If volume exceeds threshold, character opens mouth
        const sprite = maxVol > VOLUME_THRESHOLD ? openSpritePath : closedSpritePath;
        concatData += `file '${sprite}'\nduration ${1.0 / fps}\n`;
    }
    
    // D. Write concat.txt and render the sprite animation video
    const concatPath = path.join(TMP, `turn${idx + 1}_concat.txt`);
    fs.writeFileSync(concatPath, concatData);
    
    const spriteVideoPath = path.join(TMP, `turn${idx + 1}_sprite.mp4`);
    // Render the silent sprite animation (we apply audio later during compositing)
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c:v libx264 -pix_fmt yuv420p -r ${fps} "${spriteVideoPath}" -loglevel warning`);

    console.log(`✅ Audio Analysis: Rendered ${spriteVideoPath} perfectly synced to waveform.`);
    return { audioPath, spriteVideoPath, dur };
}

// ─── Step 3: FFmpeg Chroma Key Composite ──────────────────────────────────────

function compileTurn(bgPath, speakerVideoPath, listenerStaticPath, audioPath, turn, dur, idx) {
    console.log(`🎞️  [FFmpeg] Compositing living scene for Turn ${idx + 1}...`);
    const out = path.join(TMP, `turn${idx + 1}_final.mp4`);
    const fps = 25;
    const isMac = process.platform === 'darwin';
    const font = isMac ? '/System/Library/Fonts/Helvetica.ttc' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

    const charColor = turn.speaker === 'arya' ? 'FF6666' : '66AAFF';
    const safeLine = turn.line.substring(0, 60).replace(/'/g, "\\'").replace(/\./g, '\\.').replace(/—/g, '-').replace(/:/g, '\\:');

    // 1. Scale background to 1080x1920 (9:16).
    // 2. Both characters scaled to 900x900.
    // 3. Chromakey out the green (0x00FF00). Despill handles green halo bleed.
    // 4. Position: Arya (Left, x=-150), Seneca (Right, x=330).
    // 5. Apply cinematic zoom.
    
    const aryaInput = turn.speaker === 'arya' ? `[1:v]` : `[2:v]`;
    const senecaInput = turn.speaker === 'seneca' ? `[1:v]` : `[2:v]`;

    let filterComplex = `[0:v]scale=1080:1920[bg];`;
    filterComplex += `${aryaInput}scale=900:900,chromakey=0x00FF00:0.15:0.0[arya_keyed];`;
    filterComplex += `${senecaInput}scale=900:900,chromakey=0x00FF00:0.15:0.0[seneca_keyed];`;
    
    // Despill to remove green reflections from skin/hair (a bit of red/blue balance)
    filterComplex += `[arya_keyed]colorchannelmixer=rr=1:gg=0:bb=0:rg=0.5:bg=0.5:gb=1:br=0:br=1[arya_clean];`;
    filterComplex += `[seneca_keyed]colorchannelmixer=rr=1:gg=0:bb=0:rg=0.5:bg=0.5:gb=1:br=0:br=1[seneca_clean];`;
    
    // Composite
    filterComplex += `[bg][arya_clean]overlay=x=-150:y=850[bg2];`;
    filterComplex += `[bg2][seneca_clean]overlay=x=330:y=850[merged];`;
    
    // Cinematic Zoom
    const frames = Math.ceil(dur * fps);
    filterComplex += `[merged]zoompan=z='min(zoom+0.0005,1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}[zoomed];`;

    // Captions
    filterComplex += `[zoomed]drawtext=text='[ ${turn.character} ]':fontcolor=#${charColor}:fontsize=48:fontfile='${font}':x=(w-text_w)/2:y=300:box=1:boxcolor=black@0.6:boxborderw=12[c1];`;
    filterComplex += `[c1]drawtext=text='${safeLine}':fontcolor=white:fontsize=36:fontfile='${font}':x=(w-text_w)/2:y=1500:box=1:boxcolor=black@0.65:boxborderw=10[out]`;

    // Mapping:
    // 0: background
    // 1: speaker moving video
    // 2: listener static image

    const cmd = [
        'ffmpeg -y',
        `-loop 1 -i "${bgPath}"`,
        `-i "${speakerVideoPath}"`,
        `-loop 1 -i "${listenerStaticPath}"`,
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

// ─── Step 4: Concat + Cloudinary ─────────────────────────────────────────────

async function finish(turnPaths) {
    console.log('\n🔗 [FFmpeg] Concatenating final movie...');
    const list = path.join(TMP, 'list.txt');
    fs.writeFileSync(list, turnPaths.map(p => `file '${p}'`).join('\n'));
    const final = path.join(TMP, 'war_peace_creator_style.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${list}" -c copy "${final}" -loglevel warning`);

    console.log('☁️  [Cloudinary] Uploading final video...');
    const result = await cloudinary.uploader.upload(final, { resource_type: 'video', public_id: `war_peace_creator_${Date.now()}` });

    console.log(`\n🎉 ===============================================================`);
    console.log(`🎉 DONE! Watch the Zero-Cost Creator Style version:`);
    console.log(`🎉 ${result.secure_url}`);
    console.log(`🎉 ===============================================================`);
    return result.secure_url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
    console.log('🚀 War & Peace — Zero-Cost Volume Sprite Swapper (v9)\n');

    const replicate = new Replicate({ auth: REPLICATE_KEY });

    // 1. Generate Environment and Green-Screen Sprites
    const assets = await generateAssets(replicate);

    // 2. Process each turn
    const compiled = [];
    for (let i = 0; i < TURNS.length; i++) {
        const turn = TURNS[i];
        
        const openSprite = turn.speaker === 'arya' ? assets.aryaSprites.open : assets.senecaSprites.open;
        const closedSprite = turn.speaker === 'arya' ? assets.aryaSprites.closed : assets.senecaSprites.closed;
        const listenerStatic = turn.speaker === 'arya' ? assets.senecaSprites.closed : assets.aryaSprites.closed;

        // Extract volume and build perfectly synced video
        const { audioPath, spriteVideoPath, dur } = await processAudioSpriteAnimation(
            turn.line, turn.voice, i, openSprite, closedSprite
        );
        
        const clip = compileTurn(assets.bgPath, spriteVideoPath, listenerStatic, audioPath, turn, dur, i);
        compiled.push(clip);
    }

    // 3. Finish
    await finish(compiled);
})().catch(err => {
    console.error('\n❌', err.message);
    if(err.response) console.error(err.response.data);
    process.exit(1);
});
