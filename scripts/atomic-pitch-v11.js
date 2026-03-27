/**
 * Atomic Pitch Builder v11 — Zurich GenAI Award (Judge-Hardened)
 *
 * NARRATIVE ARC: Fear → Solution → Proof → Relief → Scale → CTA
 * Incorporates feedback from 3 LLM judges (Gemini 7.95, Perplexity 6.25, Swiss VC 3.55)
 *
 * KEY CHANGES FROM v10:
 * - 7 segments (was 8) — leaves margin under 3min
 * - Story arc, not feature list
 * - ZERO acronyms in narration (no ATF/DID/ONNX/PoE/CSA)
 * - No Solana/blockchain references
 * - "97% accuracy" not "100% recall"
 * - Added stakes (€35M fines)
 * - No LoC/test bragging in CTA
 * - Honest about pre-revenue stage
 * - Removed npm external page (timeout issues)
 *
 * TARGET: ≤ 180 seconds (3 minutes)
 * SEGMENTS: 7 × ~25s = ~175s
 *
 * Pipeline: Fish Audio TTS → Playwright headless → ffmpeg concat → background music
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

// 7 Segments — Story Arc: Fear → Solution → Proof → Relief → Scale → CTA
const SEGMENTS = [
    {
        id: 1,
        text: "The EU AI Act takes effect August 2026. AI systems in mental health are classified high-risk. Enterprises deploying autonomous agents in Europe face up to 35 million euros in fines for non-compliance. Most of them have no runtime governance at all.",
        visual: 'mc_hero',
        url: MISSION_CONTROL
    },
    {
        id: 2,
        text: "We built Mission Control — a compliance firewall for AI agent fleets. It enforces 8 GDPR articles in real time: consent detection, crisis intervention, data residency, transparency. Every agent in the fleet is monitored, scored, and held accountable.",
        visual: 'gdpr_dashboard',
        url: `${MISSION_CONTROL}/gdpr`
    },
    {
        id: 3,
        text: "Under the hood is a local AI firewall that checks every conversation in 8 milliseconds — without sending any data to the cloud. It catches crisis signals with 97% accuracy and consent violations with 96% precision. And we publish every benchmark and every known limitation on a public transparency page.",
        visual: 'gdpr_benchmarks',
        url: `${MISSION_CONTROL}/gdpr`
    },
    {
        id: 4,
        text: "For regulated industries like digital health, our audit tool validates any AI conversation against European standards. Paste a transcript, get a compliance report, and download regulator-ready documentation — in seconds, not weeks.",
        visual: 'fast_audit',
        url: `${MISSION_CONTROL}/fast-audit`
    },
    {
        id: 5,
        text: "But compliance alone isn't enough. We built a trust layer for autonomous agents — verified identity, behavioral audits, compliance scoring, and a reputation registry. Organizations can discover, verify, and govern their entire AI workforce from one place.",
        visual: 'trust_hero',
        url: TRUST_PROTOCOL
    },
    {
        id: 6,
        text: "When agents fail, we contain the damage. Circuit breakers halt rogue behavior instantly. Kill switches enforce human override. And our open-source security testing tool runs 41 adversarial attacks against any AI endpoint — finding vulnerabilities before they reach production.",
        visual: 'trust_scroll',
        url: TRUST_PROTOCOL
    },
    {
        id: 7,
        text: "Everything is live, open source, and deployed. We demoed at CIC Berlin and are seeking our first enterprise pilots. This is not a research paper. This is production infrastructure for governing AI agents in Europe. We are Berlin AI Labs.",
        visual: 'mc_cta',
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

    try {
        switch (segment.visual) {
            case 'mc_hero':
                await page.goto(segment.url, { waitUntil: 'networkidle', timeout: 45000 });
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'smooth' }));
                await page.waitForTimeout(durationMs - 3000);
                break;

            case 'gdpr_dashboard':
                await page.goto(segment.url, { waitUntil: 'networkidle', timeout: 45000 });
                await page.waitForTimeout(2000);
                // Show KPIs, then scroll to compliance matrix
                await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
                await page.waitForTimeout(durationMs - 5000);
                break;

            case 'gdpr_benchmarks':
                await page.goto(segment.url, { waitUntil: 'networkidle', timeout: 45000 });
                await page.waitForTimeout(1500);
                // Scroll through benchmarks and transparency sections
                await page.evaluate(() => window.scrollTo({ top: 1000, behavior: 'smooth' }));
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'smooth' }));
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: 2400, behavior: 'smooth' }));
                await page.waitForTimeout(durationMs - 7500);
                break;

            case 'fast_audit':
                await page.goto(segment.url, { waitUntil: 'networkidle', timeout: 45000 });
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

            case 'trust_hero':
                await page.goto(segment.url, { waitUntil: 'networkidle', timeout: 45000 });
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
                await page.waitForTimeout(durationMs - 3000);
                break;

            case 'trust_scroll':
                await page.goto(segment.url, { waitUntil: 'networkidle', timeout: 45000 });
                await page.waitForTimeout(2000);
                await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'smooth' }));
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: 1800, behavior: 'smooth' }));
                await page.waitForTimeout(durationMs - 8000);
                break;

            case 'mc_cta':
                await page.goto(segment.url, { waitUntil: 'networkidle', timeout: 45000 });
                await page.waitForTimeout(1500);
                await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
                await page.waitForTimeout(3000);
                await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
                await page.waitForTimeout(durationMs - 4500);
                break;
        }
    } catch (err) {
        console.error(`  ⚠️ Visual action error in segment ${segment.id}: ${err.message}`);
        await page.waitForTimeout(Math.max(durationMs - 5000, 2000));
    }

    const videoPath = await page.video().path();
    await context.close();
    await browser.close();
    return videoPath;
}

async function main() {
    const outputDir = path.resolve(__dirname, '../pitch_segments_v11');
    fs.mkdirSync(outputDir, { recursive: true });

    // Clean previous (preserve audio if SKIP_AUDIO)
    const existingFiles = fs.readdirSync(outputDir);
    existingFiles.forEach(f => {
        if (SKIP_AUDIO && f.startsWith('audio_')) return;
        fs.unlinkSync(path.join(outputDir, f));
    });

    console.log('\n=== ZURICH GenAI AWARD — PITCH VIDEO v11 (JUDGE-HARDENED) ===\n');
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
    console.log('  ✅ ZURICH PITCH v11 (JUDGE-HARDENED) COMPLETE');
    console.log(`  📁 File: ${finalPath}`);
    console.log(`  ⏱  Duration: ${finalDuration.toFixed(2)}s (${(finalDuration / 60).toFixed(1)} min)`);
    console.log(`  📦 Size: ${fileSizeMB} MB`);
    if (finalDuration > 180) console.log(`  ⚠️  OVER 3-MIN LIMIT by ${(finalDuration - 180).toFixed(1)}s`);
    else console.log(`  ✅ Within 3-minute limit`);
    console.log('═══════════════════════════════════════\n');
    console.log('Next step: node scripts/upload-pitch-v11.js');
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
