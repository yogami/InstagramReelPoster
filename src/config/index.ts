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
    testMode: boolean; // When true, use fixtures instead of real HTTP

    // Gpt-based LLM & Services
    llmApiKey: string;
    llmModel: string;
    llmBaseUrl?: string;

    // OpenRouter (Primary LLM option)
    openRouterApiKey: string;
    openRouterBaseUrl: string;
    openRouterModel: string;

    // Voice Cloning TTS
    ttsCloningApiKey: string;
    ttsCloningBaseUrl: string;
    ttsCloningVoiceId: string;
    ttsCloningPromoVoiceId: string;

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

    // Music Catalog
    musicCatalogApiKey: string;
    musicCatalogBaseUrl: string;
    internalMusicCatalogPath: string;

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
    remoteVideoEndpointUrl: string; // Primary (Hunyuan)
    remoteMochiEndpointUrl: string; // Fallback (Mochi)
    remoteVideoEnabled: boolean;

    // Remote FFmpeg Render
    remoteRenderEndpointUrl: string;
    remoteRenderEnabled: boolean;

    // Personal Clone Feature Flags
    featureFlags: {
        usePersonalCloneTTS: boolean;  // Use local XTTS v2 instead of Fish Audio
        usePersonalCloneLLM: boolean;  // Use local fine-tuned LLM instead of Gpt
        personalCloneTrainingMode: boolean; // Collect data for training
        enableUserApproval: boolean;  // Human-in-the-loop approval checkpoints
        usePlaywrightScraper: boolean; // Toggle for enhanced scraper
        enableWebsitePromoSlice: boolean; // Independent Website Promo slice
    };

    // Guardian API (ConvoGuard compliance service)
    guardianApiUrl: string;

    // Personal Clone Configuration (only used when feature flags are enabled)
    personalClone: {
        xttsServerUrl: string;  // Local XTTS inference server URL
        localLLMUrl: string;    // Local LLM server URL (e.g., Ollama)
        trainingDataPath: string; // Path to store training data
        systemPrompt: string;   // The default personality for the Personal Twin
    };
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

        // OpenRouter (Primary LLM)
        openRouterApiKey: getEnvVar('OPENROUTER_API_KEY', ''),
        openRouterBaseUrl: getEnvVar('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        openRouterModel: getEnvVar('OPENROUTER_MODEL', 'google/gemini-2.0-flash-exp:free'),

        // Voice Cloning TTS (Fish Audio)
        ttsCloningApiKey: getEnvVar('FISH_AUDIO_API_KEY', ''),
        ttsCloningBaseUrl: getEnvVar('FISH_AUDIO_BASE_URL', 'https://api.fish.audio'),
        ttsCloningVoiceId: getEnvVar('FISH_AUDIO_VOICE_ID', ''),
        ttsCloningPromoVoiceId: getEnvVar('FISH_AUDIO_PROMO_VOICE_ID', '88b18e0d81474a0ca08e2ea6f9df5ff4'),

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

        // Personal Clone Feature Flags (all default to false - non-breaking)
        featureFlags: {
            usePersonalCloneTTS: getEnvVarBoolean('USE_PERSONAL_CLONE_TTS', false),
            usePersonalCloneLLM: getEnvVarBoolean('USE_PERSONAL_CLONE_LLM', false),
            personalCloneTrainingMode: getEnvVarBoolean('PERSONAL_CLONE_TRAINING_MODE', false),
            enableUserApproval: getEnvVarBoolean('ENABLE_USER_APPROVAL', false), // Human-in-the-loop approval checkpoints
            usePlaywrightScraper: getEnvVarBoolean('USE_PLAYWRIGHT_SCRAPER', false), // Toggle for enhanced scraper
            enableWebsitePromoSlice: getEnvVarBoolean('ENABLE_WEBSITE_PROMO_SLICE', false), // Independent slice
        },

        // Guardian API (ConvoGuard compliance service)
        guardianApiUrl: getEnvVar('GUARDIAN_API_URL', 'http://localhost:3001'),

        // Personal Clone Configuration
        personalClone: {
            xttsServerUrl: getEnvVar('XTTS_SERVER_URL', 'http://localhost:8020'),
            localLLMUrl: getEnvVar('LOCAL_LLM_URL', 'http://localhost:11434'),
            trainingDataPath: getEnvVar('PERSONAL_CLONE_DATA_PATH', './data/personal_clone'),
            systemPrompt: getEnvVar('PERSONAL_CLONE_SYSTEM_PROMPT', 'You are a helpful and intelligent personal AI twin. Write in a natural, conversational tone that reflects the user\'s perspective.'),
        },
    };
}

/**
 * Validates that required API keys are present for the desired features.
 */
export function validateConfig(config: Config): string[] {
    const errors: string[] = [];

    if (!config.llmApiKey) {
        errors.push('OPENAI_API_KEY (llmApiKey) is required for transcription, LLM, images, and subtitles');
    }
    if (!config.ttsCloningApiKey) {
        errors.push('FISH_AUDIO_API_KEY (ttsCloningApiKey) is required for TTS');
    }
    if (!config.ttsCloningVoiceId) {
        errors.push('FISH_AUDIO_VOICE_ID (ttsCloningVoiceId) is required for TTS');
    }
    if (config.videoRenderer === 'shotstack' && !config.timelineApiKey) {
        errors.push('SHOTSTACK_API_KEY (timelineApiKey) is required when videoRenderer is "shotstack"');
    }

    if (config.videoRenderer === 'ffmpeg') {
        if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
            errors.push('Cloudinary credentials are required when videoRenderer is "ffmpeg"');
        }
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
