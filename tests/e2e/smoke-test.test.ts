import { ReelOrchestrator, OrchestratorDependencies } from '../../src/application/ReelOrchestrator';
import { JobManager } from '../../src/application/JobManager';
import { OpenAITranscriptionClient } from '../../src/infrastructure/transcription/OpenAITranscriptionClient';
import { OpenAILLMClient } from '../../src/infrastructure/llm/OpenAILLMClient';
import { FishAudioTTSClient } from '../../src/infrastructure/tts/FishAudioTTSClient';
import { OpenAIImageClient } from '../../src/infrastructure/images/OpenAIImageClient';
import { OpenAISubtitlesClient } from '../../src/infrastructure/subtitles/OpenAISubtitlesClient';
import { ShortstackVideoRenderer } from '../../src/infrastructure/video/ShortstackVideoRenderer';
import { InMemoryMusicCatalogClient } from '../../src/infrastructure/music/InMemoryMusicCatalogClient';
import { MusicSelector } from '../../src/application/MusicSelector';
import { getConfig } from '../../src/config';

/**
 * SMOKE TEST - Uses REAL APIs
 * 
 * This test hits actual external services (OpenAI, Fish Audio, Shotstack)
 * to validate end-to-end integration with real data.
 * 
 * Cost: ~$0.15 per run (10s video)
 * Duration: ~2-5 minutes
 * 
 * Run with: npm test -- smoke-test.test.ts --runInBand --testTimeout=300000
 * 
 * Skip in CI by default (requires real API keys).
 */
describe('Smoke Test - Real API Integration', () => {
    // Skip by default - only run when explicitly requested
    const shouldRun = process.env.RUN_SMOKE_TESTS === 'true';

    (shouldRun ? describe : describe.skip)('Real reel generation', () => {
        let orchestrator: ReelOrchestrator;
        let jobManager: JobManager;

        beforeAll(() => {
            // Load real configuration
            const config = getConfig();

            // Validate required keys are present
            if (!config.openaiApiKey) {
                throw new Error('OPENAI_API_KEY required for smoke tests');
            }
            if (!config.fishAudioApiKey) {
                throw new Error('FISH_AUDIO_API_KEY required for smoke tests');
            }
            if (!config.shotstackApiKey) {
                throw new Error('SHOTSTACK_API_KEY required for smoke tests');
            }

            // Initialize real clients
            jobManager = new JobManager(10, 15); // Force short duration (10-15s)

            const transcriptionClient = new OpenAITranscriptionClient(
                config.openaiApiKey,
                'https://api.openai.com'
            );
            const llmClient = new OpenAILLMClient(
                config.openaiApiKey,
                config.openaiModel,
                'https://api.openai.com'
            );
            const ttsClient = new FishAudioTTSClient(
                config.fishAudioApiKey,
                config.fishAudioBaseUrl,
                config.fishAudioVoiceId
            );
            const imageClient = new OpenAIImageClient(
                config.openaiApiKey,
                'https://api.openai.com'
            );
            const subtitlesClient = new OpenAISubtitlesClient(
                config.openaiApiKey,
                'https://api.openai.com'
            );
            const videoRenderer = new ShortstackVideoRenderer(
                config.shotstackApiKey,
                config.shotstackBaseUrl
            );

            // Use internal music catalog
            const musicCatalog = new InMemoryMusicCatalogClient(
                config.internalMusicCatalogPath
            );
            const musicSelector = new MusicSelector(musicCatalog, null, null);

            const deps: OrchestratorDependencies = {
                transcriptionClient,
                llmClient,
                ttsClient,
                imageClient,
                subtitlesClient,
                videoRenderer,
                musicSelector,
                jobManager,
            };

            orchestrator = new ReelOrchestrator(deps);
        });

        it('should generate a real 10-second reel from voice sample', async () => {
            console.log('\n🎬 Starting smoke test - generating real reel...\n');

            // TODO: Replace with actual voice sample URL
            // For now, using a placeholder - you'll need to upload a real 10s voice note
            const testVoiceSampleUrl = process.env.TEST_VOICE_SAMPLE_URL ||
                'https://file-examples.com/storage/fe5e5a9f8e6e3e1e8e8e8e8/2017/11/file_example_MP3_700KB.mp3';

            console.log(`📝 Input: ${testVoiceSampleUrl}`);

            const job = jobManager.createJob({
                sourceAudioUrl: testVoiceSampleUrl,
                targetDurationRange: { min: 10, max: 15 }
            });

            console.log(`🆔 Job ID: ${job.id}`);
            console.log('⏳ Processing (this takes 2-5 minutes)...\n');

            const result = await orchestrator.processJob(job.id);

            // Assertions
            expect(result.status).toBe('completed');
            expect(result.finalVideoUrl).toBeDefined();
            expect(result.error).toBeUndefined();

            // Output for manual verification
            console.log('\n✅ SMOKE TEST COMPLETED\n');
            console.log('═══════════════════════════════════════════════════');
            console.log('📊 RESULTS:');
            console.log('═══════════════════════════════════════════════════');
            console.log(`Input Voice: ${testVoiceSampleUrl}`);
            console.log(`Transcript: "${result.transcript?.substring(0, 100)}..."`);
            console.log(`Segments: ${result.segments?.length}`);
            console.log(`Duration: ${result.voiceoverDurationSeconds?.toFixed(1)}s`);
            console.log(`Music: ${result.musicSource} (${result.musicUrl})`);
            console.log('\n🎥 FINAL VIDEO URL:');
            console.log(result.finalVideoUrl);
            console.log('═══════════════════════════════════════════════════');
            console.log('\n👀 Please manually verify:');
            console.log('   1. Listen to input voice sample');
            console.log('   2. Watch generated video');
            console.log('   3. Verify content matches and makes sense\n');

        }, 300000); // 5 minute timeout
    });
});
