/**
 * Segment 6 Producer
 * 
 * Records /demo/zk-sla showing the ZK credential issuance.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');
const axios = require('axios');
const { chromium } = require('playwright');
const { execSync, spawnSync } = require('child_process');

const VOICE_ID = '716594c03801446bb87a964a1c2a5895';
const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY;
const OUTPUT_DIR = path.resolve(__dirname, '../verified_segments');
const APP_URL = 'http://localhost:3000';

const SEGMENT_6_TEXT = "The Trust Verifier analyzes the proof in real-time and issues a portable, W3C Verifiable Credential. This is math-based trust, not human promises.";

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

    console.log('\n=== SEGMENT 6 PRODUCTION ===\n');

    // Step 1: Synthesize audio
    const audioPath = path.join(OUTPUT_DIR, 'segment_6_audio.mp3');
    await synthesizeAudio(SEGMENT_6_TEXT, audioPath);

    const duration = getAudioDuration(audioPath);
    console.log(`Audio duration: ${duration.toFixed(2)}s`);

    // Step 2: Pre-load page and start simulation
    console.log('Launching browser and pre-loading page...');
    const browser = await chromium.launch({ headless: false });

    const preloadContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const preloadPage = await preloadContext.newPage();
    await preloadPage.goto(`${APP_URL}/demo/zk-sla`);
    await preloadPage.waitForLoadState('networkidle');

    // Start simulation so it's already near completion when we record
    await preloadPage.click('text=Initialize ZK Simulation');
    await preloadPage.waitForTimeout(5000); // Wait for it to progress a bit

    console.log('Simulation in progress. Starting recording...');
    await preloadContext.close();

    // Step 3: Record
    const recordingDir = path.join(OUTPUT_DIR, 'temp_recording_6');
    fs.mkdirSync(recordingDir, { recursive: true });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: recordingDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();

    await page.goto(`${APP_URL}/demo/zk-sla`);
    await page.waitForLoadState('domcontentloaded');

    // Start simulation immediately
    await page.click('text=Initialize ZK Simulation');

    // Wait for the full duration
    await page.waitForTimeout(duration * 1000);

    // Finalize
    const videoPath = await page.video().path();
    await context.close();
    await browser.close();

    // Step 4: Merge
    console.log('Merging video with audio...');
    const outputPath = path.join(OUTPUT_DIR, 'segment_6.mp4');
    execSync(`ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);

    fs.unlinkSync(videoPath);
    fs.rmdirSync(recordingDir);

    console.log(`\n=== SEGMENT 6 COMPLETE ===`);
    console.log(`Output: ${outputPath}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
}

main().catch(console.error);
