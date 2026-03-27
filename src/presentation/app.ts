import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Config } from '../config';
import { JobManager } from '../application/JobManager';
import { ReelOrchestrator, OrchestratorDependencies } from '../application/ReelOrchestrator';
import { MusicSelector } from '../application/MusicSelector';

// Infrastructure imports (Google-Free — all LLM via OpenRouter, TTS via Fish Audio)
import { RemoteTranscriptionClient } from '../infrastructure/transcription/RemoteTranscriptionClient';
import { GptLlmClient } from '../infrastructure/llm/GptLlmClient';
import { GeminiLlmClient } from '../infrastructure/llm/GeminiLlmClient';
import { CloningTtsClient } from '../infrastructure/tts/CloningTtsClient';
import { InMemoryMusicCatalogClient } from '../infrastructure/music/InMemoryMusicCatalogClient';
import { SegmentMusicClient } from '../infrastructure/music/SegmentMusicClient';
import { StubImageClient } from '../infrastructure/images/StubImageClient';

import { WhisperSubtitlesClient } from '../infrastructure/subtitles/WhisperSubtitlesClient';

import { RemotionVideoRenderer } from '../infrastructure/video/RemotionVideoRenderer';
import { LocalStorageClient } from '../infrastructure/storage/LocalStorageClient';
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
import { ILipSyncClient } from '../domain/ports/ILipSyncClient';
import { HedraLipSyncClient } from '../infrastructure/lipsync/HedraLipSyncClient';
import { KieLipSyncClient } from '../infrastructure/lipsync/KieLipSyncClient';
import { KieVideoClient } from '../infrastructure/video/KieVideoClient';
import { MockLipSyncClient } from '../infrastructure/lipsync/MockLipSyncClient';


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

import { createProductDemoSlice } from '../lib/product-demo';
import axios from 'axios';
import { SaaSEligibilityAdapter } from '../lib/product-demo/adapters/SaaSEligibilityAdapter';
import { PlaywrightProductScraperAdapter } from '../lib/product-demo/adapters/PlaywrightProductScraperAdapter';
import { GitHubScraperAdapter } from '../lib/product-demo/adapters/GitHubScraperAdapter';
import { PlaywrightDemoRecorderAdapter } from '../lib/product-demo/adapters/PlaywrightDemoRecorderAdapter';
import { LLMDemoScriptAdapter } from '../lib/product-demo/adapters/LLMDemoScriptAdapter';

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

    // Serve static renders locally
    const rendersDir = path.join(process.cwd(), 'public', 'renders');
    if (!fs.existsSync(rendersDir)) {
        fs.mkdirSync(rendersDir, { recursive: true });
    }
    app.use('/renders', express.static(rendersDir));

    // Health check
    app.get('/health', (req: Request, res: Response) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        });
    });

    // Create dependencies
    const { jobManager, orchestrator, growthInsightsService, metricsPort, productDemoSlice } = createDependencies(config);

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

    // Product Demo Routes (if enabled)
    if (productDemoSlice) {
        import('./routes/productDemoRoutes').then(({ createProductDemoRoutes }) => {
            app.use('/api/product-demo', createProductDemoRoutes(productDemoSlice.orchestrator));
        });
    }

    app.use(createJobRoutes(jobManager));
    app.use(createTelegramWebhookRoutes(jobManager, orchestrator));

    // Error handler (must be last)
    app.use(errorHandler);

    return app;
}

/**
 * Creates all dependencies — fully Google-free.
 * LLM via OpenRouter, TTS via Fish Audio, Images via FFmpeg, Subtitles via Whisper/OpenRouter.
 */
