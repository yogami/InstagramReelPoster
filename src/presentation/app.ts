import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { Config } from '../config';
import { JobManager } from '../application/JobManager';
import { ReelOrchestrator, OrchestratorDependencies } from '../application/ReelOrchestrator';
import { MusicSelector } from '../application/MusicSelector';

// Infrastructure imports
import { WhisperTranscriptionClient } from '../infrastructure/transcription/WhisperTranscriptionClient';
import { GptLlmClient } from '../infrastructure/llm/GptLlmClient';
import { CloningTtsClient } from '../infrastructure/tts/CloningTtsClient';
import { InMemoryMusicCatalogClient } from '../infrastructure/music/InMemoryMusicCatalogClient';
import { SegmentMusicClient } from '../infrastructure/music/SegmentMusicClient';
import { MultiModelImageClient } from '../infrastructure/images/MultiModelImageClient';
import { FluxImageClient } from '../infrastructure/images/FluxImageClient';
import { FallbackImageClient } from '../infrastructure/images/FallbackImageClient';
// DalleImageClient available but not currently used
import { StockImageClient } from '../infrastructure/images/StockImageClient';
import { WhisperSubtitlesClient } from '../infrastructure/subtitles/WhisperSubtitlesClient';
import { TimelineVideoRenderer } from '../infrastructure/video/TimelineVideoRenderer';
import { FFmpegVideoRenderer } from '../infrastructure/video/FFmpegVideoRenderer';
import { MultiModelVideoClient } from '../infrastructure/video/MultiModelVideoClient';
import { HunyuanVideoClient } from '../infrastructure/video/HunyuanVideoClient';
import { MochiVideoClient } from '../infrastructure/video/MochiVideoClient';
import { FallbackVideoClient } from '../infrastructure/video/FallbackVideoClient';
import { RemoteVideoRenderer } from '../infrastructure/video/RemoteVideoRenderer';
import { FallbackVideoRenderer } from '../infrastructure/video/FallbackVideoRenderer';
import { MediaStorageClient } from '../infrastructure/storage/MediaStorageClient';
import { WebsiteScraperClient } from '../infrastructure/scraper/WebsiteScraperClient';
import { EnhancedWebsiteScraper } from '../infrastructure/scraper/EnhancedWebsiteScraper';
// ... existing imports ...


import { ChatService } from './services/ChatService';
import { ChatNotificationClient } from '../infrastructure/notifications/ChatNotificationClient';
import { IVideoRenderer } from '../domain/ports/IVideoRenderer';
import { IImageClient } from '../domain/ports/IImageClient';
import { IAnimatedVideoClient } from '../domain/ports/IAnimatedVideoClient';

import { StandardTtsClient } from '../infrastructure/tts/StandardTtsClient';
import { XttsClient } from '../infrastructure/tts/XttsClient';
import { LocalLlmClient } from '../infrastructure/llm/LocalLlmClient';
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
export function createDependencies(config: Config): {
    jobManager: JobManager;
    orchestrator: ReelOrchestrator;
    growthInsightsService: GrowthInsightsService;
    cloudinaryClient: MediaStorageClient | null;
} {
    const cloudinaryClient = createCloudinaryClient(config);
    const llmClient = createLlmClient(config);
    const ttsClient = createTtsClient(config);
    const fallbackTtsClient = new StandardTtsClient(config.llmApiKey);
    const { primaryImageClient, fallbackImageClient } = createImageClients(config);
    const transcriptionClient = new WhisperTranscriptionClient(config.llmApiKey);
    const subtitlesClient = new WhisperSubtitlesClient(config.llmApiKey, cloudinaryClient!);
    const videoRenderer = createVideoRenderer(config, cloudinaryClient);
    const animatedVideoClient = createAnimatedVideoClient(config);
    const musicSelector = createMusicSelector(config);
    const jobManager = new JobManager(config.minReelSeconds, config.maxReelSeconds, config.redisUrl);
    const notificationClient = createNotificationClient(config);
    const websiteScraperClient = config.featureFlags.usePlaywrightScraper
        ? new EnhancedWebsiteScraper()
        : new WebsiteScraperClient();

    if (config.featureFlags.usePlaywrightScraper) {
        console.log('🕷️ Using Enhanced Playwright Scraper');
    } else {
        console.log('🕷️ Using Standard HTTP Scraper');
    }

    // Growth Layer Services
    const hookAndStructureService = new HookAndStructureService(llmClient);
    const captionService = new CaptionService(llmClient);
    const growthInsightsService = new GrowthInsightsService();

    const deps: OrchestratorDependencies = {
        transcriptionClient,
        llmClient,
        ttsClient,
        primaryImageClient,
        fallbackImageClient,
        subtitlesClient,
        videoRenderer,
        animatedVideoClient,
        musicSelector,
        jobManager,
        hookAndStructureService,
        captionService,
        growthInsightsService,
        notificationClient,
        fallbackTtsClient,
        storageClient: cloudinaryClient || undefined,
        callbackToken: config.callbackToken,
        callbackHeader: config.callbackHeader,
        websiteScraperClient,
    };

    console.log(`📡 Callback configured: Header = ${deps.callbackHeader}, Token = ${deps.callbackToken ? (deps.callbackToken.substring(0, 5) + '...') : 'None'} `);

    const orchestrator = new ReelOrchestrator(deps);
    return { jobManager, orchestrator, growthInsightsService, cloudinaryClient };
}

