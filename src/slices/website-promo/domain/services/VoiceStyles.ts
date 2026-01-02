/**
 * VoiceStyles Service
 * 
 * Maps high-level voice style names to Fish Audio voice IDs.
 * Provides a user-friendly abstraction for voice selection.
 */

export type VoiceStyle =
    | 'professional' | 'friendly' | 'energetic' | 'calm'
    | 'german' | 'french' | 'spanish' | 'japanese' | 'sophisticated';

/**
 * Mapping of voice styles to Fish Audio voice IDs.
 * 
 * Note: These IDs should ideally come from environment config for flexibility.
 * For now, hardcoded with sensible defaults.
 */
export const VOICE_STYLE_MAP: Record<VoiceStyle, string> = {
    // English
    friendly: process.env.VOICE_FRIENDLY_ID || 'a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8',
    energetic: process.env.VOICE_ENERGETIC_ID || 'f9e8d7c6-b5a4-9382-7160-504f3e2d1c0b',
    professional: process.env.VOICE_AUTHORITATIVE_ID || 'global-pro-001-abc123def456ghi789',
    calm: process.env.VOICE_EXPRESSIVE_ID || 'expressive-emo-002-9876543210fedcba',

    // International
    german: process.env.VOICE_GERMAN_ID || 'de-de-voice-001-4f8e9d7c6b5a49382716',
    french: process.env.VOICE_FRENCH_ID || 'fr-fr-voice-002-9a8b7c6d5e4f3210',
    spanish: process.env.VOICE_SPANISH_ID || 'es-es-voice-003-0f1e2d3c4b5a6978',
    japanese: process.env.VOICE_JAPANESE_ID || 'ja-jp-voice-004-5f6e7d8c9b0a1234',
    sophisticated: process.env.VOICE_SOPHISTICATED_ID || '11223344-5566-7788-99aa-bbccddeeff00'
};

/**
 * Resolves the final voice ID to use for TTS.
 * 
 * Priority:
 * 1. Explicit voiceId (highest priority - user override)
 * 2. Voice style mapping
 * 3. Default to FISH_AUDIO_VOICE_ID from env
 * 4. Fallback to professional hardcoded ID
 * 
 * @param style - Optional high-level voice style
 * @param explicitVoiceId - Optional explicit voice ID override
 * @returns The Fish Audio voice ID to use
 */
export function resolveVoiceId(style?: VoiceStyle, explicitVoiceId?: string): string {
    // 1. Explicit ID always wins
    if (explicitVoiceId) {
        return explicitVoiceId;
    }

    // 2. Map style to ID
    const styleId = VOICE_STYLE_MAP[style as VoiceStyle];
    if (styleId) {
        return styleId;
    }

    // 3. Fallback to Promo Default -> General Default -> Hardcoded Professional
    return process.env.FISH_AUDIO_PROMO_VOICE_ID ||
        process.env.FISH_AUDIO_VOICE_ID ||
        VOICE_STYLE_MAP.professional;
}
