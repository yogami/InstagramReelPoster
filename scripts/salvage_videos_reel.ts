import { ReelOrchestrator } from '../src/application/ReelOrchestrator';
import { JobManager } from '../src/application/JobManager';
import { WhisperTranscriptionClient } from '../src/infrastructure/transcription/WhisperTranscriptionClient';
import { GptLlmClient } from '../src/infrastructure/llm/GptLlmClient';
import { CloningTtsClient } from '../src/infrastructure/tts/CloningTtsClient';
import { WhisperSubtitlesClient } from '../src/infrastructure/subtitles/WhisperSubtitlesClient';
import { TimelineVideoRenderer } from '../src/infrastructure/video/TimelineVideoRenderer';
import { FFmpegVideoRenderer } from '../src/infrastructure/video/FFmpegVideoRenderer';
import { MusicSelector } from '../src/application/MusicSelector';
import { InMemoryMusicCatalogClient } from '../src/infrastructure/music/InMemoryMusicCatalogClient';
import { SegmentMusicClient } from '../src/infrastructure/music/SegmentMusicClient';
import { MultiModelVideoClient } from '../src/infrastructure/video/MultiModelVideoClient';
import { MediaStorageClient } from '../src/infrastructure/storage/MediaStorageClient';
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

    // Initialize dependencies (matching app.ts logic)
    const cloudinaryClient = config.cloudinaryCloudName && config.cloudinaryApiKey
        ? new MediaStorageClient(config.cloudinaryCloudName, config.cloudinaryApiKey, config.cloudinaryApiSecret)
        : null;

    if (!cloudinaryClient) {
        throw new Error('Cloudinary required for salvage operation (subtitles + hosting)');
    }

    const jobManager = new JobManager(config.minReelSeconds, config.maxReelSeconds, config.redisUrl);
    const transcriptionClient = new WhisperTranscriptionClient(config.openaiApiKey);
    const llmClient = new GptLlmClient(config.openaiApiKey, config.openaiModel);
    const ttsClient = new CloningTtsClient(config.fishAudioApiKey, config.fishAudioVoiceId, config.fishAudioBaseUrl);
    const subtitlesClient = new WhisperSubtitlesClient(config.openaiApiKey, cloudinaryClient);

    // Video Renderer
    const videoRenderer = config.videoRenderer === 'ffmpeg'
        ? new FFmpegVideoRenderer(cloudinaryClient)
        : new TimelineVideoRenderer(config.shotstackApiKey, config.shotstackBaseUrl);

    // Music
    const internalMusicCatalog = new InMemoryMusicCatalogClient(config.internalMusicCatalogPath);
    const musicGenerator = config.kieApiKey
        ? new SegmentMusicClient(config.kieApiKey, config.kieApiBaseUrl)
        : null;
    const musicSelector = new MusicSelector(internalMusicCatalog, null, musicGenerator);

    // Kie Video Client (needed even if we skip gen, part of orchestrator deps)
    const animatedVideoClient = new MultiModelVideoClient(config.kieApiKey, config.kieVideoBaseUrl, config.kieVideoModel);

    const orchestrator = new ReelOrchestrator({
        transcriptionClient,
        llmClient,
        ttsClient,
        fallbackImageClient: {} as any,
        subtitlesClient,
        videoRenderer,
        animatedVideoClient,
        musicSelector,
        jobManager,
        storageClient: cloudinaryClient,
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

    // Pre-populate job with transcript and URLs
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