export function createDependencies(config: Config): {
    jobManager: JobManager;
    orchestrator: ReelOrchestrator;
    growthInsightsService: GrowthInsightsService;
    cloudinaryClient: MediaStorageClient | null;
    metricsPort: IMetricsPort;
    productDemoSlice?: ReturnType<typeof createProductDemoSlice>;
} {
    console.log('🏗️  Creating dependency graph (Google-Free, OpenRouter + Fish Audio)...');

    const openRouterKey = config.openRouterApiKey || config.llmApiKey;

    // 1. Storage: Local-First (Zero Cost)
    const localStorageClient = new LocalStorageClient(`http://localhost:${config.port}`);
    const cloudinaryClient = createCloudinaryClient(config);

    // 2. LLM: OpenRouter (free Gemini model via OpenRouter proxy)
    const llmClient = createLlmClient(config);

    // 3. TTS: Fish Audio (Primary — no Google TTS fallback)
    const ttsClient = new CloningTtsClient(
        config.ttsCloningApiKey,
        config.ttsCloningVoiceId,
        config.ttsCloningBaseUrl
    );
    const fallbackTtsClient = ttsClient; // Fish Audio is both primary and fallback

    // 4. Images: FFmpeg gradient backgrounds (zero cost, no Google Imagen)
    const { primaryImageClient, fallbackImageClient } = createImageClients(config);

    // 5. Transcription: OpenRouter (Gemini Flash via OpenRouter — free)
    const transcriptionClient = new RemoteTranscriptionClient(
        openRouterKey,
        config.openRouterModel || 'google/gemini-2.0-flash-001',
        'https://openrouter.ai/api/v1'
    );

    // 6. Subtitles: Whisper via OpenAI (Direct)
    const subtitlesClient = new WhisperSubtitlesClient(config.llmApiKey, cloudinaryClient!);

    // 7. Rendering: Local Remotion (Replaces FFmpeg, Zero Cost)
    const videoRenderer = new RemotionVideoRenderer();

    // 8. Music: Local Catalog
    const musicSelector = createMusicSelector(config);

    // 9. Lip-Sync: Aggregator Strategy (KIE.ai preferred, Hedra secondary, Mock fallback)
    const lipSyncClient = createLipSyncClient(config, cloudinaryClient!);

    // 10. Animated Video: Aggregator Strategy (KIE.ai Kling)
    const animatedVideoClient = createAnimatedVideoClient(config);

    console.log('📦 Initializing JobManager (Local Persistence)...');
    const jobManager = new JobManager(config.minReelSeconds, config.maxReelSeconds, config.redisUrl);

    const notificationClient = createNotificationClient(config);
    const websiteScraperClient = config.featureFlags.usePlaywrightScraper
        ? new EnhancedWebsiteScraper()
        : new WebsiteScraperClient();

    // Growth Layer Services
    const hookAndStructureService = new HookAndStructureService(llmClient);
    const captionService = new CaptionService(llmClient);
    const growthInsightsService = new GrowthInsightsService();

    // Create Website Promo Slice (OpenRouter + Fish Audio)
    const websitePromoSlice = createWebsitePromoSliceIfEnabled(
        config, websiteScraperClient, llmClient, ttsClient,
        primaryImageClient, musicSelector, subtitlesClient,
        cloudinaryClient!, videoRenderer
    );

    // Create Product Demo Slice (OpenRouter + Fish Audio)
    const productDemoSlice = createProductDemoSliceIfEnabled(
        config, llmClient, ttsClient, primaryImageClient,
        musicSelector, subtitlesClient, cloudinaryClient!, videoRenderer
    );

    const deps: OrchestratorDependencies = {
        transcriptionClient,
        llmClient,
        ttsClient,
        primaryImageClient,
        fallbackImageClient,
        subtitlesClient,
        videoRenderer,
        musicSelector,
        jobManager,
        hookAndStructureService,
        captionService,
        growthInsightsService,
        notificationClient,
        fallbackTtsClient,
        storageClient: (cloudinaryClient as any) || undefined,
        callbackToken: config.callbackToken,
        callbackHeader: config.callbackHeader,
        websiteScraperClient,
        websitePromoSlice,
        lipSyncClient,
        animatedVideoClient,
    };

    console.log('⚙️  Wiring up ReelOrchestrator...');
    const orchestrator = new ReelOrchestrator(deps);
    console.log('✅ Dependency graph complete');

    return {
        jobManager,
        orchestrator,
        growthInsightsService,
        cloudinaryClient,
        metricsPort: (websitePromoSlice as any)?.orchestrator?.deps?.metricsPort || new ConsoleMetricsAdapter(),
        productDemoSlice
    };
}

