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

    // OpenAI
    openaiApiKey: string;
    openaiModel: string;

    // Fish Audio TTS
    fishAudioApiKey: string;
    fishAudioBaseUrl: string;
    fishAudioVoiceId: string;
    fishAudioPromoVoiceId: string;

    // Telegram & Callbacks
    telegramBotToken: string;
    telegramWebhookSecret: string;
    makeWebhookUrl: string;
    callbackToken?: string;
    callbackHeader?: string;

    // LinkedIn Posting via Make.com
    linkedinWebhookUrl: string;
    linkedinWebhookApiKey: string;

    // OpenRouter (Primary Image Generation)
    openrouterApiKey: string;
    openrouterBaseUrl: string;
    openrouterModel: string;

    // Music Catalog
    musicCatalogApiKey: string;
    musicCatalogBaseUrl: string;
    internalMusicCatalogPath: string;

    // Kie.ai
    kieApiKey: string;
    kieApiBaseUrl: string;
    kieVideoBaseUrl: string;
    kieVideoModel: string;

    // Video Renderer
    videoRenderer: 'shortstack' | 'ffmpeg';

    // Shotstack
    shotstackApiKey: string;
    shotstackBaseUrl: string;

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

    // Pixabay
    pixabayApiKey: string;

    // Beam.cloud (Primary Image Generation)
    beamcloudApiKey: string;
    beamcloudEndpointUrl: string;
    beamcloudEnabled: boolean;

    // Beam.cloud (Primary Video Generation)
    beamcloudVideoEndpointUrl: string;
    beamcloudVideoEnabled: boolean;

    // Beam.cloud (FFmpeg Video Rendering)
    beamcloudRenderEndpointUrl: string;
    beamcloudRenderEnabled: boolean;

    // Personal Clone Feature Flags
    featureFlags: {
        usePersonalCloneTTS: boolean;  // Use local XTTS v2 instead of Fish Audio
        usePersonalCloneLLM: boolean;  // Use local fine-tuned LLM instead of OpenAI
        personalCloneTrainingMode: boolean; // Collect data for training
        enableUserApproval: boolean;  // Human-in-the-loop approval checkpoints
    };

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

        // OpenAI
        openaiApiKey: getEnvVar('OPENAI_API_KEY'),
        openaiModel: getEnvVar('OPENAI_MODEL', 'gpt-4.1'),

        // Fish Audio TTS
        fishAudioApiKey: getEnvVar('FISH_AUDIO_API_KEY'),
        fishAudioBaseUrl: getEnvVar('FISH_AUDIO_BASE_URL', 'https://api.fish.audio'),
        fishAudioVoiceId: getEnvVar('FISH_AUDIO_VOICE_ID'),
        fishAudioPromoVoiceId: getEnvVar('FISH_AUDIO_PROMO_VOICE_ID', '88b18e0d81474a0ca08e2ea6f9df5ff4'),

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

        // OpenRouter
        openrouterApiKey: getEnvVar('OPENROUTER_API_KEY', ''),
        openrouterBaseUrl: getEnvVar('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        openrouterModel: getEnvVar('OPENROUTER_MODEL', 'black-forest-labs/FLUX.1-schnell-Free'),

        // Kie.ai
        kieApiKey: getEnvVar('KIE_API_KEY', ''),
        kieApiBaseUrl: getEnvVar('KIE_API_BASE_URL', 'https://api.kie.ai/suno'),
        kieVideoBaseUrl: getEnvVar('KIE_API_VIDEO_BASE_URL', 'https://api.kie.ai/api/v1'),
        kieVideoModel: getEnvVar('KIE_VIDEO_MODEL', 'kling-2.6/text-to-video'),

        // Video Renderer
        videoRenderer: getEnvVar('VIDEO_RENDERER', 'shortstack') as 'shortstack' | 'ffmpeg',

        // Shotstack
        shotstackApiKey: getEnvVar('SHOTSTACK_API_KEY'),
        shotstackBaseUrl: getEnvVar('SHOTSTACK_BASE_URL', 'https://api.shotstack.io/v1'),

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

        // Pixabay
        pixabayApiKey: getEnvVar('PIXABAY_API_KEY', ''),

        // Beam.cloud (Primary Image Generation)
        beamcloudApiKey: getEnvVar('BEAMCLOUD_API_KEY', ''),
        beamcloudEndpointUrl: getEnvVar('BEAMCLOUD_ENDPOINT_URL', 'https://app.beam.cloud/endpoint/flux1-image'),
        beamcloudEnabled: getEnvVarBoolean('BEAMCLOUD_ENABLED', false),

        // Beam.cloud (Primary Video Generation)
        beamcloudVideoEndpointUrl: getEnvVar('BEAMCLOUD_VIDEO_ENDPOINT_URL', ''),
        beamcloudVideoEnabled: getEnvVarBoolean('BEAMCLOUD_VIDEO_ENABLED', false),

        // Beam.cloud (FFmpeg Video Rendering)
        beamcloudRenderEndpointUrl: getEnvVar('BEAMCLOUD_RENDER_ENDPOINT_URL', ''),
        beamcloudRenderEnabled: getEnvVarBoolean('BEAMCLOUD_RENDER_ENABLED', false),

        // Personal Clone Feature Flags (all default to false - non-breaking)
        featureFlags: {
            usePersonalCloneTTS: getEnvVarBoolean('USE_PERSONAL_CLONE_TTS', false),
            usePersonalCloneLLM: getEnvVarBoolean('USE_PERSONAL_CLONE_LLM', false),
            personalCloneTrainingMode: getEnvVarBoolean('PERSONAL_CLONE_TRAINING_MODE', false),
            enableUserApproval: getEnvVarBoolean('ENABLE_USER_APPROVAL', false), // Human-in-the-loop approval checkpoints
        },

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

    if (!config.openaiApiKey) {
        errors.push('OPENAI_API_KEY is required for transcription, LLM, images, and subtitles');
    }
    if (!config.fishAudioApiKey) {
        errors.push('FISH_AUDIO_API_KEY is required for TTS');
    }
    if (!config.fishAudioVoiceId) {
        errors.push('FISH_AUDIO_VOICE_ID is required for TTS');
    }
    if (config.videoRenderer === 'shortstack' && !config.shotstackApiKey) {
        errors.push('SHOTSTACK_API_KEY is required when videoRenderer is "shortstack"');
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
