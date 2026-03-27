import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Application configuration loaded from environment variables.
 */
export interface Config {
    // Server
    port: number;
    environment: string;
    testMode: boolean;

    // LLM (Gpt)
    llmApiKey: string;
    llmModel: string;
    llmBaseUrl?: string;
    googleAiApiKey: string;

    // OpenRouter (Primary LLM option)
    openRouterApiKey: string;
    openRouterBaseUrl: string;
    openRouterModel: string;

    // Voice Cloning TTS
    ttsCloningApiKey: string;
    ttsCloningBaseUrl: string;
    ttsCloningVoiceId: string;
    ttsCloningPromoVoiceId: string;
    scenarioMaleVoiceId: string;
    scenarioFemaleVoiceId: string;

    // Music Catalog
    musicCatalogApiKey: string;
    musicCatalogBaseUrl: string;
    internalMusicCatalogPath: string;

    // Telegram & Callbacks
    telegramBotToken: string;
    telegramWebhookSecret: string;
    makeWebhookUrl: string;
    callbackToken?: string;
    callbackHeader?: string;

    // LinkedIn Posting via Make.com
    linkedinWebhookUrl: string;
    linkedinWebhookApiKey: string;

    // Remote Multi-Model (Images)
    multiModelImageApiKey: string;
    multiModelImageBaseUrl: string;
    multiModelImageModel: string;

    // Multi-Model (Video/Music)
    multiModelApiKey: string;
    multiModelMusicBaseUrl: string;
    multiModelVideoBaseUrl: string;
    multiModelVideoModel: string;

    // Video Renderer
    videoRenderer: 'shotstack' | 'ffmpeg';

    // Timeline Rendering
    timelineApiKey: string;
    timelineBaseUrl: string;

    // Cloudinary (file storage)
    cloudinaryCloudName: string;
    cloudinaryApiKey: string;
    cloudinaryApiSecret: string;

    // Redis
    redisUrl?: string;

    // Reel constraints
    minReelSeconds: number;
    maxReelSeconds: number;
    speakingRateWps: number;

    // Stock Assets
    stockApiKey: string;

    // Remote Flux (Images)
    fluxApiKey: string;
    fluxEndpointUrl: string;
    fluxEnabled: boolean;

    // Remote Video (Mochi/Hunyuan)
    remoteVideoEndpointUrl: string;
    remoteMochiEndpointUrl: string;
    remoteVideoEnabled: boolean;

    // Remote FFmpeg Render
    remoteRenderEndpointUrl: string;
    remoteRenderEnabled: boolean;

    // Remote Avatar (SadTalker)
    sadTalkerEndpointUrl: string;

    // Hedra Lip-Sync
    hedraApiKey: string;
    hedraBaseUrl: string;
    useLipSync: boolean;
    lipSyncTestDuration: number; // seconds — use 3-5s for free tier testing, 0 = full length

    // Replicate
    replicateApiToken: string;

    // Personal Clone Feature Flags
    featureFlags: {
        usePersonalCloneTTS: boolean;
        usePersonalCloneLLM: boolean;
        personalCloneTrainingMode: boolean;
        enableUserApproval: boolean;
        usePlaywrightScraper: boolean;
        enableWebsitePromoSlice: boolean;
        enableProductDemoSlice: boolean;
    };

    // Product Demo Configuration
    productDemo: {
        voiceSpeedMultiplier: number;
        commentaryLengthPercent: number;
    };

    // Guardian API
    guardianApiUrl: string;
    guardianApiKey: string;

    // DeepL API
    deeplApiKey: string;

    // HeyGen API
    heygenApiKey: string;
    heygenVoiceId: string;
    avatarImeldaCasual: string;
    avatarImeldaSuit: string;

    // Localized Voice IDs
    voiceFriendlyId?: string;
    voiceEnergeticId?: string;
    voiceAuthoritativeId?: string;
    voiceExpressiveId?: string;
    voiceSophisticatedId?: string;
    voiceGermanId?: string;
    voiceFrenchId?: string;
    voiceSpanishId?: string;
    voiceJapaneseId?: string;

    // Personal Clone Configuration
    personalClone: {
        xttsServerUrl: string;
        localLLMUrl: string;
        trainingDataPath: string;
        systemPrompt: string;
    };

    // Agent Cloud Hub
    cloudHubUrl: string;