/** Creates WebsitePromoSlice with all adapters if feature flag is enabled. */
function createWebsitePromoSliceIfEnabled(
    config: Config,
    websiteScraperClient: any,
    llmClient: any,
    ttsClient: any,
    primaryImageClient: any,
    musicSelector: any,
    subtitlesClient: any,
    cloudinaryClient: MediaStorageClient,
    videoRenderer: IVideoRenderer
): ReturnType<typeof createWebsitePromoSlice> | undefined {
    if (!config.featureFlags.enableWebsitePromoSlice) {
        return undefined;
    }

    console.log('🚀 Initializing independent WebsitePromoSlice with Enterprise Hardening...');

    const translationPort = createTranslationAdapter(config);
    const avatarPort = createAvatarAdapter(config);
    const cachePort = config.redisUrl
        ? new RedisCacheAdapter(config.redisUrl)
        : new InMemoryCacheAdapter();
    const metricsPort = new PrometheusMetricsAdapter();
    const compliancePort = createComplianceAdapter(config);
    const jobQueuePort = config.redisUrl
        ? new BullMqJobQueueAdapter(config.redisUrl)
        : undefined;

    const websitePromoSlice = createWebsitePromoSlice({
        scrapingPort: new WebsiteScraperAdapter(websiteScraperClient),
        scriptPort: new ScriptGenerationAdapter(llmClient),
        assetPort: new AssetGenerationAdapter(
            ttsClient,
            primaryImageClient,
            musicSelector,
            subtitlesClient,
            cloudinaryClient
        ),
        renderingPort: new RenderingAdapter(videoRenderer),
        translationPort,
        templateRepository: new InMemoryTemplateRepository(),
        cachePort,
        metricsPort,
        compliancePort,
        avatarPort,
        jobQueuePort
    });

    // Initialize background worker if Redis is available
    if (config.redisUrl) {
        console.log('👷 Initializing WebsitePromoWorker (Concurrency: 2)...');
        new WebsitePromoWorker(websitePromoSlice.orchestrator, config.redisUrl);
    }

    return websitePromoSlice;
}

/** Creates ProductDemoSlice with all adapters if feature flag is enabled. */
function createProductDemoSliceIfEnabled(
    config: Config,
    llmClient: any,
    ttsClient: any,
    primaryImageClient: any,
    musicSelector: any,
    subtitlesClient: any,
    cloudinaryClient: MediaStorageClient,
    videoRenderer: IVideoRenderer
): ReturnType<typeof createProductDemoSlice> | undefined {
    if (!config.featureFlags.enableProductDemoSlice) {
        return undefined;
    }

    console.log('🚀 Initializing ProductDemoSlice (Autonomous Microservice)...');

    const cachePort = config.redisUrl
        ? new RedisCacheAdapter(config.redisUrl)
        : new InMemoryCacheAdapter();
    const metricsPort = new PrometheusMetricsAdapter();

    const productScrapingPort = new PlaywrightProductScraperAdapter({
        createPage: async () => {
            const { EnhancedWebsiteScraper } = await import('../infrastructure/scraper/EnhancedWebsiteScraper');
            const scraper = new EnhancedWebsiteScraper();
            return (scraper as any).createPage();
        },
        uploadImage: async (buffer, filename) => {
            const result = await cloudinaryClient.uploadBuffer(buffer, { folder: 'product-demo/screenshots', publicId: filename });
            return result.url;
        }
    });

    return createProductDemoSlice({
        eligibilityPort: new SaaSEligibilityAdapter({
            llmClient,
            productScrapingPort
        }),
        productScrapingPort,
        githubScrapingPort: new GitHubScraperAdapter({
            httpClient: axios,
            githubToken: config.githubToken
        }),
        demoRecordingPort: new PlaywrightDemoRecorderAdapter({
            tempDir: './tmp/recordings',
            createRecordingContext: async (outputPath, viewport) => {
                const { chromium } = await import('playwright');
                const browser = await chromium.launch({ headless: true });
                const context = await browser.newContext({
                    viewport,
                    recordVideo: {
                        dir: outputPath,
                        size: viewport
                    }
                });
                return {
                    newPage: async () => {
                        const page = await context.newPage();
                        return page as any;
                    },
                    close: async () => {
                        await context.close();
                        await browser.close();
                    }
                };
            },
            uploadVideo: async (path) => {
                const result = await cloudinaryClient.uploadVideo(path, { folder: 'product-demo/recordings' });
                return result.url;
            }
        }),
        scriptGenerationPort: new LLMDemoScriptAdapter({ llmClient }),
        assetPort: new AssetGenerationAdapter(
            ttsClient,
            primaryImageClient,
            musicSelector,
            subtitlesClient,
            cloudinaryClient
        ),
        renderingPort: new RenderingAdapter(videoRenderer),
        cachePort,
        metricsPort,
        voiceSpeedMultiplier: config.productDemo.voiceSpeedMultiplier,
        commentaryLengthPercent: config.productDemo.commentaryLengthPercent,
        voiceId: config.ttsCloningPromoVoiceId || config.ttsCloningVoiceId
    });
}

