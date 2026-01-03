import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { Config } from '../config';
import { JobManager } from '../application/JobManager';
import { ReelOrchestrator, OrchestratorDependencies } from '../application/ReelOrchestrator';
import { MusicSelector } from '../application/MusicSelector';

// Infrastructure imports
import { WhisperTranscriptionClient } from '../infrastructure/transcription/WhisperTranscriptionClient';
import { GptLlmClient } from '../infrastructure/llm/GptLlmClient';
import { FallbackLlmClient } from '../infrastructure/llm/FallbackLlmClient';
import { LocalLlmClient } from '../infrastructure/llm/LocalLlmClient';
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
import { createWebsitePromoSlice } from '../lib/website-promo';
import { WebsiteScraperAdapter } from '../lib/website-promo/adapters/WebsiteScraperAdapter';
import { ScriptGenerationAdapter } from '../lib/website-promo/adapters/ScriptGenerationAdapter';
import { AssetGenerationAdapter } from '../lib/website-promo/adapters/AssetGenerationAdapter';
import { RenderingAdapter } from '../lib/website-promo/adapters/RenderingAdapter';
import { DeepLTranslationAdapter } from '../lib/website-promo/adapters/DeepLTranslationAdapter';
import { FallbackTranslationAdapter, NoOpTranslationAdapter } from '../lib/website-promo/adapters/FallbackTranslationAdapter';
import { InMemoryTemplateRepository } from '../lib/website-promo/adapters/InMemoryTemplateRepository';
import { InMemoryCacheAdapter } from '../lib/website-promo/adapters/InMemoryCacheAdapter';
import { RedisCacheAdapter } from '../lib/website-promo/adapters/RedisCacheAdapter';
import { ConsoleMetricsAdapter } from '../lib/website-promo/adapters/ConsoleMetricsAdapter';
import { HeyGenAvatarAdapter } from '../lib/website-promo/adapters/HeyGenAvatarAdapter';
import { SadTalkerAvatarAdapter } from '../lib/website-promo/adapters/SadTalkerAvatarAdapter';
import { MockAvatarAdapter } from '../lib/website-promo/adapters/MockAvatarAdapter';
import { BullMqJobQueueAdapter } from '../lib/website-promo/adapters/BullMqJobQueueAdapter';
import { WebsitePromoWorker } from '../lib/website-promo/application/WebsitePromoWorker';
import { PrometheusMetricsAdapter } from '../lib/website-promo/adapters/PrometheusMetricsAdapter';
import { IMetricsPort } from '../lib/website-promo/ports/IMetricsPort';


import { ChatService } from './services/ChatService';
import { ChatNotificationClient } from '../infrastructure/notifications/ChatNotificationClient';
import { IVideoRenderer } from '../domain/ports/IVideoRenderer';
import { IImageClient } from '../domain/ports/IImageClient';
import { IAnimatedVideoClient } from '../domain/ports/IAnimatedVideoClient';

