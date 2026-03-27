/**
 * Segment 2 Producer
 * 
 * Records homepage with scroll to tagline.
 * Key: Pre-load page BEFORE recording starts to avoid white flash.
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

const SEGMENT_2_TEXT = "You need more than observability. You need runtime enforcement. Welcome to AgentOps Mission Control—the world's first runtime governance registry for safe, sovereign AI in Europe.";

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

    console.log('\n=== SEGMENT 2 PRODUCTION ===\n');

    // Step 1: Synthesize audio
    const audioPath = path.join(OUTPUT_DIR, 'segment_2_audio.mp3');
    await synthesizeAudio(SEGMENT_2_TEXT, audioPath);

    // Step 2: Get audio duration
    const duration = getAudioDuration(audioPath);
    console.log(`Audio duration: ${duration.toFixed(2)}s`);

    // Step 3: Record video - PRE-LOAD page before starting recording
    console.log('Launching browser and pre-loading page...');
    const browser = await chromium.launch({ headless: false });

    // Create context WITHOUT recording first, to pre-load
    const preloadContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const preloadPage = await preloadContext.newPage();
    await preloadPage.goto(APP_URL);
    await preloadPage.waitForLoadState('networkidle');
    console.log('Page pre-loaded. Starting recording...');

    // Close preload context
    await preloadContext.close();

    // Now create recording context - page will load from browser cache
    const recordingDir = path.join(OUTPUT_DIR, 'temp_recording');
    fs.mkdirSync(recordingDir, { recursive: true });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: recordingDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();

    // Navigate and immediately start timing
    await page.goto(APP_URL);
    await page.waitForLoadState('domcontentloaded');

    // Calculate timing: audio duration minus initial wait
    const scrollWait = 2000;
    const remainingTime = Math.max(1000, (duration * 1000) - scrollWait);

    await page.waitForTimeout(scrollWait);

    // Smooth scroll to show tagline
    await page.evaluate(() => {
        window.scrollTo({ top: 400, behavior: 'smooth' });
    });

    await page.waitForTimeout(remainingTime);

    // Close to finalize video
    const videoPath = await page.video().path();
    await context.close();
    await browser.close();

    // Step 4: Merge video with audio
    console.log('Merging video with audio...');
    const outputPath = path.join(OUTPUT_DIR, 'segment_2.mp4');
    execSync(`ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);

    // Cleanup temp recording
    fs.unlinkSync(videoPath);
    fs.rmdirSync(recordingDir);

    console.log(`\n=== SEGMENT 2 COMPLETE ===`);
    console.log(`Output: ${outputPath}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
}

main().catch(console.error);
