import express, { Application, Request, Response } from 'express';
import cors from 'cors';
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
import { OpenRouterImageClient } from '../infrastructure/images/OpenRouterImageClient';
import { BeamcloudImageClient } from '../infrastructure/images/BeamcloudImageClient';
import { FallbackImageClient } from '../infrastructure/images/FallbackImageClient';
// OpenAIImageClient available but not currently used
import { PixabayImageClient } from '../infrastructure/images/PixabayImageClient';
import { OpenAISubtitlesClient } from '../infrastructure/subtitles/OpenAISubtitlesClient';
import { ShortstackVideoRenderer } from '../infrastructure/video/ShortstackVideoRenderer';
import { FFmpegVideoRenderer } from '../infrastructure/video/FFmpegVideoRenderer';
import { KieVideoClient } from '../infrastructure/video/KieVideoClient';
import { BeamcloudVideoClient } from '../infrastructure/video/BeamcloudVideoClient';
import { FallbackVideoClient } from '../infrastructure/video/FallbackVideoClient';
import { BeamcloudVideoRenderer } from '../infrastructure/video/BeamcloudVideoRenderer';
import { FallbackVideoRenderer } from '../infrastructure/video/FallbackVideoRenderer';
import { CloudinaryStorageClient } from '../infrastructure/storage/CloudinaryStorageClient';
import { WebsiteScraperClient } from '../infrastructure/scraper/WebsiteScraperClient';
import { TelegramService } from './services/TelegramService';
import { TelegramNotificationClient } from '../infrastructure/notifications/TelegramNotificationClient';
import { IVideoRenderer } from '../domain/ports/IVideoRenderer';

import { OpenAITTSClient } from '../infrastructure/tts/OpenAITTSClient';
import { XTTSTTSClient } from '../infrastructure/tts/XTTSTTSClient';
import { LocalLLMClient } from '../infrastructure/llm/LocalLLMClient';
import { MockAnimatedVideoClient } from '../infrastructure/video/MockAnimatedVideoClient';

