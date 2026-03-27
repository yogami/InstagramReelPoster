/**
 * Segment 1 Producer
 * 
 * Creates a video from the static SOC image + audio commentary.
 * Saves to segments/segment_1.mp4 for verification.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');
const axios = require('axios');
const { execSync, spawnSync } = require('child_process');

const VOICE_ID = '716594c03801446bb87a964a1c2a5895';
const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY;
const OUTPUT_DIR = path.resolve(__dirname, '../verified_segments');
const SOC_IMAGE = '/Users/user1000/.gemini/antigravity/brain/c52e6b47-0620-420e-8fbc-297583245a88/soc_alert_fatigue_1768044897580.png';

const SEGMENT_1_TEXT = "The AI revolution has a massive trust problem. Enterprises are deploying agents at scale, but they're flying blind. Traditional logs are just history—they can't stop a policy violation at runtime.";

async function synthesizeAudio(text, outputPath) {
    console.log('Synthesizing audio...');
    const response = await axios.post(
        'https://api.fish.audio/v1/tts',
        { text: text.trim(), reference_id: VOICE_ID, format: 'mp3', speed: 1.6 },
        { headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log(`Audio saved: ${outputPath}`);
}

function getAudioDuration(filePath) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    return parseFloat(result.stdout.toString().trim());
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log('\n=== SEGMENT 1 PRODUCTION ===\n');

    // Step 1: Synthesize audio
    const audioPath = path.join(OUTPUT_DIR, 'segment_1_audio.mp3');
    await synthesizeAudio(SEGMENT_1_TEXT, audioPath);

    // Step 2: Get audio duration
    const duration = getAudioDuration(audioPath);
    console.log(`Audio duration: ${duration.toFixed(2)}s`);

    // Step 3: Create video from static image
    console.log('Creating video from image...');
    const videoPath = path.join(OUTPUT_DIR, 'segment_1.mp4');
    execSync(`ffmpeg -y -loop 1 -i "${SOC_IMAGE}" -i "${audioPath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "scale=1280:720" -c:a aac -shortest "${videoPath}"`);

    console.log(`\n=== SEGMENT 1 COMPLETE ===`);
    console.log(`Output: ${videoPath}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
}

main().catch(console.error);
