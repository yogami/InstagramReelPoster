/**
 * Atomic Pitch Builder v10 — Zurich GenAI Award (Final Cut)
 *
 * NARRATIVE ARC (matches revised submission to Michael):
 * "Mission Control evolved from a GDPR compliance dashboard into
 *  Europe's first working implementation of the CSA Agentic Trust Framework."
 *
 * TARGET: ≤ 180 seconds (3 minutes)
 * SEGMENTS: 8 × ~22s each = ~176s
 *
 * Pipeline: Fish Audio TTS → Playwright headless → ffmpeg concat → background music → Cloudinary
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');
const axios = require('axios');
const { chromium } = require('playwright');
const { execSync, spawnSync } = require('child_process');

const MISSION_CONTROL = 'https://agent-ops-mission-control-production.up.railway.app';
const TRUST_PROTOCOL = 'https://agent-trust-protocol-production.up.railway.app';
const VOICE_ID = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';
const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY;
const SKIP_AUDIO = process.env.SKIP_AUDIO === 'true';

// Sample transcript for Fast Audit demo
const SAMPLE_TRANSCRIPT = `Patient: I've been feeling really low lately, I don't see the point anymore.
AI: I hear you. Can you tell me more about what's been going on?
Patient: Everything feels hopeless. I sometimes think about not being here.
AI: I'm concerned about your safety. Would it be okay if I connect you with a crisis counselor?`;

// 8 Segments — coherent narrative matching the Zurich submission
const SEGMENTS = [
    {
        id: 1,
        text: "The EU AI Act takes effect August 2026. Mental health chatbots are classified as high-risk AI systems. Enterprises deploying AI agents in Europe need runtime governance — not just monitoring, not just logs, but enforcement. This is what we built.",
        visual: 'mission_control_hero',
        url: MISSION_CONTROL
    },
    {
        id: 2,
        text: "Mission Control started as a GDPR compliance dashboard. We enforce 8 GDPR articles with working code, covering Lawful Processing, Special Categories, Automated Decision-Making, and Transparency. Each article maps to a real microservice, and our fleet compliance matrix tracks every agent in real-time.",
        visual: 'gdpr_overview',
        url: `${MISSION_CONTROL}/gdpr`
    },
    {
        id: 3,
        text: "Behind the compliance layer is ConvoGuard — a local ONNX inference firewall running at 8 milliseconds median latency. It detects crisis signals with 100% recall, and consent patterns with 96% precision. No data leaves the device. We also publicly disclose every known limitation on a transparency page.",
        visual: 'gdpr_benchmarks_scroll',
        url: `${MISSION_CONTROL}/gdpr`
    },
    {
        id: 4,
        text: "For German regulatory compliance, our Fast Audit tool validates any AI transcript against BfArM and EU AI Act standards. Paste a conversation, get a compliance report, and download BfArM-ready XML in seconds.",
        visual: 'fast_audit_demo',
        url: `${MISSION_CONTROL}/fast-audit`
    },
    {
        id: 5,
        text: "But GDPR compliance is only one piece. We evolved Mission Control into Europe's first working implementation of the Cloud Security Alliance's Agentic Trust Framework — covering all five trust elements: Identity, Behavior, Data Governance, Segmentation, and Incident Response.",
        visual: 'trust_protocol_hero',
        url: TRUST_PROTOCOL
    },
    {
        id: 6,
        text: "Our Trust Protocol provides a reputation registry for AI agents. Every agent gets a cryptographically verified TrustScore based on compliance, uptime, and behavioral audits. Organizations can discover, verify, and govern their entire autonomous workforce.",
        visual: 'trust_protocol_scroll',
        url: TRUST_PROTOCOL
    },
    {
        id: 7,
        text: "We also built a 4-level agent maturity model — Intern, Junior, Senior, Principal — with 5 automated promotion gates. When agents go rogue, circuit breakers and kill switches provide instant containment. Our open-source agent-pentest CLI on npm runs 41 adversarial attack vectors against any agent endpoint.",
        visual: 'npm_pentest',
        url: 'https://www.npmjs.com/package/agent-pentest'
    },
    {
        id: 8,
        text: "12 deployed microservices. 15,000 lines of TypeScript. 459 automated tests. Everything open source and live on Railway. This is not a whitepaper. This is production infrastructure for Europe's AI future. We are Berlin AI Labs.",
        visual: 'mission_control_cta',
        url: MISSION_CONTROL
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
        case 'mission_control_hero':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);
            // Let the hero breathe, then slow scroll
            await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 3000);
            break;

        case 'gdpr_overview':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(2000);
            // Show KPIs, then scroll to compliance matrix
            await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 5000);
            break;

        case 'gdpr_benchmarks_scroll':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(1500);
            // Scroll through benchmarks and transparency sections
            await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'smooth' }));
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'smooth' }));
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo({ top: 2400, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 7500);
            break;

        case 'fast_audit_demo':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(2000);
            const textarea = await page.$('textarea');
            if (textarea) {
                await textarea.click();
                await page.waitForTimeout(500);
                await textarea.fill(SAMPLE_TRANSCRIPT);
                await page.waitForTimeout(1500);
                const auditBtn = await page.$('button:has-text("Audit"), button:has-text("Prüfen"), button:has-text("Run"), button:has-text("Start")');
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

        case 'trust_protocol_hero':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);
            // Show the Trust Protocol landing
            await page.waitForTimeout(durationMs - 3000);
            break;

        case 'trust_protocol_scroll':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(2000);
            // Scroll to "Why TrustProtocol?" and agent directory
            await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 5000);
            break;

        case 'npm_pentest':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 3000);
            break;

        case 'mission_control_cta':
            await page.goto(segment.url, { waitUntil: 'networkidle' });
            await page.waitForTimeout(1500);
            // Scroll to the EU AI Act urgency section and footer
            await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
            await page.waitForTimeout(durationMs - 4500);
            break;
    }

    const videoPath = await page.video().path();
    await context.close();
    await browser.close();
    return videoPath;
}

async function main() {
    const outputDir = path.resolve(__dirname, '../pitch_segments_v10');
    fs.mkdirSync(outputDir, { recursive: true });

    // Clean previous (preserve audio if SKIP_AUDIO)
    const existingFiles = fs.readdirSync(outputDir);
    existingFiles.forEach(f => {
        if (SKIP_AUDIO && f.startsWith('audio_')) return;
        fs.unlinkSync(path.join(outputDir, f));
    });

    console.log('\n=== ZURICH GenAI AWARD — PITCH VIDEO v10 (FINAL CUT) ===\n');
    console.log(`Mission Control: ${MISSION_CONTROL}`);
    console.log(`Trust Protocol:  ${TRUST_PROTOCOL}`);
    console.log(`Voice ID: ${VOICE_ID}`);
    console.log(`Segments: ${SEGMENTS.length}`);
    console.log(`Target: ≤ 180s (3 min)`);
    console.log(`Skip audio: ${SKIP_AUDIO}\n`);

    // Phase 1: Audio
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
    console.log(`\n  Total audio: ${totalAudio.toFixed(2)}s (${(totalAudio / 60).toFixed(1)} min)`);

    if (totalAudio > 180) {
        console.log(`  ⚠️  WARNING: Audio exceeds 3-minute limit by ${(totalAudio - 180).toFixed(1)}s!`);
    } else {
        console.log(`  ✅ Within 3-minute limit (${(180 - totalAudio).toFixed(1)}s margin)`);
    }
    console.log('');

    // Phase 2: Record
    console.log('━━━ PHASE 2: Video Recording ━━━');
    const videoFiles = [];
    for (let i = 0; i < SEGMENTS.length; i++) {
        const seg = SEGMENTS[i];
        const durationMs = Math.ceil(audioDurations[i].duration * 1000) + 500;
        const videoPath = await recordSegmentVideo(seg, durationMs, outputDir);
        if (videoPath) {
            const newPath = path.join(outputDir, `video_${seg.id}.webm`);
            if (videoPath !== newPath) fs.renameSync(videoPath, newPath);
            videoFiles.push(newPath);
        } else {
            console.error(`  ❌ Failed to record segment ${seg.id}`);
            process.exit(1);
        }
    }

    // Phase 3: Merge
    console.log('\n━━━ PHASE 3: Merging Audio + Video ━━━');
    const mergedFiles = [];
    for (let i = 0; i < SEGMENTS.length; i++) {
        const seg = SEGMENTS[i];
        const outputPath = path.join(outputDir, `final_${seg.id}.mp4`);
        execSync(`ffmpeg -y -i "${videoFiles[i]}" -i "${audioDurations[i].path}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);
        mergedFiles.push(outputPath);
        console.log(`  ✓ Merged segment ${seg.id}`);
    }

    // Phase 4: Concatenate
    console.log('\n━━━ PHASE 4: Concatenating ━━━');
    const concatList = path.join(outputDir, 'concat_list.txt');
    fs.writeFileSync(concatList, mergedFiles.map(f => `file '${f}'`).join('\n'));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputDir}/pitch_no_music.mp4"`);
    console.log('  ✓ Concatenated all segments');

    // Phase 5: Background music
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
    console.log('  ✅ ZURICH PITCH v10 (FINAL CUT) COMPLETE');
    console.log(`  📁 File: ${finalPath}`);
    console.log(`  ⏱  Duration: ${finalDuration.toFixed(2)}s (${(finalDuration / 60).toFixed(1)} min)`);
    console.log(`  📦 Size: ${fileSizeMB} MB`);
    if (finalDuration > 180) console.log(`  ⚠️  OVER 3-MIN LIMIT by ${(finalDuration - 180).toFixed(1)}s`);
    else console.log(`  ✅ Within 3-minute limit`);
    console.log('═══════════════════════════════════════\n');
    console.log('Next step: node scripts/upload-pitch-v10.js');
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
