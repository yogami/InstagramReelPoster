
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

// Segment definitions for 180 seconds (3 minutes)
const segments = [
    { id: 0, text: "The AI revolution faces a massive trust crisis. Enterprises are deploying agents at scale, but they are opaque boxes—black holes where data and decisions disappear.", action: 'home_top' },
    { id: 1, text: "Relying on post-hoc logs is like looking at a car crash through the rearview mirror. Traditional methods can't stop a policy violation or a PII leak at runtime.", action: 'home_stats' },
    { id: 2, text: "You need more than observability. You need runtime enforcement. Welcome to AgentOps Mission Control—the future of safe, sovereign AI governance in Europe.", action: 'dashboard_overview' },
    { id: 3, text: "Total visibility starts with Discovery. Our registry allows you to identify every agent in your stack. Let's find a GDPR-compliant HR screener for a hiring workflow.", action: 'discover_search' },
    { id: 4, text: "Our Capability Broker performs a semantic query to identify real agent identities, not just strings. This level of unique verification is what sets us apart.", action: 'discover_result' },
    { id: 5, text: "But how can we actually trust their internal math? Introducing Zero-Knowledge Governance—the core of our Trust Protocol.", action: 'zk_intro' },
    { id: 6, text: "Watch as the agent generates a cryptographic SNARK proof of performance metrics without ever revealing its internal weights or your private training data.", action: 'zk_proving' },
    { id: 7, text: "The Trust Verifier node analyzes the proof in real-time and issues a portable, W-3-C Verifiable Credential. Math-based trust, not human promises.", action: 'zk_verifying' },
    { id: 8, text: "This unique edge ensures your compliance is mathematically guaranteed. Verified intelligence that satisfies both auditors and investors.", action: 'zk_success' },
    { id: 10, text: "Scaling securely requires precise orchestration. Our Kanban dashboard offers a unified view of your entire autonomous workforce across multiple vendors.", action: 'management_kanban' },
    { id: 11, text: "Moving an agent from a sandbox to production triggers automated policy-checking workflows. Drag-and-drop complexity is now a thing of the past.", action: 'kanban_drag' },
    { id: 12, text: "We uniquely normalize context and semantic alignment across multi-vendor fleets—from OpenAI to Azure—maintaining strict compliance during every handoff.", action: 'kanban_align' },
    { id: 13, text: "Anomalies are detected in milliseconds. From PII leaks to behavioral drift, our AI-powered scanners identify threats before they can cause damage.", action: 'management_alerts' },
    { id: 14, text: "High-risk decisions are routed to our Human-in-the-Loop panel, ensuring that sovereign human control remains at the center of your AI strategy.", action: 'human_review' },
    { id: 15, text: "And if a system breaches safe bounds? Our global kill switch is a runtime directive that can freeze your entire fleet instantly. You are in total control.", action: 'kill_switch' },
    { id: 16, text: "With the EU AI Act arriving in 2026, verifiable certainty is no longer optional. Logs aren't enough—you need portable, runtime governance that moves with you.", action: 'hero_final' },
    { id: 17, text: "Ready to lead the shift? Join our ninety-nine Euro enterprise trial today at berlin-ai-labs dot de slash registry. Don't just build your AI—govern it.", action: 'hero_cta' },
    { id: 18, text: "We are Berlin AI Labs. We're building the infrastructure for a safe, secure, and sovereign AI future. Let's build it together. Start your journey now.", action: 'footer' }
];

async function synthesize(text, voiceId, apiKey) {
    const response = await axios.post(
        'https://api.fish.audio/v1/tts',
        {
            text: text.trim(),
            reference_id: voiceId,
            format: 'mp3',
            speed: 1.6,
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
        }
    );
    return Buffer.from(response.data);
}

