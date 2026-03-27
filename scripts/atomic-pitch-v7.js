/**
 * Atomic Pitch Builder v7 - Zurich Awards
 * 
 * Production pipeline for 180-second video pitch:
 * 1. Synthesize 12 audio clips
 * 2. Record 12 video segments
 * 3. Stitch together with background music
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');
const axios = require('axios');
const { chromium } = require('playwright');
const { execSync, spawnSync } = require('child_process');

const APP_URL = 'http://localhost:3000';
const VOICE_ID = '716594c03801446bb87a964a1c2a5895';
const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY;
const SEGMENT_1_IMAGE = '/Users/user1000/.gemini/antigravity/brain/c52e6b47-0620-420e-8fbc-297583245a88/soc_alert_fatigue_1768044897580.png';

// 12 Segments with commentary
const SEGMENTS = [
    {
        id: 1,
        text: "The AI revolution has a massive trust problem. Enterprises are deploying agents at scale, but they're flying blind. Traditional logs are just history—they can't stop a policy violation at runtime.",
        visual: 'static_image',
        imagePath: SEGMENT_1_IMAGE
    },
    {
        id: 2,
        text: "You need more than observability. You need runtime enforcement. Welcome to AgentOps Mission Control—the world's first runtime governance registry for safe, sovereign AI in Europe.",
        visual: 'homepage_scroll',
        url: APP_URL
    },
    {
        id: 3,
        text: "Total visibility starts with Discovery. Our registry lets you find any agent in your stack. Let's search for a GDPR HR screener.",
        visual: 'discover_search',
        url: `${APP_URL}/discover`
    },
    {
        id: 4,
        text: "Our Capability Broker goes beyond keywords. It performs a semantic query to verify real agent identities. This level of verification is what sets us apart.",
        visual: 'discover_results',
        url: `${APP_URL}/discover`
    },
    {
        id: 5,
        text: "But how can we trust an agent's internal math? Introducing Zero-Knowledge Governance. Watch as the agent generates a cryptographic proof of its metrics without revealing private data.",
        visual: 'zk_start',
        url: `${APP_URL}/demo/zk-sla`
    },
    {
        id: 6,
        text: "The Trust Verifier analyzes the proof in real-time and issues a portable, W3C Verifiable Credential. This is math-based trust, not human promises.",
        visual: 'zk_complete',
        url: `${APP_URL}/demo/zk-sla`
    },
    {
        id: 7,
        text: "Scaling security requires orchestration. Our Kanban dashboard offers a unified view of your entire autonomous workforce across multiple vendors.",
        visual: 'kanban_overview',
        url: `${APP_URL}/manage`
    },
    {
        id: 8,
        text: "Moving an agent from sandbox to production triggers automated policy checks. We normalize context across multi-vendor fleets—from OpenAI to Azure.",
        visual: 'kanban_drag',
        url: `${APP_URL}/manage`
    },
    {
        id: 9,
        text: "Anomalies are detected in milliseconds. From PII leaks to behavioral drift, our AI-powered scanners identify threats before they cause damage.",
        visual: 'alert_panel',
        url: `${APP_URL}/manage`
    },
    {
        id: 10,
        text: "And if a system breaches safe bounds? Our global kill switch can freeze your entire fleet instantly. You are in total control.",
        visual: 'kill_switch',
        url: `${APP_URL}/manage`
    },
    {
        id: 11,
        text: "With the EU AI Act arriving in 2026, logs aren't enough. You need portable, verifiable governance. AgentOps Mission Control bridges that gap.",
        visual: 'homepage_stats',
        url: APP_URL
    },
    {
        id: 12,
        text: "Ready to lead the shift? Join our enterprise trial today at berlin-ai-labs dot de slash registry. We are Berlin AI Labs. Don't just build AI—govern it.",
        visual: 'homepage_cta',
        url: APP_URL
    }
];

async function synthesizeAudio(text, outputPath) {
    console.log(`  Synthesizing audio -> ${path.basename(outputPath)}`);
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

async function recordSegment(page, segment, durationMs, outputPath) {
    console.log(`  Recording visual: ${segment.visual} (${durationMs}ms)`);

    switch (segment.visual) {
        case 'static_image':
            // For static image, we'll create a video from the image later
            break;

        case 'homepage_scroll':
            await page.goto(segment.url);
            await page.waitForTimeout(2000);
            await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 2000);
            break;

        case 'discover_search':
            await page.goto(segment.url);
            await page.waitForTimeout(1500);
            await page.fill('input[placeholder*="Search"]', '');
            await page.type('input[placeholder*="Search"]', 'GDPR HR screener', { delay: 80 });
            await page.keyboard.press('Enter');
            await page.waitForTimeout(durationMs - 4000);
            break;

        case 'discover_results':
            // Continue from previous segment - already on discover page with results
            await page.waitForTimeout(durationMs);
            break;

        case 'zk_start':
            await page.goto(segment.url);
            await page.waitForTimeout(2000);
            await page.click('text=Initialize ZK Simulation');
            await page.waitForTimeout(durationMs - 2000);
            break;

        case 'zk_complete':
            // Continue from previous - ZK demo running
            await page.waitForTimeout(durationMs);
            break;

        case 'kanban_overview':
            await page.goto(segment.url);
            await page.waitForSelector('[data-testid="kanban-board"]');
            await page.waitForTimeout(2000);
            await page.evaluate(() => {
                const board = document.querySelector('[data-testid="kanban-board"]');
                if (board) board.scrollTo({ left: 300, behavior: 'smooth' });
            });
            await page.waitForTimeout(durationMs - 2000);
            break;

        case 'kanban_drag':
            // Hover over a card to show drag handle
            await page.hover('[data-testid="kanban-board"] > div:first-child > div:nth-child(2)');
            await page.waitForTimeout(durationMs);
            break;

        case 'alert_panel':
            await page.click('[data-testid="alert-panel-trigger"]');
            await page.waitForTimeout(durationMs);
            break;

        case 'kill_switch':
            // Close alert panel first
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            await page.click('[data-testid="global-kill-switch"]');
            await page.waitForTimeout(durationMs - 500);
            break;

        case 'homepage_stats':
            await page.goto(segment.url);
            await page.waitForTimeout(1000);
            await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 1000);
            break;

        case 'homepage_cta':
            await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs);
            break;
    }
}

async function main() {
    const outputDir = path.resolve(__dirname, '../pitch_segments');
    fs.mkdirSync(outputDir, { recursive: true });

    console.log('\n=== ZURICH AWARDS PITCH PRODUCTION ===\n');

    // Step 1: Synthesize all audio
    console.log('PHASE 1: Audio Synthesis');
    const audioDurations = [];
    for (const seg of SEGMENTS) {
        const audioPath = path.join(outputDir, `audio_${seg.id}.mp3`);
        await synthesizeAudio(seg.text, audioPath);
        const duration = getAudioDuration(audioPath);
        audioDurations.push({ id: seg.id, duration, path: audioPath });
        console.log(`    Segment ${seg.id}: ${duration.toFixed(2)}s`);
    }

    const totalAudioDuration = audioDurations.reduce((sum, a) => sum + a.duration, 0);
    console.log(`\n  Total audio: ${totalAudioDuration.toFixed(2)}s\n`);

    // Step 2: Record video segments
    console.log('PHASE 2: Video Recording');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();

    // Record each segment
    for (let i = 0; i < SEGMENTS.length; i++) {
        const seg = SEGMENTS[i];
        const durationMs = Math.ceil(audioDurations[i].duration * 1000) + 500; // Add 500ms buffer
        await recordSegment(page, seg, durationMs, path.join(outputDir, `video_${seg.id}.webm`));
    }

    await context.close();
    await browser.close();

    // Step 3: Create segment 1 video from static image
    console.log('\nPHASE 3: Creating static image video for Segment 1');
    const seg1Duration = audioDurations[0].duration;
    execSync(`ffmpeg -y -loop 1 -i "${SEGMENT_1_IMAGE}" -c:v libx264 -t ${seg1Duration} -pix_fmt yuv420p -vf "scale=1280:720" "${outputDir}/segment_1.mp4"`);

    // Step 4: Merge audio with video for each segment
    console.log('\nPHASE 4: Merging audio + video');
    const segmentFiles = [];

    // Segment 1: static image + audio
    execSync(`ffmpeg -y -i "${outputDir}/segment_1.mp4" -i "${audioDurations[0].path}" -c:v copy -c:a aac -shortest "${outputDir}/final_1.mp4"`);
    segmentFiles.push(`${outputDir}/final_1.mp4`);

    // Segments 2-12: Playwright recording + audio
    const recordings = fs.readdirSync(outputDir).filter(f => f.endsWith('.webm')).sort();
    for (let i = 1; i < SEGMENTS.length; i++) {
        const seg = SEGMENTS[i];
        const recording = recordings[i - 1]; // Playwright creates one recording per context
        if (!recording) {
            console.log(`  Warning: No recording found for segment ${seg.id}`);
            continue;
        }
        const outputPath = `${outputDir}/final_${seg.id}.mp4`;
        execSync(`ffmpeg -y -i "${outputDir}/${recording}" -i "${audioDurations[i].path}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);
        segmentFiles.push(outputPath);
    }

    // Step 5: Concatenate all segments
    console.log('\nPHASE 5: Concatenating segments');
    const concatList = path.join(outputDir, 'concat_list.txt');
    fs.writeFileSync(concatList, segmentFiles.map(f => `file '${f}'`).join('\n'));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputDir}/pitch_no_music.mp4"`);

    // Step 6: Add background music
    console.log('\nPHASE 6: Adding background music');
    const bgMusic = path.resolve(__dirname, '../background_music.mp3');
    execSync(`ffmpeg -y -i "${outputDir}/pitch_no_music.mp4" -stream_loop -1 -i "${bgMusic}" -filter_complex "[1:a]volume=0.04[bg];[0:a][bg]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${outputDir}/zurich_pitch_final.mp4"`);

    // Step 7: Get final duration
    const finalDuration = getAudioDuration(`${outputDir}/zurich_pitch_final.mp4`);
    console.log(`\n=== COMPLETE ===`);
    console.log(`Final video: ${outputDir}/zurich_pitch_final.mp4`);
    console.log(`Duration: ${finalDuration.toFixed(2)}s`);
}

main().catch(console.error);
