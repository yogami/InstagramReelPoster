// Segments 10, 11, 12 - Batch producer
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

const SEGMENTS = [
    { id: 10, text: "And if a system breaches safe bounds? Our global kill switch can freeze your entire fleet instantly. You are in total control.", action: 'kill_switch' },
    { id: 11, text: "With the EU AI Act arriving in 2026, logs aren't enough. You need portable, verifiable governance. AgentOps Mission Control bridges that gap.", action: 'homepage_stats' },
    { id: 12, text: "Ready to lead the shift? Join our enterprise trial today at berlin-ai-labs dot de slash registry. We are Berlin AI Labs. Don't just build AI—govern it.", action: 'homepage_cta' }
];

async function synthesizeAudio(text, outputPath) {
    const response = await axios.post(
        'https://api.fish.audio/v1/tts',
        { text: text.trim(), reference_id: VOICE_ID, format: 'mp3', speed: 1.6 },
        { headers: { Authorization: `Bearer ${FISH_API_KEY}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer' }
    );
    fs.writeFileSync(outputPath, Buffer.from(response.data));
}

function getAudioDuration(filePath) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    return parseFloat(result.stdout.toString().trim());
}

async function recordSegment(seg, duration) {
    const browser = await chromium.launch({ headless: false });
    const url = seg.action.startsWith('homepage') ? APP_URL : `${APP_URL}/manage`;

    const preloadContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const preloadPage = await preloadContext.newPage();
    await preloadPage.goto(url);
    await preloadPage.waitForLoadState('networkidle');
    await preloadContext.close();

    const recordingDir = path.join(OUTPUT_DIR, `temp_recording_${seg.id}`);
    fs.mkdirSync(recordingDir, { recursive: true });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: recordingDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    if (seg.action === 'kill_switch') {
        await page.click('[data-testid="global-kill-switch"]');
        await page.waitForTimeout((duration * 1000) - 2000);
    } else if (seg.action === 'homepage_stats') {
        await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
        await page.waitForTimeout((duration * 1000) - 2000);
    } else if (seg.action === 'homepage_cta') {
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
        await page.waitForTimeout((duration * 1000) - 2000);
    }

    const videoPath = await page.video().path();
    await context.close();
    await browser.close();
    return videoPath;
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('\n=== SEGMENTS 10-12 PRODUCTION ===\n');

    for (const seg of SEGMENTS) {
        console.log(`\nSegment ${seg.id}:`);
        const audioPath = path.join(OUTPUT_DIR, `segment_${seg.id}_audio.mp3`);
        await synthesizeAudio(seg.text, audioPath);
        const duration = getAudioDuration(audioPath);
        console.log(`  Audio: ${duration.toFixed(2)}s`);

        const videoPath = await recordSegment(seg, duration);
        const outputPath = path.join(OUTPUT_DIR, `segment_${seg.id}.mp4`);
        execSync(`ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);
        fs.unlinkSync(videoPath);
        fs.rmdirSync(path.join(OUTPUT_DIR, `temp_recording_${seg.id}`));
        console.log(`  Complete: segment_${seg.id}.mp4`);
    }

    console.log('\n=== ALL SEGMENTS COMPLETE ===\n');
}

main().catch(console.error);
