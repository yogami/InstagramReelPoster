/**
 * Segment 8 Producer
 * 
 * Records /manage page showing hover over agent card (drag-and-drop demo).
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

const SEGMENT_8_TEXT = "Moving an agent from sandbox to production triggers automated policy checks. We normalize context across multi-vendor fleets—from OpenAI to Azure.";

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

    console.log('\n=== SEGMENT 8 PRODUCTION ===\n');

    const audioPath = path.join(OUTPUT_DIR, 'segment_8_audio.mp3');
    await synthesizeAudio(SEGMENT_8_TEXT, audioPath);

    const duration = getAudioDuration(audioPath);
    console.log(`Audio duration: ${duration.toFixed(2)}s`);

    console.log('Launching browser and pre-loading page...');
    const browser = await chromium.launch({ headless: false });

    const preloadContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const preloadPage = await preloadContext.newPage();
    await preloadPage.goto(`${APP_URL}/manage`);
    await preloadPage.waitForLoadState('networkidle');
    console.log('Page pre-loaded. Starting recording...');
    await preloadContext.close();

    const recordingDir = path.join(OUTPUT_DIR, 'temp_recording_8');
    fs.mkdirSync(recordingDir, { recursive: true });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: recordingDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();

    await page.goto(`${APP_URL}/manage`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Hover over an agent card to show drag handle
    const agentCard = page.locator('[data-testid="kanban-board"] > div:first-child > div:nth-child(2)').first();
    await agentCard.hover();

    const remaining = Math.max(1000, (duration * 1000) - 2000);
    await page.waitForTimeout(remaining);

    const videoPath = await page.video().path();
    await context.close();
    await browser.close();

    console.log('Merging video with audio...');
    const outputPath = path.join(OUTPUT_DIR, 'segment_8.mp4');
    execSync(`ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);

    fs.unlinkSync(videoPath);
    fs.rmdirSync(recordingDir);

    console.log(`\n=== SEGMENT 8 COMPLETE ===`);
    console.log(`Output: ${outputPath}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
}

main().catch(console.error);