import { StandardTtsClient } from '../infrastructure/tts/StandardTtsClient';
import { XttsClient } from '../infrastructure/tts/XttsClient';
import { GuardianComplianceAdapter } from '../lib/website-promo/adapters/GuardianComplianceAdapter';
import { GuardianClient } from '../infrastructure/compliance/GuardianClient';
import { ZeroRetentionService } from '../infrastructure/compliance/ZeroRetentionService';
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
    const { jobManager, orchestrator, growthInsightsService, metricsPort } = createDependencies(config);

    // Metrics endpoint
    app.get('/metrics', async (req: Request, res: Response) => {
        if (metricsPort instanceof PrometheusMetricsAdapter) {
            res.set('Content-Type', 'text/plain');
            res.send(await metricsPort.getMetrics());
        } else {
            res.status(404).send('Metrics not available');
        }
    });

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
    metricsPort: IMetricsPort;
} {
    console.log('🏗️  Creating dependency graph...');
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

    console.log('📦 Initializing JobManager...');
    const jobManager = new JobManager(config.minReelSeconds, config.maxReelSeconds, config.redisUrl);

    const notificationClient = createNotificationClient(config);
    const websiteScraperClient = config.featureFlags.usePlaywrightScraper
        ? new EnhancedWebsiteScraper()
        : new WebsiteScraperClient();

    // Growth Layer Services
    const hookAndStructureService = new HookAndStructureService(llmClient);
    const captionService = new CaptionService(llmClient);
    const growthInsightsService = new GrowthInsightsService();

    // 4. Setup Website Promo Slice (Phase 3 Decoupling)
    let websitePromoSlice = undefined;
    if (config.featureFlags.enableWebsitePromoSlice) {
        console.log('🚀 Initializing independent WebsitePromoSlice with Enterprise Hardening...');

        // Resilience: Primary DeepL -> Secondary NoOp (Pipeline remains stable if DeepL throttles)
        const primaryTranslation = new DeepLTranslationAdapter(config.deeplApiKey);
        const secondaryTranslation = new NoOpTranslationAdapter();
        const translationPort = new FallbackTranslationAdapter(
            primaryTranslation,
            secondaryTranslation,
            'DeepL',
            'English-Fallback'
        );

        const templateRepository = new InMemoryTemplateRepository();

        // Scalability: Use Redis for high-concurrency caching if available
        const cachePort = config.redisUrl
            ? new RedisCacheAdapter(config.redisUrl)
            : new InMemoryCacheAdapter();

        const metricsPort = new PrometheusMetricsAdapter();

        // 🛡️ Compliance Strategy: Berlin Specialist (Guardian AI + Zero Retention)
        const guardianClient = new GuardianClient({
            baseUrl: config.guardianApiUrl
        });
        const zeroRetentionService = new ZeroRetentionService();
        const compliancePort = new GuardianComplianceAdapter(
            guardianClient,
            zeroRetentionService
        );

        // 🚀 SCALABILITY: Background Job Queue (BullMQ)
        const jobQueuePort = config.redisUrl
            ? new BullMqJobQueueAdapter(config.redisUrl)
            : undefined;

        let avatarPort: any;
        if (config.sadTalkerEndpointUrl && config.fluxApiKey) {
            console.log('🤖 Avatar Strategy: GPU Offloading (SadTalker on Beam.cloud)');
            avatarPort = new SadTalkerAvatarAdapter(config.fluxApiKey, config.sadTalkerEndpointUrl);
        } else if (config.heygenApiKey) {
            console.log('🤖 Avatar Strategy: Managed Service (HeyGen V2)');
            avatarPort = new HeyGenAvatarAdapter(config.heygenApiKey);
        } else {
            console.log('🤖 Avatar Strategy: Mock (Development Mode)');
            avatarPort = new MockAvatarAdapter();
        }

        websitePromoSlice = createWebsitePromoSlice({
            scrapingPort: new WebsiteScraperAdapter(websiteScraperClient),
            scriptPort: new ScriptGenerationAdapter(llmClient),
            assetPort: new AssetGenerationAdapter(
                ttsClient,
                primaryImageClient,
                musicSelector,
                subtitlesClient,
                cloudinaryClient!
            ),
            renderingPort: new RenderingAdapter(videoRenderer),
            translationPort,
            templateRepository,
            cachePort,
            metricsPort,
            compliancePort,
            avatarPort,
            jobQueuePort
        });

        // ⚙️ WORKER: Initialize background worker to process the queue
        if (config.redisUrl) {
            console.log('👷 Initializing WebsitePromoWorker (Concurrency: 2)...');
            new WebsitePromoWorker(websitePromoSlice.orchestrator, config.redisUrl);
        }
    }

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
        websitePromoSlice,
    };

    console.log(`📡 Callback configured: Header = ${deps.callbackHeader}, Token = ${deps.callbackToken ? (deps.callbackToken.substring(0, 5) + '...') : 'None'} `);

    console.log('⚙️  Wiring up ReelOrchestrator...');
    const orchestrator = new ReelOrchestrator(deps);
    console.log('✅ Dependency graph complete');
    return {
        jobManager,
        orchestrator,
        growthInsightsService,
        cloudinaryClient,
        metricsPort: (websitePromoSlice as any)?.orchestrator?.deps?.metricsPort || new ConsoleMetricsAdapter()
    };
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

    const openAiClient = new GptLlmClient(config.llmApiKey, config.llmModel, config.llmBaseUrl);

    // If OpenRouter is configured, it acts as the automatic safety fallback
    if (config.openRouterApiKey) {
        const openRouterClient = new GptLlmClient(config.openRouterApiKey, config.openRouterModel, config.openRouterBaseUrl);
        console.log(`🤖 LLM Layer: OpenAI (primary) → OpenRouter (automatic fallback: ${config.openRouterModel})`);
        return new FallbackLlmClient(openAiClient, openRouterClient, 'OpenAI', 'OpenRouter');
    }

    // Only OpenAI
    console.log(`🤖 LLM Layer: OpenAI (primary only: ${config.llmModel})`);
    return openAiClient;
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

    // Stock is always available as ultimate fallback (if API key exists)
    const stockClient = config.stockApiKey
        ? new StockImageClient(config.stockApiKey)
        : null;

    let primaryImageClient: IImageClient;

    if (config.fluxEnabled && config.fluxApiKey && config.fluxEndpointUrl) {
        const fluxClient = new FluxImageClient(config.fluxApiKey, config.fluxEndpointUrl);

        // 2-tier chain: Flux -> MultiModel
        const fluxMultiModelChain = new FallbackImageClient(fluxClient, multiModelImageClient, 'Flux', 'MultiModel');

        // 3-tier chain: (Flux -> MultiModel) -> Stock
        if (stockClient) {
            primaryImageClient = new FallbackImageClient(fluxMultiModelChain, stockClient, 'Flux+MultiModel', 'Stock');
            console.log('✅ Image generation: Flux (primary) → MultiModel → Stock (ultimate fallback)');
        } else {
            primaryImageClient = fluxMultiModelChain;
            console.log('✅ Image generation: Flux (primary) → MultiModel (fallback)');
        }
    } else {
        // No Flux: MultiModel -> Stock
        if (stockClient) {
            primaryImageClient = new FallbackImageClient(multiModelImageClient, stockClient, 'MultiModel', 'Stock');
            console.log('✅ Image generation: MultiModel (primary) → Stock (fallback)');
        } else {
            primaryImageClient = multiModelImageClient;
            console.log('✅ Image generation: MultiModel (primary only)');
        }
    }

    // fallbackImageClient is kept for backward compatibility (used by some steps separately)
    const fallbackImageClient = stockClient || primaryImageClient;

    return { primaryImageClient, fallbackImageClient };
}