    // GitHub
    githubToken?: string;

    // Channel Identity (Viral Factory)
    reelChannel: string;
}

function getEnvVar(key: string, defaultValue?: string): string {
    let value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Missing required environment variable: ${key} `);
    }

    // Proactive cleanup: trim whitespace and remove wrapping quotes
    value = value.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
    }

    return value;
}

function getEnvVarNumber(key: string, defaultValue?: number): number {
    const value = getEnvVar(key, defaultValue?.toString());
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
        throw new Error(`Environment variable ${key} must be a number, got: ${value} `);
    }
    return parsed;
}

function getEnvVarBoolean(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Missing required environment variable: ${key} `);
    }
    return value.toLowerCase() === 'true';
}

/**
 * Loads and validates configuration from environment variables.
 */
export function loadConfig(): Config {
    return {
        // Server
        port: getEnvVarNumber('PORT', 3000),
        environment: getEnvVar('NODE_ENV', 'development'),
        testMode: getEnvVarBoolean('TEST_MODE', false),

        // LLM (Gpt)
        llmApiKey: getEnvVar('OPENAI_API_KEY', ''),
        llmModel: getEnvVar('OPENAI_MODEL', 'gpt-4o'),
        llmBaseUrl: getEnvVar('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
        googleAiApiKey: getEnvVar('GOOGLE_AI_API_KEY', ''),

        // OpenRouter (Primary LLM)
        openRouterApiKey: getEnvVar('OPENROUTER_API_KEY', ''),
        openRouterBaseUrl: getEnvVar('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        openRouterModel: getEnvVar('OPENROUTER_MODEL', 'google/gemini-2.0-flash-exp:free'),

        // Voice Cloning TTS (Fish Audio)
        ttsCloningApiKey: getEnvVar('FISH_AUDIO_API_KEY', ''),
        ttsCloningBaseUrl: getEnvVar('FISH_AUDIO_BASE_URL', 'https://api.fish.audio'),
        ttsCloningVoiceId: getEnvVar('FISH_AUDIO_VOICE_ID', ''),
        ttsCloningPromoVoiceId: getEnvVar('FISH_AUDIO_PROMO_VOICE_ID', '88b18e0d81474a0ca08e2ea6f9df5ff4'),
        // Scenario dialogue voices (male/female)
        scenarioMaleVoiceId: getEnvVar('FISH_AUDIO_SCENARIO_MALE_VOICE_ID', ''),
        scenarioFemaleVoiceId: getEnvVar('FISH_AUDIO_SCENARIO_FEMALE_VOICE_ID', ''),

        // Music Catalog
        musicCatalogApiKey: getEnvVar('MUSIC_CATALOG_API_KEY', ''),
        musicCatalogBaseUrl: getEnvVar('MUSIC_CATALOG_BASE_URL', ''),
        internalMusicCatalogPath: getEnvVar('INTERNAL_MUSIC_CATALOG_PATH', './assets/music_catalog.json'),

        // Telegram & Callbacks
        telegramBotToken: getEnvVar('TELEGRAM_BOT_TOKEN', ''),
        telegramWebhookSecret: getEnvVar('TELEGRAM_WEBHOOK_SECRET', ''),
        makeWebhookUrl: getEnvVar('MAKE_WEBHOOK_URL', ''),
        callbackToken: process.env.CALLBACK_TOKEN ? getEnvVar('CALLBACK_TOKEN') : undefined,
        callbackHeader: process.env.CALLBACK_HEADER ? getEnvVar('CALLBACK_HEADER') : 'Authorization',

        // LinkedIn Posting via Make.com
        linkedinWebhookUrl: getEnvVar('LINKEDIN_WEBHOOK_URL', ''),
        linkedinWebhookApiKey: getEnvVar('LINKEDIN_WEBHOOK_API_KEY', ''),

        // Multi-Model (OpenRouter Image)
        multiModelImageApiKey: getEnvVar('OPENROUTER_API_KEY', ''),
        multiModelImageBaseUrl: getEnvVar('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        multiModelImageModel: getEnvVar('OPENROUTER_MODEL', 'black-forest-labs/FLUX.1-schnell-Free'),

        // Multi-Model (Aggregator Video/Music)
        multiModelApiKey: getEnvVar('KIE_API_KEY', ''),
        multiModelMusicBaseUrl: getEnvVar('KIE_API_BASE_URL', 'https://api.kie.ai/suno'),
        multiModelVideoBaseUrl: getEnvVar('KIE_API_VIDEO_BASE_URL', 'https://api.kie.ai/api/v1'),
        multiModelVideoModel: getEnvVar('KIE_VIDEO_MODEL', 'kling-2.6/text-to-video'),

        // Video Renderer Select
        // Video Renderer Select
        videoRenderer: getEnvVar('VIDEO_RENDERER', 'shotstack') as 'shotstack' | 'ffmpeg',

        // Timeline (Shotstack)
        timelineApiKey: getEnvVar('SHOTSTACK_API_KEY', ''),
        timelineBaseUrl: getEnvVar('SHOTSTACK_BASE_URL', 'https://api.shotstack.io/v1'),

        // Cloudinary
        cloudinaryCloudName: getEnvVar('CLOUDINARY_CLOUD_NAME', ''),
        cloudinaryApiKey: getEnvVar('CLOUDINARY_API_KEY', ''),
        cloudinaryApiSecret: getEnvVar('CLOUDINARY_API_SECRET', ''),

        // Redis
        redisUrl: process.env.REDIS_URL,

        // Reel constraints
        minReelSeconds: getEnvVarNumber('MIN_REEL_SECONDS', 10),
        maxReelSeconds: getEnvVarNumber('MAX_REEL_SECONDS', 90),
        speakingRateWps: getEnvVarNumber('SPEAKING_RATE_WPS', 2.3),

        // Stock (Pixabay)
        stockApiKey: getEnvVar('PIXABAY_API_KEY', ''),

        // Remote Flux (Beam.cloud)
        fluxApiKey: getEnvVar('BEAMCLOUD_API_KEY', ''),
        fluxEndpointUrl: getEnvVar('BEAMCLOUD_ENDPOINT_URL', 'https://app.beam.cloud/endpoint/flux1-image'),
        fluxEnabled: getEnvVarBoolean('BEAMCLOUD_ENABLED', false),

        // Remote Video (Mochi/Hunyuan)
        remoteVideoEndpointUrl: getEnvVar('BEAMCLOUD_HUNYUAN_ENDPOINT_URL', '') || getEnvVar('BEAMCLOUD_VIDEO_ENDPOINT_URL', ''),
        remoteMochiEndpointUrl: getEnvVar('BEAMCLOUD_MOCHI_ENDPOINT_URL', ''),
        remoteVideoEnabled: getEnvVarBoolean('BEAMCLOUD_VIDEO_ENABLED', true) || getEnvVarBoolean('BEAMCLOUD_HUNYUAN_ENABLED', false),

        // Remote Render (FFmpeg)
        remoteRenderEndpointUrl: getEnvVar('BEAMCLOUD_RENDER_ENDPOINT_URL', ''),
        remoteRenderEnabled: getEnvVarBoolean('BEAMCLOUD_RENDER_ENABLED', false),

        // Remote Avatar (SadTalker)
        sadTalkerEndpointUrl: getEnvVar('BEAMCLOUD_SADTALKER_ENDPOINT_URL', ''),

        // Hedra Lip-Sync
        hedraApiKey: getEnvVar('HEDRA_API_KEY', ''),
        hedraBaseUrl: getEnvVar('HEDRA_BASE_URL', 'https://api.hedra.com/web-app/public'),
        useLipSync: getEnvVarBoolean('USE_LIP_SYNC', false),
        lipSyncTestDuration: getEnvVarNumber('LIP_SYNC_TEST_DURATION', 0),

        // Replicate (Promo Engine)
        replicateApiToken: getEnvVar('REPLICATE_API_TOKEN', ''),

        // Personal Clone Feature Flags (all default to false - non-breaking)
        featureFlags: {
            usePersonalCloneTTS: getEnvVarBoolean('USE_PERSONAL_CLONE_TTS', false),
            usePersonalCloneLLM: getEnvVarBoolean('USE_PERSONAL_CLONE_LLM', false),
            personalCloneTrainingMode: getEnvVarBoolean('PERSONAL_CLONE_TRAINING_MODE', false),
            enableUserApproval: getEnvVarBoolean('ENABLE_USER_APPROVAL', false), // Human-in-the-loop approval checkpoints
            usePlaywrightScraper: getEnvVarBoolean('USE_PLAYWRIGHT_SCRAPER', false), // Toggle for enhanced scraper
            enableWebsitePromoSlice: getEnvVarBoolean('ENABLE_WEBSITE_PROMO_SLICE', false), // Independent slice
            enableProductDemoSlice: getEnvVarBoolean('ENABLE_PRODUCT_DEMO_SLICE', false), // Product Demo slice
        },

        // Product Demo Configuration
        productDemo: {
            voiceSpeedMultiplier: getEnvVarNumber('PRODUCT_DEMO_VOICE_SPEED', 1.25),
            commentaryLengthPercent: getEnvVarNumber('PRODUCT_DEMO_COMMENTARY_PERCENT', 0.92)
        },

        // Guardian API (ConvoGuard compliance service)
        guardianApiUrl: getEnvVar('GUARDIAN_API_URL', 'http://localhost:3001'),
        guardianApiKey: getEnvVar('GUARDIAN_API_KEY', ''),

        // DeepL API
        deeplApiKey: getEnvVar('DEEPL_API_KEY', ''),

        // HeyGen API
        heygenApiKey: getEnvVar('HEYGEN_API_KEY', ''),
        heygenVoiceId: getEnvVar('HEYGEN_VOICE_ID', '88f5e1546a4245cca66c332671eb6d78'),
        avatarImeldaCasual: getEnvVar('AVATAR_IMELDA_CASUAL', 'Imelda_Casual_Front_public'),
        avatarImeldaSuit: getEnvVar('AVATAR_IMELDA_SUIT', 'Imelda_Suit_Front_public'),

        // Localized Voice IDs
        voiceFriendlyId: process.env.VOICE_FRIENDLY_ID,
        voiceEnergeticId: process.env.VOICE_ENERGETIC_ID,
        voiceAuthoritativeId: process.env.VOICE_AUTHORITATIVE_ID,
        voiceExpressiveId: process.env.VOICE_EXPRESSIVE_ID,
        voiceSophisticatedId: process.env.VOICE_SOPHISTICATED_ID,
        voiceGermanId: process.env.VOICE_GERMAN_ID,
        voiceFrenchId: process.env.VOICE_FRENCH_ID,
        voiceSpanishId: process.env.VOICE_SPANISH_ID,
        voiceJapaneseId: process.env.VOICE_JAPANESE_ID,

        // Personal Clone Configuration
        personalClone: {
            xttsServerUrl: getEnvVar('XTTS_SERVER_URL', 'http://localhost:8020'),
            localLLMUrl: getEnvVar('LOCAL_LLM_URL', 'http://localhost:11434'),
            trainingDataPath: getEnvVar('PERSONAL_CLONE_DATA_PATH', './data/personal_clone'),
            systemPrompt: getEnvVar('PERSONAL_CLONE_SYSTEM_PROMPT', 'You are a helpful and intelligent personal AI twin. Write in a natural, conversational tone that reflects the user\'s perspective.'),
        },

        // Agent Cloud Hub
        cloudHubUrl: getEnvVar('CLOUD_HUB_URL', 'http://localhost:4000'),

        // GitHub
        githubToken: process.env.GITHUB_TOKEN,

        // Multi-Channel Strategy
        reelChannel: getEnvVar('REEL_CHANNEL', 'challenging_view'),
    };
}

/**
 * Validates that required API keys are present for the desired features.
 */
export function validateConfig(config: Config): string[] {
    const errors: string[] = [];

    const hasGoogle = !!config.googleAiApiKey;

    if (!config.llmApiKey && !hasGoogle) {
        errors.push('Either OPENAI_API_KEY or GOOGLE_AI_API_KEY is required for the project');
    }

    if (!hasGoogle) {
        if (!config.ttsCloningApiKey) {
            errors.push('FISH_AUDIO_API_KEY is required if GOOGLE_AI_API_KEY is not provided');
        }
    }

    if (config.videoRenderer === 'ffmpeg') {
        // Cloudinary is no longer strictly required if we save locally
    }



    return errors;
}

// Singleton config instance (lazy loaded)
let cachedConfig: Config | null = null;

export function getConfig(): Config {
    if (!cachedConfig) {
        cachedConfig = loadConfig();
    }
    return cachedConfig;
}

export function resetConfig(): void {
    cachedConfig = null;
}
