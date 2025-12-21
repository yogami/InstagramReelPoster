import { getConfig } from '../src/config';
import { JobManager } from '../src/application/JobManager';
import { ReelOrchestrator, OrchestratorDependencies } from '../src/application/ReelOrchestrator';
import { CloudinaryStorageClient } from '../src/infrastructure/storage/CloudinaryStorageClient';
import { OpenAILLMClient } from '../src/infrastructure/llm/OpenAILLMClient';
import { OpenAITranscriptionClient } from '../src/infrastructure/transcription/OpenAITranscriptionClient';
import { FishAudioTTSClient } from '../src/infrastructure/tts/FishAudioTTSClient';
import { OpenAITTSClient } from '../src/infrastructure/tts/OpenAITTSClient';
import { OpenAISubtitlesClient } from '../src/infrastructure/subtitles/OpenAISubtitlesClient';
import { FFmpegVideoRenderer } from '../src/infrastructure/video/FFmpegVideoRenderer';
import { ShortstackVideoRenderer } from '../src/infrastructure/video/ShortstackVideoRenderer';
import { MusicSelector } from '../src/application/MusicSelector';
import { InMemoryMusicCatalogClient } from '../src/infrastructure/music/InMemoryMusicCatalogClient';
import { KieMusicGeneratorClient } from '../src/infrastructure/music/KieMusicGeneratorClient';
import { OpenRouterImageClient } from '../src/infrastructure/images/OpenRouterImageClient';
import { PixabayImageClient } from '../src/infrastructure/images/PixabayImageClient';
import { KieVideoClient } from '../src/infrastructure/video/KieVideoClient';
import { HookAndStructureService } from '../src/application/HookAndStructureService';
import { CaptionService } from '../src/application/CaptionService';
import { GrowthInsightsService } from '../src/application/GrowthInsightsService';
import { MockAnimatedVideoClient } from '../src/infrastructure/video/MockAnimatedVideoClient';

/**
 * SALVAGE SCRIPT
 * Use this to complete a job that failed during Kie.ai polling
 * but actually produced video clips you can see in your dashboard.
 */
async function salvage() {
    const args = process.argv.slice(2);
    const jobIdArg = args.indexOf('--jobId');
    const videoUrlArg = args.indexOf('--videoUrl');

    if (jobIdArg === -1 || videoUrlArg === -1) {
        console.error('Usage: npx ts-node scripts/salvage_final_video.ts --jobId <id> --videoUrl "url1,url2,url3"');
        process.exit(1);
    }

    const jobId = args[jobIdArg + 1];
    const videoUrlRaw = args[videoUrlArg + 1];
    const videoUrls = videoUrlRaw.includes(',') ? videoUrlRaw.split(',') : [videoUrlRaw];

    const config = getConfig();

    // Setup dependencies (mirrored from app.ts)
    const cloudinaryClient = config.cloudinaryCloudName && config.cloudinaryApiKey
        ? new CloudinaryStorageClient(config.cloudinaryCloudName, config.cloudinaryApiKey, config.cloudinaryApiSecret)
        : null;

    const transcriptionClient = new OpenAITranscriptionClient(config.openaiApiKey);
    const llmClient = new OpenAILLMClient(config.openaiApiKey, config.openaiModel);
    const ttsClient = new FishAudioTTSClient(config.fishAudioApiKey, config.fishAudioVoiceId, config.fishAudioBaseUrl);
    const fallbackTTSClient = new OpenAITTSClient(config.openaiApiKey);

    const imageClient = new OpenRouterImageClient(config.openrouterApiKey, config.openrouterModel, config.openrouterBaseUrl);
    const fallbackImageClient = config.pixabayApiKey ? new PixabayImageClient(config.pixabayApiKey) : imageClient;

    const subtitlesClient = new OpenAISubtitlesClient(config.openaiApiKey, cloudinaryClient!);

    let videoRenderer = config.videoRenderer === 'ffmpeg' && cloudinaryClient
        ? new FFmpegVideoRenderer(cloudinaryClient)
        : new ShortstackVideoRenderer(config.shotstackApiKey, config.shotstackBaseUrl);

    const internalMusicCatalog = new InMemoryMusicCatalogClient(config.internalMusicCatalogPath);
    const musicGenerator = config.kieApiKey ? new KieMusicGeneratorClient(config.kieApiKey, config.kieApiBaseUrl) : null;
    const musicSelector = new MusicSelector(internalMusicCatalog, null, musicGenerator);

    const jobManager = new JobManager(config.minReelSeconds, config.maxReelSeconds, config.redisUrl);
    const hookAndStructureService = new HookAndStructureService(llmClient);
    const captionService = new CaptionService(llmClient);
    const growthInsightsService = new GrowthInsightsService();
    const animatedVideoClient = config.kieApiKey
        ? new KieVideoClient(config.kieApiKey, config.kieVideoBaseUrl, config.kieVideoModel)
        : new MockAnimatedVideoClient() as any;

    const deps: OrchestratorDependencies = {
        transcriptionClient,
        llmClient,
        ttsClient,
        fallbackTTSClient,
        primaryImageClient: imageClient,
        fallbackImageClient: fallbackImageClient,
        subtitlesClient,
        videoRenderer,
        animatedVideoClient,
        musicSelector,
        jobManager,
        hookAndStructureService,
        captionService,
        growthInsightsService,
        storageClient: cloudinaryClient || undefined
    };

    const orchestrator = new ReelOrchestrator(deps);

    console.log(`🚀 Salvaging job ${jobId} with ${videoUrls.length} video(s)`);

    const job = await jobManager.getJob(jobId);
    if (!job) {
        throw new Error(`Job ${jobId} not found`);
    }

    const updates: any = {
        status: 'generating_subtitles'
    };

    if (videoUrls.length > 1) {
        updates.animatedVideoUrls = videoUrls;
        updates.animatedVideoUrl = videoUrls[0]; // Compatibility
    } else {
        updates.animatedVideoUrl = videoUrls[0];
    }

    await jobManager.updateJob(jobId, updates);

    console.log('📦 Resuming orchestrator from subtitles step...');
    await orchestrator.processJob(jobId);

    console.log('✅ Salvage complete!');
}

salvage().catch(console.error);