// Growth Layer Imports
import { HookAndStructureService } from '../application/HookAndStructureService';
import { CaptionService } from '../application/CaptionService';
import { GrowthInsightsService } from '../application/GrowthInsightsService';

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
    app.use(cors({
        origin: [
            'http://localhost:8080',
            'http://localhost:3000',
            'https://reelberlin-demo-production.up.railway.app'
        ],
        credentials: true
    }));
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
    const { jobManager, orchestrator, growthInsightsService } = createDependencies(config);

    // Auto-resume interrupted jobs
    import('../application/ResumeService').then(({ ResumeService }) => {
        const resumeService = new ResumeService(jobManager, orchestrator);
        resumeService.resumeAll().catch(err => console.error('ResumeService failure:', err));
    });

    // Routes
    app.use('/api', createReelRoutes(jobManager, orchestrator, growthInsightsService));
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
    growthInsightsService: GrowthInsightsService;
    cloudinaryClient: CloudinaryStorageClient | null;
} {
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

    // Infrastructure clients - OpenAI for transcription/LLM, Fish Audio for TTS, OpenRouter for images  
    // Use OpenAI Whisper (now enhanced with local FFmpeg compression for large files)
    const transcriptionClient = new OpenAITranscriptionClient(config.openaiApiKey);

    // LLM Client Selection (Personal Clone feature flag)
    const llmClient = config.featureFlags.usePersonalCloneLLM
        ? (() => {
            console.log('🧠 Using Local LLM (Personal Clone mode)');
            return new LocalLLMClient(
                config.personalClone.localLLMUrl,
                'llama3.2',
                config.personalClone.systemPrompt
            );
        })()
        : new OpenAILLMClient(config.openaiApiKey, config.openaiModel);

    // TTS Client Selection (Personal Clone feature flag)
    const ttsClient = config.featureFlags.usePersonalCloneTTS
        ? (() => {
            console.log('🎙️ Using XTTS Local TTS (Personal Clone mode)');
            return new XTTSTTSClient(config.personalClone.xttsServerUrl);
        })()
        : new FishAudioTTSClient(
            config.fishAudioApiKey,
            config.fishAudioVoiceId,
            config.fishAudioBaseUrl
        );
    // Image clients - OpenRouter is now REQUIRED (no more DALL-E)
    if (!config.openrouterApiKey) {
        throw new Error('OPENROUTER_API_KEY is required for image generation');
    }

    // Create OpenRouter client (always needed as fallback)
    const openRouterClient = new OpenRouterImageClient(
        config.openrouterApiKey,
        config.openrouterModel,
        config.openrouterBaseUrl
    );

    // Use Beam.cloud FLUX1 as primary when enabled, with OpenRouter as fallback
    let imageClient;
    if (config.beamcloudEnabled && config.beamcloudApiKey && config.beamcloudEndpointUrl) {
        const beamClient = new BeamcloudImageClient(
            config.beamcloudApiKey,
            config.beamcloudEndpointUrl
        );
        imageClient = new FallbackImageClient(beamClient, openRouterClient, 'Beam.cloud FLUX1', 'OpenRouter');
        console.log('✅ Image generation: Beam.cloud FLUX1 (primary) → OpenRouter (fallback)');
    } else {
        imageClient = openRouterClient;
        console.log('✅ Image generation: OpenRouter (primary)');
    }

    // Fallback Image Client (Pixabay = Free, OpenRouter = Paid)
    const fallbackImageClient = config.pixabayApiKey
        ? new PixabayImageClient(config.pixabayApiKey)
        : imageClient;

    // Use same OpenRouter client for both primary and fallback
    const subtitlesClient = new OpenAISubtitlesClient(config.openaiApiKey, cloudinaryClient!);
    const fallbackTTSClient = new OpenAITTSClient(config.openaiApiKey);

    // Video Renderer Selection
    let videoRenderer: IVideoRenderer;

    if (config.videoRenderer === 'ffmpeg') {
        // Local FFmpeg (legacy/dev mode)
        if (!cloudinaryClient) {
            throw new Error('FFmpeg renderer requires Cloudinary configuration');
        }
        console.log('🎥 Using FFmpeg Video Renderer (Local)');
        videoRenderer = new FFmpegVideoRenderer(cloudinaryClient);
    } else {
        // Cloud Renderers
        const shotstackRenderer = new ShortstackVideoRenderer(
            config.shotstackApiKey,
            config.shotstackBaseUrl
        );

        if (config.beamcloudRenderEnabled && config.beamcloudApiKey && config.beamcloudRenderEndpointUrl) {
            const beamRenderer = new BeamcloudVideoRenderer(
                config.beamcloudApiKey,
                config.beamcloudRenderEndpointUrl
            );
            videoRenderer = new FallbackVideoRenderer(beamRenderer, shotstackRenderer, 'Beam.cloud FFmpeg', 'Shotstack');
            console.log('🎥 Video rendering: Beam.cloud FFmpeg (primary) → Shotstack (fallback)');
        } else {
            videoRenderer = shotstackRenderer;
            console.log('🎥 Video rendering: Shotstack (primary)');
        }
    }

    // Music clients
    const internalMusicCatalog = new InMemoryMusicCatalogClient(config.internalMusicCatalogPath);

    // External catalog (Optional - Not used for now)
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
    const jobManager = new JobManager(
        config.minReelSeconds,
        config.maxReelSeconds,
        config.redisUrl
    );

    // Notification client (optional)
    const telegramService = config.telegramBotToken
        ? new TelegramService(config.telegramBotToken)
        : null;
    const notificationClient = telegramService
        ? new TelegramNotificationClient(telegramService)
        : undefined;

    // Animated Video Client - Beam.cloud (primary) with Kie.ai (fallback)
    let animatedVideoClient;
    const kieVideoClient = config.kieApiKey
        ? new KieVideoClient(config.kieApiKey, config.kieVideoBaseUrl, config.kieVideoModel)
        : new MockAnimatedVideoClient();

    if (config.beamcloudVideoEnabled && config.beamcloudApiKey && config.beamcloudVideoEndpointUrl) {
        const beamVideoClient = new BeamcloudVideoClient(
            config.beamcloudApiKey,
            config.beamcloudVideoEndpointUrl
        );
        animatedVideoClient = new FallbackVideoClient(beamVideoClient, kieVideoClient, 'Beam.cloud Mochi', 'Kie.ai');
        console.log('✅ Video generation: Beam.cloud Mochi (primary) → Kie.ai (fallback)');
    } else {
        animatedVideoClient = kieVideoClient;
        console.log('✅ Video generation: Kie.ai (primary)');
    }

    // Phase 2: Growth Layer Services
    const hookAndStructureService = new HookAndStructureService(llmClient);
    const captionService = new CaptionService(llmClient);
    const growthInsightsService = new GrowthInsightsService();
    const websiteScraperClient = new WebsiteScraperClient();

    const deps: OrchestratorDependencies = {
        transcriptionClient,
        llmClient,
        ttsClient,
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
        notificationClient,
        fallbackTTSClient,
        storageClient: cloudinaryClient || undefined,
        callbackToken: config.callbackToken,
        callbackHeader: config.callbackHeader,
        websiteScraperClient,
    };

    console.log(`📡 Callback configured: Header = ${deps.callbackHeader}, Token = ${deps.callbackToken ? (deps.callbackToken.substring(0, 5) + '...') : 'None'} `);

    const orchestrator = new ReelOrchestrator(deps);

    return { jobManager, orchestrator, growthInsightsService, cloudinaryClient };
}