// --- Helper Functions ---

function createCloudinaryClient(config: Config): MediaStorageClient | null {
    if (config.cloudinaryCloudName && config.cloudinaryApiKey) {
        console.log('✅ Cloudinary storage configured');
        return new MediaStorageClient(
            config.cloudinaryCloudName,
            config.cloudinaryApiKey,
            config.cloudinaryApiSecret
        );
    }
    console.log('⚠️  Cloudinary not configured.');
    return null;
}

function createLlmClient(config: Config) {
    if (config.featureFlags.usePersonalCloneLLM) {
        console.log('🧠 Using Local LLM (Personal Clone mode)');
        return new LocalLlmClient(
            config.personalClone.localLLMUrl,
            'llama3.2',
            config.personalClone.systemPrompt
        );
    }
    return new GptLlmClient(config.llmApiKey, config.llmModel);
}

function createTtsClient(config: Config) {
    if (config.featureFlags.usePersonalCloneTTS) {
        console.log('🎙️ Using XTTS Local TTS (Personal Clone mode)');
        return new XttsClient(config.personalClone.xttsServerUrl);
    }
    return new CloningTtsClient(
        config.ttsCloningApiKey,
        config.ttsCloningVoiceId,
        config.ttsCloningBaseUrl
    );
}

function createImageClients(config: Config): { primaryImageClient: IImageClient; fallbackImageClient: IImageClient } {
    if (!config.multiModelImageApiKey) {
        throw new Error('OPENROUTER_API_KEY (multiModelImageApiKey) is required for image generation');
    }

    const multiModelImageClient = new MultiModelImageClient(
        config.multiModelImageApiKey,
        config.multiModelImageModel,
        config.multiModelImageBaseUrl
    );

    let primaryImageClient: IImageClient;
    if (config.fluxEnabled && config.fluxApiKey && config.fluxEndpointUrl) {
        const fluxClient = new FluxImageClient(config.fluxApiKey, config.fluxEndpointUrl);
        primaryImageClient = new FallbackImageClient(fluxClient, multiModelImageClient, 'Flux', 'MultiModel');
        console.log('✅ Image generation: Flux (primary) → MultiModel (fallback)');
    } else {
        primaryImageClient = multiModelImageClient;
        console.log('✅ Image generation: MultiModel (primary)');
    }

    const fallbackImageClient = config.stockApiKey
        ? new StockImageClient(config.stockApiKey)
        : primaryImageClient;

    return { primaryImageClient, fallbackImageClient };
}

