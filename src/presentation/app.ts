import express, { Application, Request, Response } from 'express';
import { Config } from '../config';
import { JobManager } from '../application/JobManager';
import { ReelOrchestrator, OrchestratorDependencies } from '../application/ReelOrchestrator';
import { MusicSelector } from '../application/MusicSelector';

// Infrastructure imports
import { OpenAITranscriptionClient } from '../infrastructure/transcription/OpenAITranscriptionClient';
import { OpenAILLMClient } from '../infrastructure/llm/OpenAILLMClient';
import { FishAudioTTSClient } from '../infrastructure/tts/FishAudioTTSClient';
import { InMemoryMusicCatalogClient } from '../infrastructure/music/InMemoryMusicCatalogClient';
import { KieMusicGeneratorClient } from '../infrastructure/music/KieMusicGeneratorClient';
import { OpenAIImageClient } from '../infrastructure/images/OpenAIImageClient';
import { OpenAISubtitlesClient } from '../infrastructure/subtitles/OpenAISubtitlesClient';
import { ShortstackVideoRenderer } from '../infrastructure/video/ShortstackVideoRenderer';
import { FFmpegVideoRenderer } from '../infrastructure/video/FFmpegVideoRenderer';
import { CloudinaryStorageClient } from '../infrastructure/storage/CloudinaryStorageClient';
import { IVideoRenderer } from '../domain/ports/IVideoRenderer';

// Route imports
import { createReelRoutes } from './routes/reelRoutes';
import { createJobRoutes } from './routes/jobRoutes';
import { createTelegramWebhookRoutes } from './routes/telegramWebhook';
import { errorHandler } from './middleware/errorHandler';

/**
 * Creates and configures the Express application.
 */
export function createApp(config: Config): Application {
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Health check
    app.get('/health', (req: Request, res: Response) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        });
    });

    // Create dependencies
    const { jobManager, orchestrator, cloudinaryClient } = createDependencies(config);

    // Routes
    app.use(createReelRoutes(jobManager, orchestrator));
    app.use(createJobRoutes(jobManager));
    app.use(createTelegramWebhookRoutes(jobManager, orchestrator));

    // Error handler (must be last)
    app.use(errorHandler);

    return app;
}

/**
 * Creates all dependencies with proper wiring.
 */
function createDependencies(config: Config): {
    jobManager: JobManager;
    orchestrator: ReelOrchestrator;
    cloudinaryClient: CloudinaryStorageClient | null;
} {
    // Infrastructure clients
    const transcriptionClient = new OpenAITranscriptionClient(config.openaiApiKey);
    const llmClient = new OpenAILLMClient(config.openaiApiKey, config.openaiModel);
    const ttsClient = new FishAudioTTSClient(
        config.fishAudioApiKey,
        config.fishAudioVoiceId,
        config.fishAudioBaseUrl
    );
    const imageClient = new OpenAIImageClient(config.openaiApiKey);
    const subtitlesClient = new OpenAISubtitlesClient(config.openaiApiKey);

    // Cloudinary storage client
    const cloudinaryClient = config.cloudinaryCloudName && config.cloudinaryApiKey
        ? new CloudinaryStorageClient(
            config.cloudinaryCloudName,
            config.cloudinaryApiKey,
            config.cloudinaryApiSecret
        )
        : null;

    if (cloudinaryClient) {
        console.log('✅ Cloudinary storage configured');
    } else {
        console.log('⚠️  Cloudinary not configured. Warning: Subtitles and FFmpeg rendering require cloud storage.');
    }

    // Video Renderer Selection
    let videoRenderer: IVideoRenderer;
    if (config.videoRenderer === 'ffmpeg') {
        if (!cloudinaryClient) {
            console.error('❌ FFmpeg renderer requires Cloudinary for hosting the result. Falling back to Shortstack (if configured) or erroring.');
            // Fallback logic could go here, but strict failure is better for debugging
            throw new Error('FFmpeg renderer requires Cloudinary configuration (CLOUDINARY_CLOUD_NAME, etc.)');
        }
        console.log('🎥 Using FFmpeg Video Renderer (Local)');
        videoRenderer = new FFmpegVideoRenderer(cloudinaryClient);
    } else {
        console.log('🎥 Using Shotstack Video Renderer (Cloud)');
        videoRenderer = new ShortstackVideoRenderer(
            config.shotstackApiKey,
            config.shotstackBaseUrl
        );
    }

    // Music clients
    const internalMusicCatalog = new InMemoryMusicCatalogClient(config.internalMusicCatalogPath);

    // External catalog (not implemented yet, pass null)
    const externalMusicCatalog = null;

    // Kie.ai music generator (if configured)
    const musicGenerator = config.kieApiKey
        ? new KieMusicGeneratorClient(config.kieApiKey, config.kieApiBaseUrl)
        : null;

    const musicSelector = new MusicSelector(
        internalMusicCatalog,
        externalMusicCatalog,
        musicGenerator
    );

    // Application layer
    const jobManager = new JobManager(config.minReelSeconds, config.maxReelSeconds);

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

    const orchestrator = new ReelOrchestrator(deps);

    return { jobManager, orchestrator, cloudinaryClient };
}
