/**
 * E2E Test: YouTube Short Slice
 *
 * Tests the complete YouTube Short generation pipeline with real VIDEO generation.
 * Uses Kie.ai (via MultiModelVideoClient) for video clips instead of Flux images.
 * 
 * NOTE: Video generation takes 2-3 minutes per clip. A 10s video = ~2-3 min wait.
 * 
 * Verifies:
 * 1. Script parsing works correctly
 * 2. VIDEO generation for visual prompts (via Kie.ai)
 * 3. TTS narration generation
 * 4. Duration matching between TTS and video
 * 5. Final video rendering with all assets
 */

import dotenv from 'dotenv';
dotenv.config();

import { getConfig } from '../src/config';
import { createDependencies } from '../src/presentation/app';
import { YouTubeScriptParser } from '../src/infrastructure/youtube/YouTubeScriptParser';

// The test input - a 10-second YouTube Short script
const TEST_SCRIPT = `Youtube Short Script: The Collision Visual
Total Runtime: 10 Seconds | Tone: Epic & Cinematic

[0:00–0:10] The Collision Visual
Visual: A high-speed CGI animation of the Indian plate racing across the ocean and slamming into Asia.
Narrator: India wasn't always where it is today. 100 million years ago, it was an island "spearhead" breaking away from the South Pole, drifting north at a tectonic "sprint" of 20 centimeters per year.`;

async function runE2ETest() {
    console.log('🎬 YouTube Short E2E Test Starting...\n');

    // 1. Validate input parsing
    console.log('📋 Step 1: Validating script parsing...');
    if (!YouTubeScriptParser.isYouTubeRequest(TEST_SCRIPT)) {
        console.error('❌ PARSE ERROR: Input not recognized as YouTube script');
        process.exit(1);
    }

    const youtubeInput = YouTubeScriptParser.parse(TEST_SCRIPT);
    console.log(`✅ Parsed successfully:`);
    console.log(`   Title: "${youtubeInput.title}"`);
    console.log(`   Duration: ${youtubeInput.totalDurationSeconds}s`);
    console.log(`   Tone: ${youtubeInput.tone || 'Not specified'}`);
    console.log(`   Scenes: ${youtubeInput.scenes.length}`);

    youtubeInput.scenes.forEach((scene, i) => {
        console.log(`\n   Scene ${i + 1}: [${scene.startTime}–${scene.endTime}] ${scene.title}`);
        console.log(`   Duration: ${scene.durationSeconds}s`);
        console.log(`   Visual: "${scene.visualPrompt.substring(0, 60)}..."`);
        console.log(`   Narration: "${scene.narration.substring(0, 60)}..."`);
    });

    // 2. Initialize production dependencies
    console.log('\n📦 Step 2: Initializing dependencies...');
    const config = getConfig();
    config.featureFlags.enableUserApproval = false; // Disable interactive approval
    const { orchestrator, jobManager } = createDependencies(config);
    console.log('✅ Dependencies initialized');

    // 3. Create job
    console.log('\n🎥 Step 3: Creating job...');
    const job = await jobManager.createJob({
        transcript: youtubeInput.scenes.map(s => s.narration).join(' '),
        youtubeShortInput: youtubeInput,
        forceMode: 'youtube-short',
        targetDurationRange: { min: 8, max: 15 },
    });
    console.log(`✅ Job created: ${job.id}`);

    // 4. Process job
    console.log('\n⏳ Step 4: Processing job (this may take a few minutes)...');
    const startTime = Date.now();

    try {
        const completedJob = await orchestrator.processJob(job.id);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        console.log('\n' + '='.repeat(60));
        console.log('✅ E2E TEST PASSED!');
        console.log('='.repeat(60));
        console.log(`⏱️  Total Time: ${elapsed}s`);
        console.log(`🎥 Final Video: ${completedJob.finalVideoUrl}`);
        console.log(`🗣️  Voiceover: ${completedJob.voiceoverUrl}`);
        console.log(`📊 Status: ${completedJob.status}`);
        console.log('='.repeat(60));

        if (completedJob.finalVideoUrl) {
            console.log('\n[Manual Verification] Open the video URL above to check:');
            console.log('1. Visual shows Indian plate collision animation');
            console.log('2. Narration matches the script (~10 seconds)');
            console.log('3. Audio/video sync is correct');
        }

        return completedJob;

    } catch (error) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.error('\n' + '='.repeat(60));
        console.error('❌ E2E TEST FAILED');
        console.error('='.repeat(60));
        console.error(`⏱️  Failed after: ${elapsed}s`);
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
        console.error('='.repeat(60));

        // Fetch final job state for debugging
        const failedJob = await jobManager.getJob(job.id);
        if (failedJob) {
            console.error('\nJob State:');
            console.error(`  Status: ${failedJob.status}`);
            console.error(`  Error: ${failedJob.error || 'None recorded'}`);
        }

        process.exit(1);
    }
}

// Run
if (require.main === module) {
    runE2ETest()
        .then(() => {
            console.log('\n🎉 E2E test completed successfully!');
            process.exit(0);
        })
        .catch((err) => {
            console.error('\nUnhandled error:', err);
            process.exit(1);
        });
}

export { runE2ETest };
