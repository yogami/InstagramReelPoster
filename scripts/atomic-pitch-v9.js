/**
 * Atomic Pitch Builder v9 — Zurich GenAI Award (February 2026 Update)
 *
 * Records 10 segments against the LIVE production app showing:
 * - GDPR 8-article enforcement
 * - ConvoGuard benchmarks
 * - Transparency & known limitations
 * - BfArM XML Fast Audit
 * - ATF Maturity Model & Incident Response
 * - agent-pentest CLI on npm
 *
 * Pipeline: Fish Audio TTS → Playwright screen recordings → ffmpeg concat → background music
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');
const axios = require('axios');
const { chromium } = require('playwright');
const { execSync, spawnSync } = require('child_process');

const APP_URL = process.env.ZURICH_APP_URL || 'https://agent-ops-mission-control-production.up.railway.app';
const VOICE_ID = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';
const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY;
const SKIP_AUDIO = process.env.SKIP_AUDIO === 'true'; // Reuse cached audio files

// Sample transcript for Fast Audit demo
const SAMPLE_TRANSCRIPT = `Patient: I've been feeling really low lately, I don't see the point anymore.
AI Therapist: I hear you. Can you tell me more about what's been going on?
Patient: Everything feels hopeless. I sometimes think about not being here.
AI Therapist: I'm concerned about your safety. Would it be okay if I connect you with a crisis counselor?`;

// 10 Segments — all claims fact-checked
const SEGMENTS = [
    {
        id: 1,
        text: "The EU AI Act takes effect August 2026, and mental health AI is classified as high-risk. Most teams have no runtime governance, and regulators are coming. This is the compliance gap we close.",
        visual: 'homepage_hero',
        url: APP_URL
    },
    {
        id: 2,
        text: "Welcome to Mission Control. A clinical compliance platform for mental health AI. Real-time validation of therapy conversations, suicide risk detection, and one-click regulator-ready audit reports.",
        visual: 'homepage_scroll',
        url: APP_URL
    },
    {
        id: 3,
        text: "Our GDPR Compliance Center monitors the entire agent fleet in real-time. Fleet score, data residency, article coverage, and active alerts — all computed from live system data, not estimates.",
        visual: 'gdpr_kpis',
        url: `${APP_URL}/gdpr`
    },
    {
        id: 4,
        text: "We enforce 8 GDPR articles with working code. Article 6 Lawful Processing, Article 9 Special Categories, Article 22 Automated Decision-Making, Article 13 and 14 Transparency. Each maps to a specific microservice.",
        visual: 'gdpr_articles',
        url: `${APP_URL}/gdpr`
    },
    {
        id: 5,
        text: "Behind the compliance layer is ConvoGuard — a local ONNX inference firewall. 8 milliseconds median latency. It detects crisis signals and consent patterns without any data leaving the device. All processing runs on-device.",
        visual: 'gdpr_benchmarks',
        url: `${APP_URL}/gdpr`
    },
    {
        id: 6,
        text: "Transparency is not optional. We publicly disclose known limitations. English-only consent detection. Solana devnet anchoring. Scope boundaries clearly documented. Our benchmarks API returns machine-readable data for any auditor.",
        visual: 'gdpr_transparency',
        url: `${APP_URL}/gdpr`
    },
    {
        id: 7,
        text: "For German regulatory compliance, our Fast Audit tool validates AI transcripts against BfArM and EU AI Act standards. Paste a conversation, get a compliance report in seconds, and download BfArM-ready XML.",
        visual: 'fast_audit_demo',
        url: `${APP_URL}/fast-audit`
    },
    {
        id: 8,
        text: "Trust is not a badge. We built a four-level agent maturity model. Intern, Junior, Senior, Principal. Five automated promotion gates cover performance, security, business value, incident records, and governance sign-off.",
        visual: 'gdpr_poe',
        url: `${APP_URL}/gdpr`
    },
    {
        id: 9,
        text: "When agents go rogue, you need enforcement, not alerts. Our stack includes circuit breakers with automatic recovery, kill switches, and blast radius containment. We also published agent-pentest on npm — 41 adversarial attack vectors that grade any agent endpoint.",
        visual: 'npm_pentest',
        url: 'https://www.npmjs.com/package/agent-pentest'
    },
    {
        id: 10,
        text: "Nine production services. 459 automated tests. 35,000 lines of TypeScript. Open source and live on Railway. This is not a whitepaper. This is infrastructure for Europe's AI future. We are Berlin AI Labs.",
        visual: 'homepage_cta',
        url: APP_URL
    }
];

async function synthesizeAudio(text, outputPath) {
    console.log(`  🎙️  Synthesizing audio → ${path.basename(outputPath)}`);
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

async function recordSegmentVideo(segment, durationMs, outputDir) {
    console.log(`  📹 Recording segment ${segment.id}: ${segment.visual} (${durationMs}ms)`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();

    switch (segment.visual) {
        case 'homepage_hero':
            await page.goto(segment.url);
            await page.waitForTimeout(2000);
            // Let the hero section breathe — show the headline and pulse animation
            await page.waitForTimeout(durationMs - 2000);
            break;

        case 'homepage_scroll':
            await page.goto(segment.url);
            await page.waitForTimeout(2000);
            // Smooth scroll to value props and metrics
            await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 5000);
            break;

        case 'gdpr_kpis':
            await page.goto(segment.url);
            await page.waitForTimeout(2000);
            // Show the KPI cards: Fleet Score, Data Residency, GDPR Articles, Active Alerts
            await page.waitForTimeout(durationMs - 2000);
            break;

        case 'gdpr_articles':
            await page.goto(segment.url);
            await page.waitForTimeout(1500);
            // Scroll to article coverage section
            await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'smooth' }));
            await page.waitForTimeout(2000);
            // Slow scroll through articles
            await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 3500);
            break;

        case 'gdpr_benchmarks':
            await page.goto(segment.url);
            await page.waitForTimeout(1000);
            // Scroll to ConvoGuard benchmarks section
            await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'smooth' }));
            await page.waitForTimeout(2000);
            await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 3000);
            break;

        case 'gdpr_transparency':
            await page.goto(segment.url);
            await page.waitForTimeout(1000);
            // Scroll to transparency / known limitations section
            await page.evaluate(() => window.scrollTo({ top: 2000, behavior: 'smooth' }));
            await page.waitForTimeout(2000);
            await page.evaluate(() => window.scrollTo({ top: 2400, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 3000);
            break;

        case 'fast_audit_demo':
            await page.goto(segment.url);
            await page.waitForTimeout(2000);
            // Type sample transcript into the textarea
            const textarea = await page.$('textarea');
            if (textarea) {
                await textarea.click();
                await page.waitForTimeout(500);
                await textarea.fill(SAMPLE_TRANSCRIPT);
                await page.waitForTimeout(1500);
                // Click the audit button
                const auditBtn = await page.$('button:has-text("Audit"), button:has-text("Prüfen"), button:has-text("Start")');
                if (auditBtn) {
                    await auditBtn.click();
                    await page.waitForTimeout(durationMs - 4500);
                } else {
                    await page.waitForTimeout(durationMs - 4000);
                }
            } else {
                await page.waitForTimeout(durationMs - 2000);
            }
            break;

        case 'gdpr_poe':
            await page.goto(segment.url);
            await page.waitForTimeout(1000);
            // Scroll to the PoE verification panel and consent checker area
            await page.evaluate(() => window.scrollTo({ top: 2800, behavior: 'smooth' }));
            await page.waitForTimeout(2000);
            await page.evaluate(() => window.scrollTo({ top: 3200, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 3000);
            break;

        case 'npm_pentest':
            await page.goto(segment.url);
            await page.waitForTimeout(3000);
            // Scroll the npm page to show install command and description
            await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 3000);
            break;

        case 'homepage_cta':
            await page.goto(APP_URL);
            await page.waitForTimeout(1000);
            // Scroll to the EU AI Act urgency section and footer
            await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 1000);
            break;
    }

    // Get the video path before closing
    const videoPath = await page.video().path();

    // Close context to finalize video
    await context.close();
    await browser.close();

    return videoPath;
}

async function main() {
    const outputDir = path.resolve(__dirname, '../pitch_segments_v9');
    fs.mkdirSync(outputDir, { recursive: true });

    // Clean previous video recordings (preserve audio if SKIP_AUDIO)
    const existingFiles = fs.readdirSync(outputDir);
    existingFiles.forEach(f => {
        if (SKIP_AUDIO && f.startsWith('audio_')) return; // Keep cached audio
        fs.unlinkSync(path.join(outputDir, f));
    });

    console.log('\n=== ZURICH GenAI AWARD — PITCH VIDEO v9 ===\n');
    console.log(`Target app: ${APP_URL}`);
    console.log(`Voice ID: ${VOICE_ID}`);
    console.log(`Segments: ${SEGMENTS.length}`);
    console.log(`Skip audio: ${SKIP_AUDIO}\n`);

    // Phase 1: Audio Synthesis (or reuse cached)
    console.log('━━━ PHASE 1: Audio Synthesis ━━━');
    const audioDurations = [];
    for (const seg of SEGMENTS) {
        const audioPath = path.join(outputDir, `audio_${seg.id}.mp3`);
        if (SKIP_AUDIO && fs.existsSync(audioPath)) {
            console.log(`  ⏭️  Reusing cached audio_${seg.id}.mp3`);
        } else {
            await synthesizeAudio(seg.text, audioPath);
        }
        const duration = getAudioDuration(audioPath);
        audioDurations.push({ id: seg.id, duration, path: audioPath });
        console.log(`    Segment ${seg.id}: ${duration.toFixed(2)}s`);
    }
    const totalAudio = audioDurations.reduce((sum, a) => sum + a.duration, 0);
    console.log(`\n  Total audio: ${totalAudio.toFixed(2)}s (${(totalAudio / 60).toFixed(1)} min)\n`);

    // Phase 2: Record each segment in separate browser context
    console.log('━━━ PHASE 2: Video Recording ━━━');
    const videoFiles = [];

    for (let i = 0; i < SEGMENTS.length; i++) {
        const seg = SEGMENTS[i];
        const durationMs = Math.ceil(audioDurations[i].duration * 1000) + 500;
        const videoPath = await recordSegmentVideo(seg, durationMs, outputDir);

        if (videoPath) {
            const newPath = path.join(outputDir, `video_${seg.id}.webm`);
            if (videoPath !== newPath) {
                fs.renameSync(videoPath, newPath);
            }
            videoFiles.push(newPath);
        } else {
            console.error(`  ❌ Failed to record segment ${seg.id}`);
            process.exit(1);
        }
    }

    // Phase 3: Merge audio + video per segment
    console.log('\n━━━ PHASE 3: Merging Audio + Video ━━━');
    const mergedFiles = [];
    for (let i = 0; i < SEGMENTS.length; i++) {
        const seg = SEGMENTS[i];
        const outputPath = path.join(outputDir, `final_${seg.id}.mp4`);
        execSync(`ffmpeg -y -i "${videoFiles[i]}" -i "${audioDurations[i].path}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);
        mergedFiles.push(outputPath);
        console.log(`  ✓ Merged segment ${seg.id}`);
    }

    // Phase 4: Concatenate all segments
    console.log('\n━━━ PHASE 4: Concatenating ━━━');
    const concatList = path.join(outputDir, 'concat_list.txt');
    fs.writeFileSync(concatList, mergedFiles.map(f => `file '${f}'`).join('\n'));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputDir}/pitch_no_music.mp4"`);
    console.log('  ✓ Concatenated all segments');

    // Phase 5: Add background music
    console.log('\n━━━ PHASE 5: Background Music ━━━');
    const bgMusic = path.resolve(__dirname, '../background_music.mp3');
    if (!fs.existsSync(bgMusic)) {
        console.log('  ⚠ No background_music.mp3 found, skipping music overlay');
        fs.copyFileSync(`${outputDir}/pitch_no_music.mp4`, `${outputDir}/zurich_pitch_final.mp4`);
    } else {
        execSync(`ffmpeg -y -i "${outputDir}/pitch_no_music.mp4" -stream_loop -1 -i "${bgMusic}" -filter_complex "[1:a]volume=0.04[bg];[0:a][bg]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${outputDir}/zurich_pitch_final.mp4"`);
        console.log('  ✓ Added background music (volume: 0.04)');
    }

    // Final report
    const finalPath = `${outputDir}/zurich_pitch_final.mp4`;
    const finalDuration = getAudioDuration(finalPath);
    const fileSizeMB = (fs.statSync(finalPath).size / (1024 * 1024)).toFixed(1);

    console.log('\n═══════════════════════════════════════');
    console.log('  ✅ ZURICH PITCH v9 COMPLETE');
    console.log(`  📁 File: ${finalPath}`);
    console.log(`  ⏱  Duration: ${finalDuration.toFixed(2)}s (${(finalDuration / 60).toFixed(1)} min)`);
    console.log(`  📦 Size: ${fileSizeMB} MB`);
    console.log('═══════════════════════════════════════\n');
    console.log('Next step: node scripts/upload-pitch-v9.js');
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