/** Creates translation adapter with DeepL primary and NoOp fallback. */
function createTranslationAdapter(config: Config) {
    const primaryTranslation = new DeepLTranslationAdapter(config.deeplApiKey);
    const secondaryTranslation = new NoOpTranslationAdapter();
    return new FallbackTranslationAdapter(
        primaryTranslation,
        secondaryTranslation,
        'DeepL',
        'English-Fallback'
    );
}

/** Creates avatar adapter based on available configuration. */
function createAvatarAdapter(config: Config) {
    // Zero-cost: Default to Mock if no managed service is configured
    if (config.heygenApiKey) {
        console.log('🤖 Avatar Strategy: Managed Service (HeyGen V2)');
        return new HeyGenAvatarAdapter(config.heygenApiKey);
    }
    console.log('🤖 Avatar Strategy: Mock (Zero Cost Mode)');
    return new MockAvatarAdapter();
}

/** Creates Guardian compliance adapter. */
function createComplianceAdapter(config: Config) {
    const guardianClient = new GuardianClient({
        baseUrl: config.guardianApiUrl
    });
    const zeroRetentionService = new ZeroRetentionService();
    return new GuardianComplianceAdapter(guardianClient, zeroRetentionService);
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
    // 1. OpenRouter (user has credits — llama-3.3-70b-instruct confirmed working)
    const openRouterKey = config.openRouterApiKey;
    if (openRouterKey && config.openRouterBaseUrl) {
        const model = config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct';
        console.log(`✅ LLM: OpenRouter (${model})`);
        const { OpenRouterTextClient } = require('../infrastructure/llm/OpenRouterTextClient');
        return new OpenRouterTextClient(openRouterKey, model);
    }

    // 2. OpenAI (may not have billing)
    if (config.llmApiKey) {
        const model = config.llmModel || 'gpt-4o-mini';
        console.log(`✅ LLM: OpenAI (${model})`);
        return new GptLlmClient(config.llmApiKey, model, config.llmBaseUrl);
    }

    // 3. Gemini (daily quota may be exhausted)
    if (config.googleAiApiKey) {
        const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';
        console.log(`✅ LLM: Google Gemini (${geminiModel})`);
        return new GeminiLlmClient(config.googleAiApiKey, geminiModel);
    }

    throw new Error("Missing LLM API Key — set OPENROUTER_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY");
}

function createImageClients(config: Config): { primaryImageClient: IImageClient; fallbackImageClient: IImageClient } {
    const stubClient = new StubImageClient();
    console.log('✅ Image generation: FFmpeg Gradients (Zero Cost)');
    return {
        primaryImageClient: stubClient,
        fallbackImageClient: stubClient
    };
}

function createMusicSelector(config: Config) {
    const internalMusicCatalog = new InMemoryMusicCatalogClient(config.internalMusicCatalogPath);
    return new MusicSelector(internalMusicCatalog, null, null);
}

function createNotificationClient(config: Config) {
    const telegramService = config.telegramBotToken ? new ChatService(config.telegramBotToken) : null;
    return telegramService ? new ChatNotificationClient(telegramService) : undefined;
}

function createLipSyncClient(config: Config, storageClient: MediaStorageClient): ILipSyncClient {
    if (config.multiModelApiKey) {
        console.log('✅ Lip-Sync: Kie.ai (Aggregator)');
        return new KieLipSyncClient(
            config.multiModelApiKey,
            config.multiModelVideoBaseUrl,
            storageClient
        );
    }

    if (config.hedraApiKey) {
        console.log('✅ Lip-Sync: Hedra Character-3');
        return new HedraLipSyncClient(config.hedraApiKey, config.hedraBaseUrl);
    }

    console.log('⚠️  Lip-Sync: Mock (Zero Cost Mode)');
    return new MockLipSyncClient();
}

function createAnimatedVideoClient(config: Config): IAnimatedVideoClient | undefined {
    if (config.multiModelApiKey) {
        console.log('✅ Animated Video: Kie.ai (Kling)');
        return new KieVideoClient(
            config.multiModelApiKey,
            config.multiModelVideoBaseUrl,
            config.multiModelVideoModel
        );
    }
    return undefined;
}
