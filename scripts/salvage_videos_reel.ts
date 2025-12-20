import { ReelOrchestrator } from '../src/application/ReelOrchestrator';
import { JobManager } from '../src/application/JobManager';
import { OpenAITranscriptionClient } from '../src/infrastructure/transcription/OpenAITranscriptionClient';
import { OpenAILLMClient } from '../src/infrastructure/llm/OpenAILLMClient';
import { FishAudioTTSClient } from '../src/infrastructure/tts/FishAudioTTSClient';
import { OpenAISubtitlesClient } from '../src/infrastructure/subtitles/OpenAISubtitlesClient';
import { ShortstackVideoRenderer } from '../src/infrastructure/video/ShortstackVideoRenderer';
import { FFmpegVideoRenderer } from '../src/infrastructure/video/FFmpegVideoRenderer';
import { MusicSelector } from '../src/application/MusicSelector';
import { InMemoryMusicCatalogClient } from '../src/infrastructure/music/InMemoryMusicCatalogClient';
import { CloudinaryStorageClient } from '../src/infrastructure/storage/CloudinaryStorageClient';
import { getConfig } from '../src/config';
import * as dotenv from 'dotenv';

dotenv.config();

async function salvageVideos() {
    const config = getConfig();
    const videoUrls = [
        "https://tempfile.aiquickdraw.com/h/b0410b45c0034e4a39d74cd3170cf8d3_1766270819.mp4",
        "https://tempfile.aiquickdraw.com/h/bc18ae6cc2bc94859079a4c89566f095_1766270521.mp4",
        "https://tempfile.aiquickdraw.com/h/aadd7fcf4b44db04ca2b59ffcfad2e4e_1766270377.mp4"
    ];

    const transcript = "In the pursuit of one's highest excitement, every challenge becomes a stepping stone. True success isn't about the destination, but about the flow of creative energy that guides you in every moment. Trust the process, release the tension, and let your brilliance shine through the cinematic lens of your own evolution.";

    console.log("🚀 Starting Salvage Operation...");

    // Initialize dependencies
    const jobManager = new JobManager(10, 90, process.env.REDIS_URL);
    const transcriptionClient = new OpenAITranscriptionClient(config.openaiApiKey);
    const llmClient = new OpenAILLMClient(config.openaiApiKey, config.openaiModel);
    const ttsClient = new FishAudioTTSClient(config.fishAudioApiKey, config.fishAudioVoiceId);
    const subtitlesClient = new OpenAISubtitlesClient(config.openaiApiKey);

    const storageClient = new CloudinaryStorageClient(
        config.cloudinaryCloudName!,
        config.cloudinaryApiKey!,
        config.cloudinaryApiSecret!
    );

    const renderer = config.videoRenderer === 'ffmpeg'
        ? new FFmpegVideoRenderer(storageClient)
        : new ShortstackVideoRenderer(config.shotstackApiKey, config.shotstackBaseUrl);

    const musicCatalog = new InMemoryMusicCatalogClient(config.internalMusicCatalogPath);
    // Use only internal catalog for now
    const musicSelector = new MusicSelector(musicCatalog, null, null);

    const orchestrator = new ReelOrchestrator({
        transcriptionClient,
        llmClient,
        ttsClient,
        fallbackImageClient: {} as any,
        subtitlesClient,
        videoRenderer: renderer,
        musicSelector,
        jobManager,
        storageClient,
        callbackToken: config.callbackToken,
        callbackHeader: config.callbackHeader
    });

    // Create a special job
    const jobId = `salvage_${Date.now()}`;
    await jobManager.createJob({
        sourceAudioUrl: "https://example.com/salvage-placeholder.mp3",
        targetDurationRange: { min: 25, max: 35 },
        callbackUrl: config.makeWebhookUrl
    }, jobId);

    // Pre-populate job
    await jobManager.updateJob(jobId, {
        transcript,
        isAnimatedVideoMode: true,
        animatedVideoUrls: videoUrls,
        status: 'generating_commentary',
        targetDurationSeconds: 30
    });

    console.log(`[${jobId}] Job created and patched. Running orchestrator...`);

    try {
        await orchestrator.processJob(jobId);
        console.log("✅ Salvage Operation Complete!");
    } catch (err) {
        console.error("❌ Salvage Operation Failed:", err);
    }

    process.exit(0);
}

salvageVideos().catch(err => {
    console.error(err);
    process.exit(1);
});
