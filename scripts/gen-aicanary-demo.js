#!/usr/bin/env node
/**
 * AICanary Demo Video Generator
 * Creates a 1-minute demo video with:
 * - Screen recordings of app usage
 * - Professional TTS narration via Fish Audio
 * - Gentle piano background music
 * - FFmpeg stitching
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const { execSync, spawn } = require('child_process');

// Import TTS client from InstagramReelPoster (compiled version)
const { CloningTtsClient } = require(path.resolve(__dirname, '../dist/infrastructure/tts/CloningTtsClient'));

const OUTPUT_DIR = path.resolve(__dirname, 'output/aicanary_demo');
const SEGMENTS_DIR = path.resolve(OUTPUT_DIR, 'segments');

// Video segments with narration (60 seconds total)
const SEGMENTS = [
    {
        id: 1,
        duration: 8,
        narration: "Welcome to AI Canary - your market validation tool for AI products. In seconds, know if your idea is viable or if you're building in a crowded graveyard.",
        action: "Show landing page with logo"
    },
    {
        id: 2,
        duration: 10,
        narration: "Enter your startup idea, and watch the Canary Score come to life. A health score from zero to one thousand, just like CB Insights - but completely free.",
        action: "Enter project description, show score animation"
    },
    {
        id: 3,
        duration: 10,
        narration: "Our Ecosystem Intel searches GitHub to reveal your competitive landscape. See market saturation, top competitors, and timing signals instantly.",
        action: "Show Ecosystem Intel section with competitors"
    },
    {
        id: 4,
        duration: 10,
        narration: "The App Audit analyzes any URL for UX, performance, and business fit. Get a letter grade and actionable priorities in seconds.",
        action: "Show App Audit with purple theme"
    },
    {
        id: 5,
        duration: 10,
        narration: "Death Watch monitors competitor health signals - domain failures, GitHub commit drops, and expired SSL certificates. Spot dying competitors before anyone else.",
        action: "Show Death Watch section"
    },
    {
        id: 6,
        duration: 7,
        narration: "With SWOT analysis, trend insights, and prediction market data, AI Canary is your unfair advantage. Stop building in the dark.",
        action: "Show SWOT grid and final CTA"
    },
    {
        id: 7,
        duration: 5,
        narration: "Try AI Canary now - completely free. Built for indie builders and product managers who need market intelligence fast.",
        action: "Show URL and closing animation"
    }
];

// Piano background music (gentle, royalty-free)
const BACKGROUND_MUSIC_URL = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Meditation%20Impromptu%2001.mp3";

async function generateTTSForSegments() {
    console.log('🎙️ Generating TTS for each segment...');

    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';

    if (!apiKey) {
        throw new Error('FISH_AUDIO_API_KEY not set');
    }

    const client = new CloningTtsClient(apiKey, voiceId);

    for (const segment of SEGMENTS) {
        console.log(`  Segment ${segment.id}: "${segment.narration.slice(0, 50)}..."`);

        try {
            const result = await client.synthesize(segment.narration, {
                speed: 1.0, // Normal speed for clarity
                format: 'mp3'
            });

            const audioPath = path.join(SEGMENTS_DIR, `audio_${segment.id}.mp3`);

            if (result.audioUrl.startsWith('data:')) {
                const base64Data = result.audioUrl.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(audioPath, buffer);
            } else {
                // Download from URL
                const response = await fetch(result.audioUrl);
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(audioPath, Buffer.from(buffer));
            }

            console.log(`  ✅ Saved: ${audioPath}`);
        } catch (error) {
            console.error(`  ❌ Failed segment ${segment.id}:`, error.message);
        }
    }
}

async function downloadBackgroundMusic() {
    console.log('🎹 Downloading background music...');
    const musicPath = path.join(OUTPUT_DIR, 'background_music.mp3');

    if (fs.existsSync(musicPath)) {
        console.log('  ✅ Already exists');
        return musicPath;
    }

    const response = await fetch(BACKGROUND_MUSIC_URL);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(musicPath, Buffer.from(buffer));
    console.log('  ✅ Downloaded');
    return musicPath;
}

function stitchAudioSegments() {
    console.log('🎬 Stitching audio segments...');

    // Create concat file
    const concatFile = path.join(OUTPUT_DIR, 'concat_audio.txt');
    const lines = SEGMENTS.map(s => `file 'segments/audio_${s.id}.mp3'`);
    fs.writeFileSync(concatFile, lines.join('\n'));

    // Concat audio
    const stitchedAudio = path.join(OUTPUT_DIR, 'narration.mp3');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${stitchedAudio}"`, { stdio: 'inherit' });

    console.log('  ✅ Narration stitched');
    return stitchedAudio;
}

function mixAudioWithMusic(narrationPath, musicPath) {
    console.log('🎶 Mixing narration with background music...');

    const outputPath = path.join(OUTPUT_DIR, 'final_audio.mp3');

    // Mix narration (full volume) with music (20% volume)
    execSync(`ffmpeg -y -i "${narrationPath}" -i "${musicPath}" -filter_complex "[1:a]volume=0.15[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2" -ac 2 "${outputPath}"`, { stdio: 'inherit' });

    console.log('  ✅ Audio mixed');
    return outputPath;
}

async function uploadToCloudinary(filePath) {
    console.log('☁️ Uploading to Cloudinary...');

    const cloudinary = require('cloudinary').v2;

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });

    const result = await cloudinary.uploader.upload(filePath, {
        resource_type: 'video',
        folder: 'aicanary',
        public_id: 'demo_video'
    });

    console.log('  ✅ Uploaded:', result.secure_url);
    return result.secure_url;
}

async function main() {
    console.log('🐦 AICanary Demo Video Generator\\n');

    // Create directories
    fs.mkdirSync(SEGMENTS_DIR, { recursive: true });

    // Step 1: Generate TTS for each segment
    await generateTTSForSegments();

    // Step 2: Download background music
    const musicPath = await downloadBackgroundMusic();

    // Step 3: Stitch audio segments
    const narrationPath = stitchAudioSegments();

    // Step 4: Mix with background music
    const finalAudio = mixAudioWithMusic(narrationPath, musicPath);

    console.log('\\n📢 NEXT STEPS:');
    console.log('1. Record screen segments using browser_subagent');
    console.log('2. Combine video segments with final audio using ffmpeg');
    console.log('3. Upload to Cloudinary');
    console.log('\\nFinal audio ready at:', finalAudio);
}

main().catch(console.error);
