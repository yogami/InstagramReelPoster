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

    // Telegram & Callbacks
    telegramBotToken: string;
    telegramWebhookSecret: string;
    makeWebhookUrl: string;

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
}

function getEnvVar(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

function getEnvVarNumber(key: string, defaultValue?: number): number {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Missing required environment variable: ${key}`);
    }
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
        throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
    }
    return parsed;
}

function getEnvVarBoolean(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Missing required environment variable: ${key}`);
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

        // Music Catalog
        musicCatalogApiKey: getEnvVar('MUSIC_CATALOG_API_KEY', ''),
        musicCatalogBaseUrl: getEnvVar('MUSIC_CATALOG_BASE_URL', ''),
        internalMusicCatalogPath: getEnvVar('INTERNAL_MUSIC_CATALOG_PATH', './data/internal_music_catalog.json'),

        // Telegram & Callbacks
        telegramBotToken: getEnvVar('TELEGRAM_BOT_TOKEN', ''),
        telegramWebhookSecret: getEnvVar('TELEGRAM_WEBHOOK_SECRET', ''),
        makeWebhookUrl: getEnvVar('MAKE_WEBHOOK_URL', ''),

        // OpenRouter
        openrouterApiKey: getEnvVar('OPENROUTER_API_KEY', ''),
        openrouterBaseUrl: getEnvVar('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        openrouterModel: getEnvVar('OPENROUTER_MODEL', 'google/gemini-flash-1.5'),

        // Kie.ai
        kieApiKey: getEnvVar('KIE_API_KEY', ''),
        kieApiBaseUrl: getEnvVar('KIE_API_BASE_URL', 'https://api.kie.ai/suno'),

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
