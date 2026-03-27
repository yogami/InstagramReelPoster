/**
 * test-episode.ts — Standalone 10-second episode test.
 *
 * Bypasses the LLM entirely (hardcoded script) and runs:
 *   1. Fish Audio TTS  (male + female voices)
 *   2. Kie.ai Kling    (cinematic 10s background video)
 *   3. FFmpeg render   (combine audio + video + subtitles)
 *
 * Run: npx ts-node scripts/test-episode.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
dotenv.config();

import { FishAudioTtsClient } from '../src/infrastructure/tts/FishAudioTtsClient';
import { KieVideoClient } from '../src/infrastructure/video/KieVideoClient';
import { ScenarioReelRenderer } from '../src/infrastructure/video/ScenarioReelRenderer';
import { TTSResult } from '../src/domain/ports/ITtsClient';
import { DialogueTimingMarker, ScenarioScript } from '../src/domain/entities/ScenarioScript';

// ─── HARDCODED 10-SECOND TEST SCRIPT ─────────────────────────────────────────

const TEST_SCRIPT: ScenarioScript = {
    title: 'Still Here',
    topic: 'Emotional Distance',
    characters: [
        { name: 'Ren', gender: 'male', personality: 'Stoic Realist' },
        { name: 'Zara', gender: 'female', personality: 'Emotionally Awake Skeptic' },
    ],
    hook: "You're doing it again.",
    dialogue: [
        { characterName: 'Zara', text: "You're doing it again.", emotion: 'frustrated' },
        { characterName: 'Ren', text: "Doing what?", emotion: 'calm' },
        { characterName: 'Zara', text: "Going somewhere without moving.", emotion: 'empathetic' },
        { characterName: 'Ren', text: "I'm right here.", emotion: 'neutral' },
        { characterName: 'Zara', text: "That's the problem.", emotion: 'confrontational' },
    ],
    conclusion: "Being physically present and emotionally absent is still leaving.",
    hashtags: ['darkpsychology', 'relationship', 'genz', 'microdrama'],
    wordCount: 24,
};

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const FISH_KEY = process.env.FISH_AUDIO_API_KEY!;
// Ren: 'Dexter Morgan' voice — deep, calm, serious, smooth (NOT the announcer)
const MALE_VOICE = 'a5971a1fd805441aaf3b0bbe8c9f1ab6';
// Zara: 'Sarah' voice — soft, breathy, intimate, sincere
const FEMALE_VOICE = '933563129e564b19a115bedd57b7406a';
const KIE_KEY = process.env.KIE_API_KEY!;
const KIE_BASE = process.env.KIE_API_VIDEO_BASE_URL || 'https://api.kie.ai/api/v1';
const KIE_MODEL = process.env.KIE_VIDEO_MODEL || 'kling-v1-6/video';

// Pre-generated cinematic background (apartment at night, two silhouettes)
const BACKGROUND_IMAGE = '/Users/user1000/.gemini/antigravity/brain/835031b7-8141-4007-acb7-55fa656459c2/microdrama_bg_apartment_1771576323621.png';

const GAP_SECONDS = 0.6; // slightly longer pause — drama breathes
const TARGET_SECS = 10;

async function main() {
    console.log('\n🎬 Test Episode: "Still Here" (Ren & Zara)\n');

    const outDir = path.join(os.tmpdir(), `test-episode-${Date.now()}`);
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`📁 Working dir: ${outDir}\n`);

    // ── STEP 1: TTS ────────────────────────────────────────────────────────────
    console.log('🎙️  Step 1: Synthesizing voices via Fish Audio...');
    const maleTts = new FishAudioTtsClient(FISH_KEY, MALE_VOICE);
    const femaleTts = new FishAudioTtsClient(FISH_KEY, FEMALE_VOICE);

    const audioSegments: TTSResult[] = [];
    const timingMarkers: DialogueTimingMarker[] = [];
    let cursor = 0;

    for (let i = 0; i < TEST_SCRIPT.dialogue.length; i++) {
        const line = TEST_SCRIPT.dialogue[i];
        const client = line.characterName === 'Ren' ? maleTts : femaleTts;

        process.stdout.write(`   [${i + 1}/${TEST_SCRIPT.dialogue.length}] ${line.characterName}: "${line.text}" → `);
        const result = await client.synthesize(line.text);
        process.stdout.write(`${result.durationSeconds.toFixed(2)}s\n`);

        timingMarkers.push({
            index: i,
            characterName: line.characterName,
            text: line.text,
            startTime: cursor,
            endTime: cursor + result.durationSeconds,
            durationSeconds: result.durationSeconds,
        });

        audioSegments.push(result);
        cursor += result.durationSeconds + GAP_SECONDS;
    }

    const totalAudioDuration = cursor - GAP_SECONDS; // remove trailing gap
    console.log(`   ✅ Total audio: ${totalAudioDuration.toFixed(2)}s\n`);

    // ── STEP 2: BACKGROUND ────────────────────────────────────────────────────
    console.log('🖼️  Step 2: Using cinematic apartment background...');
    let backgroundUrl: string = BACKGROUND_IMAGE;
    let backgroundType: 'video' | 'image' = 'image';

    if (!fs.existsSync(BACKGROUND_IMAGE)) {
        // Fallback: try Kling, otherwise dark blue gradient
        console.log('   Background image not found, trying Kling...');
        const kieVideo = new KieVideoClient(KIE_KEY, KIE_BASE, KIE_MODEL);
        try {
            const videoResult = await kieVideo.generateAnimatedVideo({
                theme: 'Two young adults in a moody apartment at night. Dim warm lamp light. City lights through tall windows. Emotional distance. Cinematic vertical shot.',
                durationSeconds: TARGET_SECS,
                mood: 'tense, melancholic, moody blue and amber',
            });
            backgroundUrl = videoResult.videoUrl;
            backgroundType = 'video';
            console.log(`   ✅ Kling video: ${backgroundUrl}`);
        } catch {
            const fallbackPath = path.join(outDir, 'fallback_bg.png');
            const { execSync } = await import('child_process');
            // Dark blue gradient — better than solid black
            execSync(
                `ffmpeg -y -f lavfi -i "gradients=size=1080x1920:x0=0:y0=0:x1=1080:y1=1920:c0=#0d1b2a:c1=#1a0a2e" -frames:v 1 "${fallbackPath}"`,
                { stdio: 'pipe' }
            );
            backgroundUrl = fallbackPath;
        }
    } else {
        console.log('   ✅ Cinematic apartment background loaded\n');
    }

    // ── STEP 3: FFMPEG RENDER ──────────────────────────────────────────────────
    console.log('✂️  Step 3: Rendering final video with FFmpeg...');
    const renderer = new ScenarioReelRenderer();
    const renderDuration = Math.max(totalAudioDuration, TARGET_SECS);

    const { videoPath } = await renderer.render({
        script: TEST_SCRIPT,
        backgroundUrl,
        backgroundType,
        audioSegments,
        timingMarkers,
        totalDurationSeconds: renderDuration,
    });

    // ── RESULT ─────────────────────────────────────────────────────────────────
    const destPath = path.join(os.homedir(), 'Desktop', 'test-episode-ren-zara.mp4');
    fs.copyFileSync(videoPath, destPath);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║         ✅ EPISODE RENDERED               ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  File: ${destPath}`);
    console.log(`║  Duration: ${renderDuration.toFixed(1)}s`);
    console.log(`║  Background: ${backgroundType}`);
    console.log('╚══════════════════════════════════════════╝\n');
    console.log('📱 Open the file on your Desktop to review.\n');
}

main().catch(err => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
});