async function runAtomicProduction() {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = '716594c03801446bb87a964a1c2a5895';

    const APP_URL = 'http://localhost:3000';
    const browser = await chromium.launch({ headless: false });

    console.log(`Starting production of ${segments.length} atomic segments...`);
    const chunksDir = path.join(__dirname, 'output/chunks');
    if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

    for (const segment of segments) {
        console.log(`\n--- Segment ${segment.id}: ${segment.action} ---`);

        // 1. Synthesize Audio
        console.log('Synthesizing audio...');
        const audioBuffer = await synthesize(segment.text, voiceId, apiKey);
        const audioPath = path.join(chunksDir, `audio_${segment.id}.mp3`);
        fs.writeFileSync(audioPath, audioBuffer);

        // 2. Measure Duration
        const duration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${audioPath}`).toString().trim();
        const durationMs = Math.ceil(parseFloat(duration) * 1000) + 1000; // Buffer for transitions
        console.log(`Duration: ${duration}s (${durationMs}ms)`);

        // 3. Record Video
        console.log('Recording video...');
        const tempVideoDir = path.join(chunksDir, `temp_video_${segment.id}`);
        if (!fs.existsSync(tempVideoDir)) fs.mkdirSync(tempVideoDir, { recursive: true });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            recordVideo: { dir: tempVideoDir, size: { width: 1280, height: 720 } }
        });
        const page = await context.newPage();

        await performUIAction(page, segment.action, APP_URL);
        await page.waitForTimeout(durationMs);

        await context.close(); // Saves video

        // Find the saved video file
        const videoFiles = fs.readdirSync(tempVideoDir).filter(f => f.endsWith('.webm'));
        const webmPath = path.join(tempVideoDir, videoFiles[0]);
        const finalChunkPath = path.join(chunksDir, `chunk_${segment.id}.mp4`);

        // 4. Combine into final segment
        console.log('Combining...');
        // Match audio length exactly to prevent sync drift
        execSync(`ffmpeg -y -i ${webmPath} -i ${audioPath} -map 0:v:0 -map 1:a:0 -c:v libx264 -c:a aac -pix_fmt yuv420p -r 30 -t ${duration} ${finalChunkPath}`);
        console.log(`Segment ${segment.id} complete: ${finalChunkPath}`);
    }

    await browser.close();

    // 5. Concatenate all
    console.log('\nConcatenating all segments...');
    const concatListPath = path.join(chunksDir, 'concat_list.txt');
    const listContent = segments.map(s => `file 'chunk_${s.id}.mp4'`).join('\n');
    fs.writeFileSync(concatListPath, listContent);

    const mergedVideoPath = path.join(chunksDir, 'merged_silent.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i ${concatListPath} -c copy ${mergedVideoPath}`);

    // 6. Final Mix with Music
    console.log('Adding background music...');
    const musicUrl = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Meditation%20Impromptu%2001.mp3";
    const bgMusicPath = path.join(chunksDir, 'background.mp3');
    if (!fs.existsSync(bgMusicPath)) {
        execSync(`curl -L -o ${bgMusicPath} ${musicUrl}`);
    }

    const finalResultPath = path.join(process.cwd(), 'AgentOps_Production_Meticulous_v5.mp4');
    execSync(`ffmpeg -y -i ${mergedVideoPath} -stream_loop -1 -i ${bgMusicPath} -filter_complex "[1:a]volume=0.06[bgm];[0:a][bgm]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac ${finalResultPath}`);

    console.log('\n--- PRODUCTION COMPLETE ---');
    console.log('Result: ' + finalResultPath);
}

async function performUIAction(page, action, APP_URL) {
    try {
        switch (action) {
            case 'home_top':
                await page.goto(APP_URL);
                await page.evaluate(() => window.scrollTo(0, 0));
                break;
            case 'home_stats':
                await page.goto(APP_URL);
                await page.evaluate(() => window.scrollTo(0, 500));
                break;
            case 'dashboard_overview':
                await page.goto(`${APP_URL}/manage`);
                break;
            case 'discover_search':
                await page.goto(`${APP_URL}/discover`);
                await page.fill('input[placeholder*="Search"]', 'GDPR');
                break;
            case 'discover_result':
                await page.goto(`${APP_URL}/discover`);
                await page.fill('input[placeholder*="Search"]', 'GDPR HR screener');
                await page.keyboard.press('Enter');
                break;
            case 'zk_intro':
                await page.goto(`${APP_URL}/demo/zk-sla`);
                break;
            case 'zk_proving':
                await page.goto(`${APP_URL}/demo/zk-sla`);
                await page.click('text=Initialize ZK Simulation');
                break;
            case 'zk_verifying':
                await page.goto(`${APP_URL}/demo/zk-sla`);
                await page.click('text=Initialize ZK Simulation');
                await page.waitForTimeout(4000);
                break;
            case 'zk_success':
                await page.goto(`${APP_URL}/demo/zk-sla`);
                await page.click('text=Initialize ZK Simulation');
                await page.waitForTimeout(9000);
                break;
            case 'management_kanban':
                await page.goto(`${APP_URL}/manage`);
                break;
            case 'kanban_drag':
                await page.goto(`${APP_URL}/manage`);
                await page.hover('[data-testid="agent-card"]');
                break;
            case 'kanban_align':
                await page.goto(`${APP_URL}/manage`);
                break;
            case 'management_alerts':
                await page.goto(`${APP_URL}/manage`);
                await page.click('[data-testid="alert-panel-trigger"]');
                break;
            case 'human_review':
                await page.goto(`${APP_URL}/manage`);
                await page.click('[data-testid="human-review-trigger"]');
                break;
            case 'kill_switch':
                await page.goto(`${APP_URL}/manage`);
                await page.click('[data-testid="global-kill-switch"]');
                break;
            case 'hero_final':
                await page.goto(APP_URL);
                await page.evaluate(() => window.scrollTo(0, 800));
                break;
            case 'hero_cta':
                await page.goto(APP_URL);
                await page.evaluate(() => window.scrollTo(0, 1500));
                break;
            case 'footer':
                await page.goto(APP_URL);
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                break;
        }
    } catch (e) {
        console.warn(`Action ${action} failed, but continuing...`);
    }
}

runAtomicProduction().catch(console.error);