function createVideoRenderer(config: Config, cloudinaryClient: MediaStorageClient | null): IVideoRenderer {
    const timelineRenderer = new TimelineVideoRenderer(config.timelineApiKey, config.timelineBaseUrl);
    const remoteEnabled = config.remoteRenderEnabled && config.fluxApiKey && config.remoteRenderEndpointUrl;
    const remoteRenderer = remoteEnabled
        ? new RemoteVideoRenderer(config.fluxApiKey, config.remoteRenderEndpointUrl)
        : null;

    if (config.videoRenderer === 'ffmpeg') {
        if (!cloudinaryClient) throw new Error('FFmpeg renderer requires Cloudinary configuration');
        const localRenderer = new FFmpegVideoRenderer(cloudinaryClient);

        const primaryChain = remoteRenderer
            ? new FallbackVideoRenderer(remoteRenderer, localRenderer, 'Remote FFmpeg', 'Local FFmpeg')
            : localRenderer;

        if (config.timelineApiKey) {
            console.log('🎬 Video rendering: FFmpeg-Chain (primary) → Timeline (fallback safety)');
            return new FallbackVideoRenderer(primaryChain, timelineRenderer, 'FFmpeg', 'Timeline');
        }

        console.log('🎬 Using FFmpeg Video Renderer (Local)');
        return primaryChain;
    }

    // Mode: 'shotstack'
    if (remoteRenderer) {
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