function createVideoRenderer(config: Config, cloudinaryClient: MediaStorageClient | null): IVideoRenderer {
    if (config.videoRenderer === 'ffmpeg') {
        if (!cloudinaryClient) throw new Error('FFmpeg renderer requires Cloudinary configuration');
        console.log('🎬 Using FFmpeg Video Renderer (Local)');
        return new FFmpegVideoRenderer(cloudinaryClient);
    }

    const timelineRenderer = new TimelineVideoRenderer(config.timelineApiKey, config.timelineBaseUrl);
    if (config.remoteRenderEnabled && config.fluxApiKey && config.remoteRenderEndpointUrl) {
        const remoteRenderer = new RemoteVideoRenderer(config.fluxApiKey, config.remoteRenderEndpointUrl);
        console.log('🎬 Video rendering: Remote (primary) → Timeline (fallback)');
        return new FallbackVideoRenderer(remoteRenderer, timelineRenderer, 'Remote', 'Timeline');
    }
    console.log('🎬 Video rendering: Timeline (primary)');
    return timelineRenderer;
}

function createAnimatedVideoClient(config: Config) {
    const mock = new MockAnimatedVideoClient();
    const beamTimeout = 600000; // 10 minutes is enough/fair for Beam H100s

    // 1. Prepare the MultiModel (Kling-2) as the high-quality fallback
    let klingFallback: IAnimatedVideoClient = mock;
    if (config.multiModelApiKey) {
        klingFallback = new MultiModelVideoClient(
            config.multiModelApiKey,
            config.multiModelVideoBaseUrl,
            config.multiModelVideoModel
        );
        // Ensure Kling also has a mock safety net
        klingFallback = new FallbackVideoClient(klingFallback, mock, 'Kling-KieAI', 'Mock');
    }

    // 2. Prioritize Remote Video (Hunyuan/Mochi on Beam.cloud)
    if (config.remoteVideoEnabled && config.fluxApiKey) {
        const hunyuanUrl = config.remoteVideoEndpointUrl;
        const mochiUrl = config.remoteMochiEndpointUrl;

        // Chain structure: Hunyuan -> (Mochi) -> Kling -> Mock

        if (hunyuanUrl && mochiUrl) {
            const hunyuan = new HunyuanVideoClient(config.fluxApiKey, hunyuanUrl, beamTimeout);
            const mochi = new MochiVideoClient(config.fluxApiKey, mochiUrl, beamTimeout);

            const mochiChain = new FallbackVideoClient(mochi, klingFallback, 'Mochi', 'Kling-Mock');
            console.log('✅ Video generation: Hunyuan (primary) → Mochi (fallback) → Kling (reliable) → Mock (safety)');
            return new FallbackVideoClient(hunyuan, mochiChain, 'Hunyuan', 'Mochi-Kling-Mock');
        }

        if (hunyuanUrl) {
            const hunyuan = new HunyuanVideoClient(config.fluxApiKey, hunyuanUrl, beamTimeout);
            console.log('✅ Video generation: Hunyuan (primary) → Kling (reliable) → Mock (safety)');
            return new FallbackVideoClient(hunyuan, klingFallback, 'Hunyuan', 'Kling-Mock');
        }

        if (mochiUrl) {
            const mochi = new MochiVideoClient(config.fluxApiKey, mochiUrl, beamTimeout);
            console.log('✅ Video generation: Mochi (primary) → Kling (reliable) → Mock (safety)');
            return new FallbackVideoClient(mochi, klingFallback, 'Mochi', 'Kling-Mock');
        }
    }

    // 3. If Beam is disabled or missing endpoints, just use Kling
    if (config.multiModelApiKey) {
        console.log('✅ Video generation: Kling (primary) → Mock (fallback)');
        return klingFallback;
    }

    console.log('⚠️  Video generation: Mock only (no providers configured)');
    return mock;
}

function createMusicSelector(config: Config) {
    const internalMusicCatalog = new InMemoryMusicCatalogClient(config.internalMusicCatalogPath);
    const musicGenerator = config.multiModelApiKey
        ? new SegmentMusicClient(config.multiModelApiKey, config.multiModelMusicBaseUrl)
        : null;
    return new MusicSelector(internalMusicCatalog, null, musicGenerator);
}

function createNotificationClient(config: Config) {
    const telegramService = config.telegramBotToken ? new ChatService(config.telegramBotToken) : null;
    return telegramService ? new ChatNotificationClient(telegramService) : undefined;
}
